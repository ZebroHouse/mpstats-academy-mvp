/**
 * Referral issuance orchestrator (Phase 53A + Phase 60).
 *
 * Called from /auth/confirm and Yandex callback after DOI/OAuth success.
 *
 * Phase 53A (user-to-user / EXTERNAL_USER):
 *   1. Resolve referrer by code
 *   2. Run anti-fraud checks
 *   3. Read mode flag (i1 default, i2 if referral_pay_gated=true)
 *   4. Create Referral row
 *   5. Issue ReferralBonusPackage (i1 only — i2 issues on payment via webhook)
 *   6. Always create Trial Subscription for friend (14d in i1, 7d in i2)
 *
 * Phase 60 (admin AMBASSADOR codes, D-01..D-09):
 *   1. Resolve via unified resolveReferralCode (ambassador-first, user fallback)
 *   2. D-03 5-min stale-user guard (silent skip)
 *   3. Reused null-safe checkFraudSignals (D-08)
 *   4. Race-safe transaction: increment ReferralCode.currentUses + post-check
 *      vs maxUses (D-04) → rollback on overflow
 *   5. No ReferralBonusPackage (D-02 — ambassador has no platform account)
 *   6. TRIAL Subscription with code-specified refereeTrialDays (D-01)
 *   7. CQ event pa_ambassador_signup + pa_referral_source prop (D-09)
 *
 * All in single transaction. Fire-and-forget Sentry on errors.
 */

import * as Sentry from '@sentry/nextjs';
import { prisma } from '@mpstats/db/client';
import {
  isFeatureEnabled,
  createTrialSubscription,
  resolveReferralCode,
  resolveReferralCodeRaw,
} from '@mpstats/api';
import { checkFraudSignals } from './fraud-checks';
import { cq } from '@/lib/carrotquest/client';

const I1_TRIAL_DAYS = 14;
const I2_TRIAL_DAYS = 7;
const PACKAGE_DAYS = 14;
const STALE_USER_WINDOW_MS = 5 * 60 * 1000; // D-03: 5-min fresh-signup window

/** "DD.MM.YYYY HH:MM" в МСК — формат Phase 33 для CQ-шаблонов. */
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

export interface IssueArgs {
  refCode: string;
  friendUserId: string;
}

