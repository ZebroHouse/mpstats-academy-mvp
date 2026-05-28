import { describe, expect, it, beforeEach, vi } from 'vitest';

const { mockReferralCount, mockSupabaseAdminGetUser } = vi.hoisted(() => ({
  mockReferralCount: vi.fn(),
  mockSupabaseAdminGetUser: vi.fn(),
}));

vi.mock('@mpstats/db/client', () => ({
  prisma: { referral: { count: mockReferralCount } },
}));

vi.mock('@/lib/auth/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    auth: {
      admin: { getUserById: mockSupabaseAdminGetUser },
    },
  }),
}));

import { checkFraudSignals } from '../fraud-checks';

beforeEach(() => {
  vi.clearAllMocks();
  mockReferralCount.mockResolvedValue(0);
});

describe('checkFraudSignals', () => {
  it('blocks when referrer.userId === friend.userId', async () => {
    const result = await checkFraudSignals({ referrerId: 'u1', friendId: 'u1' });
    expect(result).toEqual({ verdict: 'BLOCKED_SELF_REF' });
  });

  it('blocks when referrer email === friend email', async () => {
    mockSupabaseAdminGetUser
      .mockResolvedValueOnce({ data: { user: { email: 'same@x.com' } } })
      .mockResolvedValueOnce({ data: { user: { email: 'same@x.com' } } });
    const result = await checkFraudSignals({ referrerId: 'u1', friendId: 'u2' });
    expect(result).toEqual({ verdict: 'BLOCKED_SELF_REF' });
  });

  it('marks PENDING_REVIEW when referrer hits cap (5 in 7d)', async () => {
    mockSupabaseAdminGetUser
      .mockResolvedValueOnce({ data: { user: { email: 'a@x.com' } } })
      .mockResolvedValueOnce({ data: { user: { email: 'b@x.com' } } });
    mockReferralCount.mockResolvedValue(5);
    const result = await checkFraudSignals({ referrerId: 'u1', friendId: 'u2' });
    expect(result).toEqual({ verdict: 'PENDING_REVIEW' });
  });

  it('approves when no signals', async () => {
    mockSupabaseAdminGetUser
      .mockResolvedValueOnce({ data: { user: { email: 'a@x.com' } } })
      .mockResolvedValueOnce({ data: { user: { email: 'b@x.com' } } });
    mockReferralCount.mockResolvedValue(2);
    const result = await checkFraudSignals({ referrerId: 'u1', friendId: 'u2' });
    expect(result).toEqual({ verdict: 'OK' });
  });

  it('short-circuits to OK when referrerId is null (ambassador case)', async () => {
    // Ambassador codes have no referrer user. Self-ref + cap-per-week checks
    // are meaningless without one — must skip without any external calls.
    const result = await checkFraudSignals({ referrerId: null, friendId: 'u1' });
    expect(result).toEqual({ verdict: 'OK' });
    expect(mockReferralCount).not.toHaveBeenCalled();
    expect(mockSupabaseAdminGetUser).not.toHaveBeenCalled();
  });
});
