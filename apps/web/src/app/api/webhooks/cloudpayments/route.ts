import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { prisma } from '@mpstats/db/client';
import { verifyCloudPaymentsHmac } from '@/lib/cloudpayments/hmac';
import {
  handlePaymentSuccess,
  handlePaymentFailure,
  handleCancellation,
  handleRecurrentEvent,
  handleCheck,
  enrichPayloadWithDbLookup,
} from '@/lib/cloudpayments/subscription-service';
import {
  parseWebhookBody,
  normalizePaymentEvent,
  normalizeRecurrentEvent,
  type RawWebhookPayload,
} from '@/lib/cloudpayments/parse-webhook';
import type { CloudPaymentsResponse } from '@/lib/cloudpayments/types';

export const dynamic = 'force-dynamic';

const OK: CloudPaymentsResponse = { code: 0 };
const REJECT: CloudPaymentsResponse = { code: 13 };

type CloudPaymentsEventType =
  | 'check'
  | 'pay'
  | 'fail'
  | 'refund'
  | 'cancel'
  | 'recurrent';

function resolveEventType(
  url: string,
  payload: RawWebhookPayload,
): CloudPaymentsEventType {
  try {
    const typeParam = new URL(url).searchParams.get('type');
    if (
      typeParam &&
      (['check', 'pay', 'fail', 'refund', 'cancel', 'recurrent'] as const).includes(
        typeParam as CloudPaymentsEventType,
      )
    ) {
      return typeParam as CloudPaymentsEventType;
    }
  } catch {
    // fall through
  }

  if (payload.Id && payload.SuccessfulTransactionsNumber !== undefined) {
    return 'recurrent';
  }
  if (payload.OperationType === 'Refund') return 'refund';
  if (payload.Status === 'Completed') return 'pay';
  if (payload.Status === 'Declined') return 'fail';
  return 'check';
}

function mapEventToPaymentStatus(
  eventType: CloudPaymentsEventType,
): 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED' {
  switch (eventType) {
    case 'pay':
      return 'COMPLETED';
    case 'fail':
    case 'cancel':
      return 'FAILED';
    case 'refund':
      return 'REFUNDED';
    case 'check':
    case 'recurrent':
    default:
      return 'PENDING';
  }
}

