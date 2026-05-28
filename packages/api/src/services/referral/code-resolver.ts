/**
 * Unified referral code resolver (Phase 60, D-05).
 *
 * Lookup order:
 *   1. `ReferralCode` table (AMBASSADOR + future INTERNAL_* codes).
 *   2. Fallback to legacy `UserProfile.referralCode` (Phase 53A peer-to-peer codes).
 *
 * Returns a discriminated union so callers can branch on the source. A code
 * that exists in `ReferralCode` but fails validity checks (expired, max-uses
 * reached, disabled) resolves to `null` — callers needing to distinguish
 * "exists-but-invalid" from "unknown" should use `resolveReferralCodeRaw`.
 *
 * All inputs are uppercased + trimmed before lookup. Codes must match the
 * shape regex from `./attribution.ts`; malformed input short-circuits to
 * `null` without hitting the DB.
 */

import { prisma } from '@mpstats/db/client';
import type { ReferralCode } from '@mpstats/db';

import { isValidRefCodeShape } from './attribution';

export type ResolvedReferralCode =
  | { type: 'ambassador'; code: ReferralCode }
  | { type: 'user'; userProfile: { id: string; name: string | null } };

function isUsable(record: ReferralCode): boolean {
  if (record.codeType !== 'AMBASSADOR') return false;
  if (!record.isActive) return false;
  if (record.expiresAt !== null && record.expiresAt <= new Date()) return false;
  if (record.maxUses !== null && record.currentUses >= record.maxUses) return false;
  return true;
}

/**
 * Returns the raw `ReferralCode` row by code value (after shape validation +
 * normalization), regardless of usability. Useful for orchestrator code-paths
 * that need to log why an ambassador code was rejected (expired vs max-uses
 * vs disabled).
 */
export async function resolveReferralCodeRaw(code: string): Promise<ReferralCode | null> {
  const normalized = code.toUpperCase().trim();
  if (!isValidRefCodeShape(normalized)) return null;
  return prisma.referralCode.findUnique({ where: { code: normalized } });
}

/**
 * Resolves a code to either an ambassador-issued code, a legacy peer
 * user-code, or `null`. See module docstring for full semantics.
 */
export async function resolveReferralCode(
  code: string,
): Promise<ResolvedReferralCode | null> {
  const normalized = code.toUpperCase().trim();
  if (!isValidRefCodeShape(normalized)) return null;

  const record = await resolveReferralCodeRaw(normalized);
  if (record) {
    if (isUsable(record)) {
      return { type: 'ambassador', code: record };
    }
    return null;
  }

  const userProfile = await prisma.userProfile.findUnique({
    where: { referralCode: normalized },
    select: { id: true, name: true },
  });
  if (userProfile) {
    return { type: 'user', userProfile };
  }

  return null;
}
