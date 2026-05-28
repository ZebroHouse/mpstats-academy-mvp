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
