import * as Sentry from '@sentry/nextjs';
import { prisma } from '@mpstats/db/client';
import {
  sendPaymentSuccessEmail,
  sendPaymentFailedEmail,
  sendCancellationEmail,
} from '@/lib/carrotquest/emails';
import { processReferralConversion } from '@/lib/referral/conversion';
import { decideRecurrentUpdate } from './decide-recurrent-update';
import type { NormalizedRecurrentEvent, RawWebhookPayload } from './parse-webhook';

/**
 * On tokenized recurrent charges CP delivers `check`/`pay`/`fail` payloads with
 * `InvoiceId: null` and only the CP-side `SubscriptionId` (`sc_xxx`) populated.
 * The pure resolver in parse-webhook.ts has no DB access, so we fall back here
 * to look up our internal Subscription by its unique `cpSubscriptionId` and
 * inject the resolved id back into the payload as `InvoiceId` — which lets the
 * existing pure normalizer succeed without further changes downstream.
 *
 * Without this fallback recurrent payments are 100% rejected at `check` →
 * CP marks the subscription `Rejected` after the very first attempt → our
 * recurrent webhook flips the row to `CANCELLED`. Discovered 2026-04-27 from
 * a real failed boevoy charge (CP `Reason: CheckResponseNotAccepted`).
 */
export async function enrichPayloadWithDbLookup(
  payload: RawWebhookPayload,
): Promise<RawWebhookPayload> {
  if (payload.InvoiceId || payload.ExternalId) return payload;
  if (payload.Data) {
    try {
      const data = JSON.parse(payload.Data) as { ourSubscriptionId?: unknown };
      if (typeof data.ourSubscriptionId === 'string' && data.ourSubscriptionId) {
        return payload;
      }
    } catch {
      // fall through to cpSubscriptionId lookup
    }
  }
  if (!payload.SubscriptionId) return payload;

  const sub = await prisma.subscription.findUnique({
    where: { cpSubscriptionId: payload.SubscriptionId },
    select: { id: true },
  });
  if (!sub) return payload;

  return { ...payload, InvoiceId: sub.id };
}

/**
 * Subscription lifecycle state machine for CloudPayments webhook events.
 *
 * All functions are non-throwing: errors are logged but never re-thrown,
 * so the webhook handler can always return {code: 0} to CloudPayments.
 */

/**
 * Handle successful payment — activate subscription with correct period dates.
 * Called on "pay" event.
 *
 * Also captures `cpSubscriptionId` (CP-side `sc_xxx`) on the first pay event
 * so subsequent recurrent webhooks can look up the subscription deterministically
 * by unique key, avoiding any guesswork via userId fallback.
 */
export async function handlePaymentSuccess(
  subscriptionId: string,
  payment: { id: string; amount: number; cpSubscriptionId?: string | null },
): Promise<void> {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    });

    if (!subscription) {
      console.error(
        `[Subscription] handlePaymentSuccess: subscription ${subscriptionId} not found (payment ${payment.id})`,
      );
      return;
    }

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setDate(periodEnd.getDate() + subscription.plan.intervalDays);

    // Only set cpSubscriptionId when CP provided one AND we haven't stored it
    // yet. Once stored, never overwrite (recurrent flow depends on stability).
    const shouldSetCpId =
      !!payment.cpSubscriptionId &&
      subscription.cpSubscriptionId !== payment.cpSubscriptionId;

    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: 'ACTIVE',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        ...(shouldSetCpId
          ? { cpSubscriptionId: payment.cpSubscriptionId }
          : {}),
      },
    });

    console.log(
      `[Subscription] Activated ${subscriptionId}, period: ${now.toISOString()} - ${periodEnd.toISOString()}${
        shouldSetCpId ? ` (cp=${payment.cpSubscriptionId})` : ''
      }`,
    );

    // Fire-and-forget: send payment success email via CQ
    sendPaymentSuccessEmail(subscription.userId, {
      amount: payment.amount,
      courseName: subscription.plan.name,
      periodEnd,
    }).catch((err) =>
      console.error('[Email] Payment success email failed:', err),
    );

    // i2 referral conversion: mark PENDING referral as CONVERTED and issue bonus package.
    // Only fires on first successful payment (status filter skips already-CONVERTED rows).
    // Must not throw — errors are captured but never re-thrown to avoid CP retry storms.
    await processReferralConversion(subscription.userId).catch((err) =>
      Sentry.captureException(err, {
        tags: { area: 'referral', stage: 'cp-pay-conversion' },
        extra: { userId: subscription.userId, subscriptionId },
      }),
    );
  } catch (error) {
    console.error(
      `[Subscription] handlePaymentSuccess error for ${subscriptionId}:`,
      error,
    );
  }
}

