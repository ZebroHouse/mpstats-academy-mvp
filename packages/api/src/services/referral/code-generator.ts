/**
 * Ambassador referral code generator (Phase 60).
 *
 * Produces codes of shape `AMB-XXXXXX` where the 6-char suffix is drawn from a
 * Crockford-style alphabet (no I, O, 0, 1 to avoid visual confusion). The
 * resulting code satisfies the SHAPE_REGEX in `./attribution.ts`.
 *
 * Collision handling is the caller's responsibility — the `ReferralCode.code`
 * column has a UNIQUE constraint; on collision, regenerate.
 */

import { randomInt } from 'crypto';
import { prisma } from '@mpstats/db/client';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SUFFIX_LENGTH = 6;
const PREFIX = 'AMB-';

export function generateAmbassadorCode(): string {
  let suffix = '';
  for (let i = 0; i < SUFFIX_LENGTH; i++) {
    suffix += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return `${PREFIX}${suffix}`;
}

/**
 * Personal referral code generator (Phase 53A). Shape `REF-XXXXXX` where the
 * 6-char suffix uses the same Crockford-style alphabet minus `L` — kept
 * byte-identical to the historical `apps/web` generator so every user code
 * (old backfilled + new) shares one format, and `code-resolver` keeps matching
 * the `REF-` legacy branch.
 */
const USER_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const USER_PREFIX = 'REF-';

export function generateUserReferralCode(): string {
  let suffix = '';
  for (let i = 0; i < SUFFIX_LENGTH; i++) {
    suffix += USER_ALPHABET[randomInt(0, USER_ALPHABET.length)];
  }
  return `${USER_PREFIX}${suffix}`;
}

/**
 * Return the user's personal referral code, generating and persisting one on
 * first read if it is still null. This is the single runtime choke-point that
 * guarantees every authenticated user has a code — the original Phase 53A
 * rollout only backfilled pre-existing users and never wired a per-user
 * assignment for anyone registering afterwards, so 387 post-rollout users sat
 * with `referralCode = null` and saw the «доступен после подтверждения email»
 * placeholder forever. Idempotent and race-safe: only sets the code while it is
 * still null (`updateMany` guard), retries on the `@unique` collision.
 */
export async function ensureUserReferralCode(userId: string): Promise<string> {
  const existing = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });
  if (existing?.referralCode) return existing.referralCode;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateUserReferralCode();
    try {
      const res = await prisma.userProfile.updateMany({
        where: { id: userId, referralCode: null },
        data: { referralCode: code },
      });
      if (res.count === 1) return code;
    } catch {
      // Unique collision on referralCode — regenerate and retry.
      continue;
    }
    // count === 0 → a concurrent request already assigned a code; return it.
    const now = await prisma.userProfile.findUnique({
      where: { id: userId },
      select: { referralCode: true },
    });
    if (now?.referralCode) return now.referralCode;
  }
  throw new Error(`Could not assign referral code for user ${userId}`);
}
