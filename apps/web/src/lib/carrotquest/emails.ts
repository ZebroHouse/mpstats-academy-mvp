import * as Sentry from '@sentry/nextjs';
import { cq } from './client';
import { prisma } from '@mpstats/db/client';

/**
 * Email helper functions for transactional notifications via Carrot Quest.
 *
 * Pattern: setUserProps (data on lead) → trackEvent (trigger only, no params).
 * CQ automation rules read properties from the lead card, not from event params.
 *
 * Each function checks the `email_notifications_enabled` feature flag,
 * then fires a CQ event (fire-and-forget) — but failures bubble up to Sentry
 * so silent CQ outages don't drop transactional emails unnoticed (the symptom
 * we hit on bakaresh@yandex.ru on 2026-04-23).
 */

function reportEmailError(stage: string, userId: string, error: unknown): void {
  console.error(`[Email] ${stage} error for ${userId}:`, error);
  Sentry.captureException(error, {
    tags: { area: 'carrotquest-email', stage },
    extra: { userId },
  });
}

/** Format Date as "DD.MM.YYYY HH:MM" in Moscow timezone for user-facing emails */
function formatDateRu(date: Date): string {
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  });
}

// --- Feature flag cache (avoid DB query on every email) ---

let cachedEnabled: boolean | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 60_000; // 60 seconds

async function isEmailEnabled(): Promise<boolean> {
  const now = Date.now();
  if (cachedEnabled !== null && now < cacheExpiry) {
    return cachedEnabled;
  }

  try {
    const flag = await prisma.featureFlag.findUnique({
      where: { key: 'email_notifications_enabled' },
    });
    cachedEnabled = flag?.enabled ?? false;
    cacheExpiry = now + CACHE_TTL_MS;
    return cachedEnabled;
  } catch (error) {
    console.error('[Email] Failed to check feature flag:', error);
    return false;
  }
}

// --- Email functions ---

export async function sendPaymentSuccessEmail(
  userId: string,
  data: { amount: number; courseName?: string; periodEnd: Date },
): Promise<void> {
  try {
    if (!(await isEmailEnabled())) return;

    await cq.setUserProps(userId, {
      pa_amount: String(data.amount),
      pa_course_name: data.courseName ?? '',
      pa_period_end: formatDateRu(data.periodEnd),
      pa_period_end_tech: data.periodEnd.toISOString(),
    });
    await cq.trackEvent(userId, 'pa_payment_success');

    console.log(`[Email] Payment success event sent for user ${userId}`);
  } catch (error) {
    reportEmailError('sendPaymentSuccessEmail', userId, error);
  }
}

export async function sendPaymentFailedEmail(
  userId: string,
  data: { courseName?: string },
): Promise<void> {
  try {
    if (!(await isEmailEnabled())) return;

    await cq.setUserProps(userId, {
      pa_course_name: data.courseName ?? '',
    });
    await cq.trackEvent(userId, 'pa_payment_failed');

    console.log(`[Email] Payment failed event sent for user ${userId}`);
  } catch (error) {
    reportEmailError('sendPaymentFailedEmail', userId, error);
  }
}

export async function sendCancellationEmail(
  userId: string,
  data: { courseName?: string; accessUntil: Date },
): Promise<void> {
  try {
    if (!(await isEmailEnabled())) return;

    await cq.setUserProps(userId, {
      pa_course_name: data.courseName ?? '',
      pa_access_until: formatDateRu(data.accessUntil),
      pa_access_until_tech: data.accessUntil.toISOString(),
    });
    await cq.trackEvent(userId, 'pa_subscription_cancelled');

    console.log(`[Email] Cancellation event sent for user ${userId}`);
  } catch (error) {
    reportEmailError('sendCancellationEmail', userId, error);
  }
}

export async function sendWelcomeEmail(
  userId: string,
  data: { name: string; email: string; phone?: string },
): Promise<void> {
  try {
    if (!(await isEmailEnabled())) return;

    await cq.setUserProps(userId, {
      '$email': data.email,
      '$name': data.name,
      pa_name: data.name,
      ...(data.phone ? { '$phone': data.phone, pa_phone: data.phone } : {}),
    });
    await cq.trackEvent(userId, 'pa_registration_completed');

    console.log(`[Email] Welcome event + props sent for user ${userId}`);
  } catch (error) {
    reportEmailError('sendWelcomeEmail', userId, error);
  }
}

export async function sendSubscriptionExpiringEmail(
  userId: string,
  data: { courseName?: string; periodEnd: Date },
): Promise<void> {
  try {
    if (!(await isEmailEnabled())) return;

    await cq.setUserProps(userId, {
      pa_course_name: data.courseName ?? '',
      pa_access_until: formatDateRu(data.periodEnd),
      pa_access_until_tech: data.periodEnd.toISOString(),
    });
    await cq.trackEvent(userId, 'pa_subscription_expiring');

    console.log(`[Email] Subscription expiring event sent for user ${userId}`);
  } catch (error) {
    reportEmailError('sendSubscriptionExpiringEmail', userId, error);
  }
}

export async function sendInactiveEmail(
  userId: string,
  days: 7 | 14 | 30,
): Promise<void> {
  try {
    if (!(await isEmailEnabled())) return;

    const eventMap = { 7: 'pa_inactive_7', 14: 'pa_inactive_14', 30: 'pa_inactive_30' } as const;
    await cq.trackEvent(userId, eventMap[days]);

    console.log(`[Email] Inactive ${days}d event sent for user ${userId}`);
  } catch (error) {
    reportEmailError(`sendInactiveEmail-${days}d`, userId, error);
  }
}

/**
 * MPSTATS partner-entry lead. Records source + module and fires pa_partner_entry.
 * Always runs (lead quality matters even if the email toggle is off). Best-effort.
 */
export async function firePartnerEntryLead(
  userId: string,
  data: { email: string; name?: string; phone?: string; moduleCode?: string },
): Promise<void> {
  try {
    await cq.setUserProps(userId, {
      '$email': data.email,
      ...(data.name ? { '$name': data.name, pa_name: data.name } : {}),
      ...(data.phone ? { '$phone': data.phone, pa_phone: data.phone } : {}),
      pa_partner_source: 'mpstats',
      ...(data.moduleCode ? { pa_partner_module: data.moduleCode } : {}),
    });
    await cq.trackEvent(userId, 'pa_partner_entry');
  } catch (error) {
    reportEmailError('firePartnerEntryLead', userId, error);
  }
}

/**
 * Sends a same-domain confirm/magic-link via a DEDICATED pa_partner_magic_link CQ event.
 * Used for existing-user magic-link login and the verify-email banner resend.
 *
 * Why not pa_doi: pa_doi's CQ rule is once-per-lead (DOI), so repeated re-entry magic-links
 * get suppressed. pa_partner_magic_link has its own CQ rule configured without once-only
 * semantics — fires every time. Discovered in staging UAT 2026-06-11.
 *
 * ⚠ Requires CQ team to create the pa_partner_magic_link automation rule before going live.
 * Best-effort.
 */
export async function sendPartnerConfirmEmail(
  userId: string,
  data: { email: string; name?: string; confirmUrl: string },
): Promise<void> {
  try {
    if (!(await isEmailEnabled())) return;
    await cq.setUserProps(userId, {
      '$email': data.email,
      ...(data.name ? { '$name': data.name, pa_name: data.name } : {}),
      pa_partner_magic_link: data.confirmUrl,
    });
    await cq.trackEvent(userId, 'pa_partner_magic_link');
  } catch (error) {
    reportEmailError('sendPartnerConfirmEmail', userId, error);
  }
}