/**
 * Handle failed payment — transition to PAST_DUE (grace period).
 * Called on "fail" event.
 *
 * CloudPayments has built-in retry logic for failed recurrents.
 * Subscription stays PAST_DUE until CloudPayments gives up retrying
 * (typically 3 attempts over several days), then sends a cancel event.
 */
export async function handlePaymentFailure(
  subscriptionId: string,
): Promise<void> {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    });

    if (!subscription) {
      console.error(
        `[Subscription] handlePaymentFailure: subscription ${subscriptionId} not found`,
      );
      return;
    }

    // Only transition from ACTIVE or PAST_DUE. CANCELLED/EXPIRED are terminal.
    if (
      subscription.status === 'ACTIVE' ||
      subscription.status === 'PAST_DUE'
    ) {
      await prisma.subscription.update({
        where: { id: subscriptionId },
        data: { status: 'PAST_DUE' },
      });

      console.log(
        `[Subscription] Set ${subscriptionId} to PAST_DUE (was ${subscription.status})`,
      );

      // Fire-and-forget: send payment failed email via CQ
      sendPaymentFailedEmail(subscription.userId, {
        courseName: subscription.plan.name,
      }).catch((err) =>
        console.error('[Email] Payment failed email failed:', err),
      );
    } else {
      console.log(
        `[Subscription] Skipping failure for ${subscriptionId} — already ${subscription.status}`,
      );
    }
  } catch (error) {
    console.error(
      `[Subscription] handlePaymentFailure error for ${subscriptionId}:`,
      error,
    );
  }
}

/**
 * Handle cancellation — set CANCELLED with timestamp.
 * Called on "cancel" event.
 *
 * User retains access until currentPeriodEnd.
 * The EXPIRED transition happens at access-check time in Phase 20
 * (if currentPeriodEnd < now && status == CANCELLED -> treat as EXPIRED).
 */
export async function handleCancellation(
  subscriptionId: string,
): Promise<void> {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      console.error(
        `[Subscription] handleCancellation: subscription ${subscriptionId} not found`,
      );
      return;
    }

    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
      },
    });

    console.log(
      `[Subscription] Cancelled ${subscriptionId}, access until ${subscription.currentPeriodEnd.toISOString()}`,
    );

    // Fire-and-forget: send cancellation email via CQ
    sendCancellationEmail(subscription.userId, {
      courseName: undefined,
      accessUntil: subscription.currentPeriodEnd,
    }).catch((err) =>
      console.error('[Email] Cancellation email failed:', err),
    );
  } catch (error) {
    console.error(
      `[Subscription] handleCancellation error for ${subscriptionId}:`,
      error,
    );
  }
}

/**
 * Handle a CP "recurrent" subscription notification.
 *
 * The recurrent webhook is a SUBSCRIPTION lifecycle notification, not a payment
 * event. CP delivers a different schema (see NormalizedRecurrentEvent in
 * parse-webhook.ts) and may fire it for: creation, successful charges, failed
 * charges, status changes, expiry.
 *
 * Lookup strategy:
 *   1. By cpSubscriptionId (preferred — set on previous webhooks)
 *   2. By userId (most recent active/pending) — for the FIRST notification
 *      where we haven't yet captured the CP id
 */
