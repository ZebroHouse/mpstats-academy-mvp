// apps/web/src/lib/partner/__tests__/signature.test.ts
import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyPartnerSignature, partnerCanonicalString } from '../signature';

const SECRET = 'test-secret';
const NOW = 1_000_000;
function sign(f: { email: string; phone?: string; name?: string; moduleCode?: string; exp: number }) {
  return createHmac('sha256', SECRET).update(partnerCanonicalString(f)).digest('hex');
}

describe('verifyPartnerSignature', () => {
  const base = { email: 'a@b.com', phone: '+79990001122', name: 'Иван', moduleCode: 'auto_bidder', exp: NOW + 60 };
  it('accepts a valid, unexpired signature', () => {
    expect(verifyPartnerSignature({ ...base, sig: sign(base) }, SECRET, NOW)).toBe(true);
  });
  it('rejects a tampered email', () => {
    expect(verifyPartnerSignature({ ...base, email: 'evil@x.com', sig: sign(base) }, SECRET, NOW)).toBe(false);
  });
  it('rejects an expired signature', () => {
    const e = { ...base, exp: NOW - 1 };
    expect(verifyPartnerSignature({ ...e, sig: sign(e) }, SECRET, NOW)).toBe(false);
  });
  it('rejects exp too far in the future (> 600s)', () => {
    const f = { ...base, exp: NOW + 601 };
    expect(verifyPartnerSignature({ ...f, sig: sign(f) }, SECRET, NOW)).toBe(false);
  });
  it('rejects empty secret', () => {
    expect(verifyPartnerSignature({ ...base, sig: sign(base) }, '', NOW)).toBe(false);
  });
  it('handles missing optional fields', () => {
    const m = { email: 'a@b.com', exp: NOW + 60 };
    expect(verifyPartnerSignature({ ...m, sig: sign(m) }, SECRET, NOW)).toBe(true);
  });
});
