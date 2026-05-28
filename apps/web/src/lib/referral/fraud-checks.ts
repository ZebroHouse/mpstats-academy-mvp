/**
 * Anti-fraud checks for referral package issuance (Phase 53A, D7; Phase 60, D-08).
 *
 * Returns:
 *  - 'BLOCKED_SELF_REF' if referrer === friend (by userId or email)
 *  - 'PENDING_REVIEW' if referrer has ≥5 referrals in last 7 days
 *  - 'OK' otherwise
 *
 * Phase 60 (D-08): `referrerId` may be `null` for AMBASSADOR codes (no peer
 * referrer). Self-ref + cap-per-week checks are meaningless without a referrer
 * — short-circuit to `OK` without touching prisma/supabase.
 */

import { prisma } from '@mpstats/db/client';
import { getSupabaseAdmin } from '@/lib/auth/supabase-admin';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const CAP_PER_WEEK = 5;

export type FraudVerdict =
  | { verdict: 'OK' }
  | { verdict: 'BLOCKED_SELF_REF' }
  | { verdict: 'PENDING_REVIEW' };

export interface CheckArgs {
  referrerId: string | null;
  friendId: string;
}

export async function checkFraudSignals(args: CheckArgs): Promise<FraudVerdict> {
  // 0. Ambassador branch (Phase 60, D-08): no referrer user → skip all checks.
  if (args.referrerId === null) {
    return { verdict: 'OK' };
  }

  // 1. Self-ref by userId — short-circuit, не трогать Supabase
  if (args.referrerId === args.friendId) {
    return { verdict: 'BLOCKED_SELF_REF' };
  }

  // 2. Self-ref by email
  const supabase = getSupabaseAdmin();
  const [ref, fr] = await Promise.all([
    supabase.auth.admin.getUserById(args.referrerId),
    supabase.auth.admin.getUserById(args.friendId),
  ]);
  const refEmail = ref.data?.user?.email?.toLowerCase();
  const frEmail = fr.data?.user?.email?.toLowerCase();
  if (refEmail && frEmail && refEmail === frEmail) {
    return { verdict: 'BLOCKED_SELF_REF' };
  }

  // 3. Cap 5/week — count Referral rows for this referrer in last 7 days,
  //    excluding only BLOCKED_SELF_REF (PENDING_REVIEW counts toward cap).
  const weekAgo = new Date(Date.now() - WEEK_MS);
  const recentCount = await prisma.referral.count({
    where: {
      referrerUserId: args.referrerId,
      createdAt: { gt: weekAgo },
      status: { notIn: ['BLOCKED_SELF_REF'] },
    },
  });
  if (recentCount >= CAP_PER_WEEK) {
    return { verdict: 'PENDING_REVIEW' };
  }

  return { verdict: 'OK' };
}
