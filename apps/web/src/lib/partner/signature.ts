// apps/web/src/lib/partner/signature.ts
import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_TTL_SECONDS = 600;

export interface PartnerSignedFields {
  email: string;
  phone?: string;
  name?: string;
  moduleCode?: string;
  exp: number;
}

export function partnerCanonicalString(f: PartnerSignedFields): string {
  return [f.email, f.phone ?? '', f.name ?? '', f.moduleCode ?? '', String(f.exp)].join('|');
}

function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ba.length === 0 || ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function verifyPartnerSignature(
  input: PartnerSignedFields & { sig: string },
  secret: string,
  nowSeconds: number,
): boolean {
  if (!secret || !input.sig || !Number.isFinite(input.exp)) return false;
  if (input.exp < nowSeconds) return false;
  if (input.exp > nowSeconds + MAX_TTL_SECONDS) return false;
  const expected = createHmac('sha256', secret).update(partnerCanonicalString(input)).digest('hex');
  return safeEqualHex(expected, input.sig);
}