export async function POST(request: NextRequest) {
  let rawBody: string;

  try {
    rawBody = await request.text();
  } catch {
    console.error('[CloudPayments] Failed to read request body');
    return NextResponse.json(REJECT, { status: 400 });
  }

  // --- HMAC verification ---
  const hmacHeader = request.headers.get('Content-HMAC') ?? '';
  if (!verifyCloudPaymentsHmac(rawBody, hmacHeader)) {
    const ip =
      request.headers.get('x-forwarded-for') ??
      request.headers.get('x-real-ip') ??
      'unknown';
    console.warn(`[CloudPayments] Invalid HMAC signature from IP: ${ip}`);
    return NextResponse.json(REJECT, { status: 403 });
  }

  // --- Parse payload ---
  const payload = parseWebhookBody(rawBody);
  if (!payload) {
    console.error('[CloudPayments] Empty or unparseable payload');
    return NextResponse.json(REJECT, { status: 400 });
  }

  const eventType = resolveEventType(request.url, payload);

  // Attach raw payload to Sentry context so we can debug future field-name drift
  // without having to add temporary logging.
  Sentry.setTag('cp.event_type', eventType);
  Sentry.setContext('cp.payload', payload);

  console.log(
    `[CloudPayments] ${eventType} payload received (keys: ${Object.keys(payload).join(',')})`,
  );

  return await Sentry.startSpan(
    { name: `cp.webhook.${eventType}`, op: 'webhook.cloudpayments' },
    async () => {
      try {
        // --- Recurrent (subscription notification) — entirely separate schema ---
        if (eventType === 'recurrent') {
          const event = normalizeRecurrentEvent(payload);
          if (!event) {
            console.error(
              '[CloudPayments] recurrent payload missing required fields',
            );
            // Always return OK to prevent CP retry storms — log and move on.
            return NextResponse.json(OK);
          }
          await handleRecurrentEvent(event);
          return NextResponse.json(OK);
        }

        // CP recurrent attempts arrive without `InvoiceId` (only `SubscriptionId`),
        // so before the pure normalizer runs we resolve our id via DB lookup on
        // `cpSubscriptionId`. See subscription-service for full context.
        const enrichedPayload = await enrichPayloadWithDbLookup(payload);

        // --- Check event: pre-payment validation ---
        if (eventType === 'check') {
          const event = normalizePaymentEvent(enrichedPayload);
          if (!event) {
            console.warn(
              '[CloudPayments] check payload missing required fields, declining',
            );
            return NextResponse.json(REJECT);
          }
          // Log "reached the payment widget" for the sales client registry.
          // Best-effort + decoupled from billing — must never affect the CP
          // response or the check outcome.
          void prisma.checkoutAttempt
            .create({
              data: {
                userId: event.accountId || null,
                subscriptionId: event.ourSubscriptionId,
              },
            })
            .catch((e) => console.error('[CloudPayments] checkoutAttempt log failed:', e));

          const accepted = await handleCheck(
            event.accountId,
            event.ourSubscriptionId,
          );
          return NextResponse.json(accepted ? OK : REJECT);
        }

        // --- Payment events (pay/fail/refund/cancel) ---
        const event = normalizePaymentEvent(enrichedPayload);
        if (!event) {
          console.error(
            `[CloudPayments] ${eventType} payload missing required fields`,
          );
          return NextResponse.json(OK); // accept to avoid retries
        }

        Sentry.setTag('cp.tx_id', event.cpTransactionId);

        // --- Idempotency check ---
        const existing = await prisma.payment.findUnique({
          where: { cloudPaymentsTxId: event.cpTransactionId },
        });

        let paymentId: string;

        if (existing && existing.status === 'COMPLETED' && eventType === 'pay') {
          console.info(
            `[CloudPayments] Duplicate pay event for txId=${event.cpTransactionId}, skipping update`,
          );
          paymentId = existing.id;
        } else {
          const status = mapEventToPaymentStatus(eventType);

          const payment = await prisma.payment.upsert({
            where: { cloudPaymentsTxId: event.cpTransactionId },
            create: {
              subscriptionId: event.ourSubscriptionId,
              amount: Math.round(event.amount),
              status,
              cloudPaymentsTxId: event.cpTransactionId,
              paidAt: status === 'COMPLETED' ? event.paidAt : null,
            },
            update: {
              status,
              ...(status === 'COMPLETED' && event.paidAt
                ? { paidAt: event.paidAt }
                : {}),
            },
          });

          paymentId = payment.id;
        }

        // --- Audit log ---
        await prisma.paymentEvent.create({
          data: {
            paymentId,
            type: eventType,
            payload: JSON.parse(JSON.stringify(payload)),
          },
        });

        // --- Subscription lifecycle dispatch ---
        switch (eventType) {
          case 'pay':
            await handlePaymentSuccess(event.ourSubscriptionId, {
              id: paymentId,
              amount: event.amount,
              cpSubscriptionId: event.cpSubscriptionId,
            });
            break;
          case 'fail':
            await handlePaymentFailure(event.ourSubscriptionId);
            break;
          case 'cancel':
            await handleCancellation(event.ourSubscriptionId);
            break;
          case 'refund':
            // Payment already marked REFUNDED above. No subscription change.
            break;
        }

        return NextResponse.json(OK);
      } catch (error) {
        Sentry.captureException(error);
        console.error('[CloudPayments] Webhook processing error:', error);
        // Always 200 OK to prevent CP retry storms.
        return NextResponse.json(OK);
      }
    },
  );
}