export async function issueReferralOnSignup(args: IssueArgs): Promise<void> {
  try {
    const resolved = await resolveReferralCode(args.refCode);

    if (resolved === null) {
      // Distinguish "exists-but-invalid" from "truly unknown"
      const raw = await resolveReferralCodeRaw(args.refCode);
      if (raw) {
        Sentry.captureMessage('referral.ambassador.limit_hit', {
          level: 'info',
          extra: {
            code: args.refCode,
            isActive: raw.isActive,
            expiresAt: raw.expiresAt,
            currentUses: raw.currentUses,
            maxUses: raw.maxUses,
            friendUserId: args.friendUserId,
          },
        });
      } else {
        Sentry.captureMessage('referral.unknown_code', {
          level: 'info',
          extra: { refCode: args.refCode, friendUserId: args.friendUserId },
        });
      }
      return;
    }

    if (resolved.type === 'ambassador') {
      await handleAmbassadorBranch(args, resolved.code);
      return;
    }

    // Phase 53A user-to-user branch — unchanged from pre-Phase-60 behavior.
    await handleUserBranch(args, resolved.userProfile);
  } catch (err) {
    Sentry.captureException(err, {
      tags: { area: 'referral', stage: 'issue-on-signup' },
      extra: { refCode: args.refCode, friendUserId: args.friendUserId },
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 60 — AMBASSADOR branch
// ─────────────────────────────────────────────────────────────────────────────

interface AmbassadorCode {
  id: string;
  label: string;
  refereeTrialDays: number;
  maxUses: number | null;
}

async function handleAmbassadorBranch(
  args: IssueArgs,
  code: AmbassadorCode,
): Promise<void> {
  // D-03: friend must be a freshly-registered user. If older than 5 min,
  // someone is re-using a referral link on an existing session — silent skip.
  const friend = await prisma.userProfile.findUnique({
    where: { id: args.friendUserId },
    select: { id: true, name: true, createdAt: true },
  });
  if (!friend || Date.now() - friend.createdAt.getTime() > STALE_USER_WINDOW_MS) {
    Sentry.captureMessage('referral.ambassador.stale_user', {
      level: 'info',
      extra: {
        code: code.id,
        friendUserId: args.friendUserId,
        friendCreatedAt: friend?.createdAt ?? null,
      },
    });
    return;
  }

  // D-08: null-safe fraud check (skips self-ref + cap-per-week for ambassador).
  const fraud = await checkFraudSignals({
    referrerId: null,
    friendId: args.friendUserId,
  });

  // BLOCKED_SELF_REF impossible for null referrer; treat anything non-OK as
  // PENDING_REVIEW (room for future same-IP/device signals).
  const referralStatus: 'CONVERTED' | 'PENDING_REVIEW' =
    fraud.verdict === 'OK' ? 'CONVERTED' : 'PENDING_REVIEW';

  try {
    await prisma.$transaction(async (tx: any) => {
      await tx.referral.create({
        data: {
          code: args.refCode,
          codeType: 'AMBASSADOR',
          referrerUserId: null,
          referredUserId: args.friendUserId,
          codeId: code.id,
          status: referralStatus,
          conversionTrigger: referralStatus === 'CONVERTED' ? 'registration' : null,
          convertedAt: referralStatus === 'CONVERTED' ? new Date() : null,
        },
      });

      // D-02: NO ReferralBonusPackage for AMBASSADOR.

      if (referralStatus === 'CONVERTED') {
        await createTrialSubscription({
          userId: args.friendUserId,
          durationDays: code.refereeTrialDays,
          prismaClient: tx,
        });

        // D-04: race-safe increment. Atomic update returns the *post-increment*
        // currentUses. If another tx already incremented and we now exceed
        // maxUses, throw to roll the whole transaction back.
        const updated = await tx.referralCode.update({
          where: { id: code.id },
          data: { currentUses: { increment: 1 } },
        });
        if (updated.maxUses !== null && updated.currentUses > updated.maxUses) {
          throw new Error('AMBASSADOR_RACE_OVERFLOW');
        }
      }
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'AMBASSADOR_RACE_OVERFLOW') {
      Sentry.captureMessage('referral.ambassador.race_overflow', {
        level: 'warning',
        extra: {
          code: args.refCode,
          codeId: code.id,
          friendUserId: args.friendUserId,
        },
      });
      return; // rollback complete — no CQ events
    }
    throw err; // outer handler captures generic errors
  }

  // CQ events fire only for CONVERTED outcomes. PENDING_REVIEW yields a row
  // but no Subscription and no analytics signal until admin reviews.
  if (referralStatus !== 'CONVERTED') return;

  try {
    const trialUntil = new Date(
      Date.now() + code.refereeTrialDays * 24 * 60 * 60 * 1000,
    );
    await cq.setUserProps(args.friendUserId, {
      pa_referral_source: code.label,
      pa_referral_trial_days: code.refereeTrialDays,
      pa_referral_trial_until: formatDateRu(trialUntil),
      pa_referral_trial_until_tech: trialUntil.toISOString(),
    });
    await cq.trackEvent(args.friendUserId, 'pa_ambassador_signup');
  } catch (cqError) {
    Sentry.captureException(cqError, {
      tags: { area: 'referral', stage: 'cq' },
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 53A — user-to-user branch (unchanged behavior)
// ─────────────────────────────────────────────────────────────────────────────

async function handleUserBranch(
  args: IssueArgs,
  referrer: { id: string; name: string | null },
): Promise<void> {
  // Mode flag
  const i2Mode = await isFeatureEnabled('referral_pay_gated');

  // Anti-fraud
  const fraud = await checkFraudSignals({
    referrerId: referrer.id,
    friendId: args.friendUserId,
  });

  const trialDays = i2Mode ? I2_TRIAL_DAYS : I1_TRIAL_DAYS;

  let referralStatus: 'CONVERTED' | 'PENDING' | 'BLOCKED_SELF_REF' | 'PENDING_REVIEW';
  let issuePackage = false;

  if (fraud.verdict === 'BLOCKED_SELF_REF') {
    referralStatus = 'BLOCKED_SELF_REF';
    Sentry.captureMessage('referral.fraud_signal', {
      level: 'info',
      tags: { kind: 'self_ref' },
      extra: { referrerId: referrer.id, friendId: args.friendUserId },
    });
  } else if (fraud.verdict === 'PENDING_REVIEW') {
    referralStatus = 'PENDING_REVIEW';
    Sentry.captureMessage('referral.fraud_signal', {
      level: 'info',
      tags: { kind: 'cap_reached' },
      extra: { referrerId: referrer.id, friendId: args.friendUserId },
    });
  } else {
    referralStatus = i2Mode ? 'PENDING' : 'CONVERTED';
    issuePackage = !i2Mode;
  }

  await prisma.$transaction(async (tx: any) => {
    const referral = await tx.referral.create({
      data: {
        code: args.refCode,
        codeType: 'EXTERNAL_USER',
        referrerUserId: referrer.id,
        referredUserId: args.friendUserId,
        status: referralStatus,
        conversionTrigger:
          !i2Mode && referralStatus === 'CONVERTED' ? 'registration' : null,
        convertedAt:
          !i2Mode && referralStatus === 'CONVERTED' ? new Date() : null,
      },
    });

    if (issuePackage) {
      await tx.referralBonusPackage.create({
        data: {
          ownerUserId: referrer.id,
          sourceReferralId: referral.id,
          days: PACKAGE_DAYS,
          status: 'PENDING',
        },
      });
    }

    await createTrialSubscription({
      userId: args.friendUserId,
      durationDays: trialDays,
      prismaClient: tx,
    });
  });

  // CQ events (best-effort) — Phase 33 pattern.
  try {
    const friend = await prisma.userProfile.findUnique({
      where: { id: args.friendUserId },
      select: { name: true },
    });
    const trialUntil = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);

    await cq.setUserProps(args.friendUserId, {
      pa_referral_trial_days: trialDays,
      pa_referral_trial_until: formatDateRu(trialUntil),
      pa_referral_trial_until_tech: trialUntil.toISOString(),
      pa_referral_referrer_name: referrer.name ?? '',
    });
    await cq.trackEvent(args.friendUserId, 'pa_referral_trial_started');

    if (issuePackage) {
      await cq.setUserProps(referrer.id, {
        pa_referral_friend_name: friend?.name ?? '',
        pa_referral_package_days: PACKAGE_DAYS,
      });
      await cq.trackEvent(referrer.id, 'pa_referral_friend_registered');
    }
  } catch (cqError) {
    Sentry.captureException(cqError, {
      tags: { area: 'referral', stage: 'cq' },
    });
  }
}
