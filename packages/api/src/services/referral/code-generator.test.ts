import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindUnique = vi.hoisted(() => vi.fn());
const mockUpdateMany = vi.hoisted(() => vi.fn());

vi.mock('@mpstats/db/client', () => ({
  prisma: {
    userProfile: { findUnique: mockFindUnique, updateMany: mockUpdateMany },
  },
}));

import {
  generateUserReferralCode,
  ensureUserReferralCode,
} from './code-generator';

const REF_SHAPE = /^REF-[A-HJ-NP-Z2-9]{6}$/;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('generateUserReferralCode', () => {
  it('produces REF- + 6 chars from the safe alphabet (no I, L, O, 0, 1)', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateUserReferralCode()).toMatch(REF_SHAPE);
    }
  });
});

describe('ensureUserReferralCode', () => {
  it('returns the existing code without writing', async () => {
    mockFindUnique.mockResolvedValueOnce({ referralCode: 'REF-AAA111' });
    const code = await ensureUserReferralCode('user-1');
    expect(code).toBe('REF-AAA111');
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('generates and persists a code when the user has none', async () => {
    mockFindUnique.mockResolvedValueOnce({ referralCode: null });
    mockUpdateMany.mockResolvedValueOnce({ count: 1 });
    const code = await ensureUserReferralCode('user-1');
    expect(code).toMatch(REF_SHAPE);
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: 'user-1', referralCode: null },
      data: { referralCode: code },
    });
  });

  it('retries on a unique collision then succeeds', async () => {
    mockFindUnique.mockResolvedValueOnce({ referralCode: null });
    mockUpdateMany
      .mockRejectedValueOnce(new Error('Unique constraint failed'))
      .mockResolvedValueOnce({ count: 1 });
    const code = await ensureUserReferralCode('user-1');
    expect(code).toMatch(REF_SHAPE);
    expect(mockUpdateMany).toHaveBeenCalledTimes(2);
  });

  it('returns the concurrently-assigned code when its own write is a no-op', async () => {
    mockFindUnique
      .mockResolvedValueOnce({ referralCode: null }) // initial read
      .mockResolvedValueOnce({ referralCode: 'REF-CONCUR' }); // re-read after count 0
    mockUpdateMany.mockResolvedValueOnce({ count: 0 });
    const code = await ensureUserReferralCode('user-1');
    expect(code).toBe('REF-CONCUR');
  });
});