export async function handleRecurrentEvent(
  event: NormalizedRecurrentEvent,
): Promise<void> {
  try {
    let subscription = await prisma.subscription.findUnique({
      where: { cpSubscriptionId: event.cpSubscriptionId },
      include: { plan: true },
    });

    if (!subscription) {
      subscription = await prisma.subscription.findFirst({
        where: {
          userId: event.accountId,
          status: { in: ['PENDING', 'ACTIVE', 'TRIAL', 'PAST_DUE'] },
          cpSubscriptionId: null,
        },
        orderBy: { createdAt: 'desc' },
        include: { plan: true },
      });
    }

    if (!subscription) {
      console.error(
        `[Subscription] handleRecurrentEvent: no subscription found for cp=${event.cpSubscriptionId} user=${event.accountId}`,
      );
      return;
    }

    const update = decideRecurrentUpdate(event, {
      id: subscription.id,
      status: subscription.status,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cpSubscriptionId: subscription.cpSubscriptionId,
      plan: { intervalDays: subscription.plan.intervalDays },
    });

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: update,
    });

    console.log(
      `[Subscription] Recurrent event applied to ${subscription.id} (cp=${event.cpSubscriptionId}, status=${event.cpStatus} → ${update.status})`,
    );

    // Notify the user only on actual successful recurring charges
    // (Active state with a real charge that extended the period).
    if (
      update.status === 'ACTIVE' &&
      update.currentPeriodEnd &&
      event.successCount > 0
    ) {
      sendPaymentSuccessEmail(subscription.userId, {
        amount: event.amount,
        courseName: subscription.plan.name,
        periodEnd: update.currentPeriodEnd,
      }).catch((err) =>
        console.error('[Email] Recurrent payment email failed:', err),
      );
    }
  } catch (error) {
    console.error(
      `[Subscription] handleRecurrentEvent error for cp=${event.cpSubscriptionId}:`,
      error,
    );
  }
}

/**
 * Handle check — pre-payment validation.
 * Called on "check" event BEFORE payment is processed.
 *
 * Returns true if we want to accept the payment, false to decline.
 * Validates that the user and subscription exist and are linked.
 */
export async function handleCheck(
  accountId: string,
  invoiceId: string,
): Promise<boolean> {
  try {
    // Verify user exists
    const user = await prisma.userProfile.findUnique({
      where: { id: accountId },
    });

    if (!user) {
      console.warn(
        `[Subscription] handleCheck: user ${accountId} not found, declining`,
      );
      return false;
    }

    // Verify subscription exists and belongs to user
    const subscription = await prisma.subscription.findUnique({
      where: { id: invoiceId },
    });

    if (!subscription) {
      console.warn(
        `[Subscription] handleCheck: subscription ${invoiceId} not found, declining`,
      );
      return false;
    }

    if (subscription.userId !== accountId) {
      console.warn(
        `[Subscription] handleCheck: subscription ${invoiceId} belongs to ${subscription.userId}, not ${accountId}, declining`,
      );
      return false;
    }

    // Defense in depth: if the subscription is already cancelled/refunded
    // locally but CP still tries to charge (because our cancel API call
    // failed or never ran), reject the charge here so the card is not hit.
    if (subscription.status === 'CANCELLED' || subscription.status === 'EXPIRED') {
      console.warn(
        `[Subscription] handleCheck: subscription ${invoiceId} status=${subscription.status}, declining`,
      );
      return false;
    }

    console.log(
      `[Subscription] handleCheck: accepted payment for user ${accountId}, subscription ${invoiceId}`,
    );
    return true;
  } catch (error) {
    console.error(
      `[Subscription] handleCheck error for user=${accountId} sub=${invoiceId}:`,
      error,
    );
    // On error, decline the payment (safer than accepting unknown state)
    return false;
  }
}
