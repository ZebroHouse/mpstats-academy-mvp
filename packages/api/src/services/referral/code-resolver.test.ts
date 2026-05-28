import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockReferralCodeFindUnique = vi.hoisted(() => vi.fn());
const mockUserProfileFindUnique = vi.hoisted(() => vi.fn());

vi.mock('@mpstats/db/client', () => ({
  prisma: {
    referralCode: { findUnique: mockReferralCodeFindUnique },
    userProfile: { findUnique: mockUserProfileFindUnique },
  },
}));

import { resolveReferralCode } from './code-resolver';

beforeEach(() => {
  vi.clearAllMocks();
});

function ambassadorRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rc1',
    code: 'AMB-ABC123',
    codeType: 'AMBASSADOR',
    label: 'Test ambassador',
    refereeTrialDays: 14,
    maxUses: null,
    currentUses: 0,
    expiresAt: null,
    isActive: true,
    createdByUserId: 'u-creator',
    createdAt: new Date('2026-05-01'),
    updatedAt: new Date('2026-05-01'),
    ...overrides,
  };
}

describe('resolveReferralCode', () => {
  it('resolves active ambassador code', async () => {
    const row = ambassadorRow();
    mockReferralCodeFindUnique.mockResolvedValue(row);

    const result = await resolveReferralCode('AMB-ABC123');

    expect(result).toEqual({ type: 'ambassador', code: row });
    expect(mockUserProfileFindUnique).not.toHaveBeenCalled();
  });

  it('returns null for expired ambassador code', async () => {
    mockReferralCodeFindUnique.mockResolvedValue(
      ambassadorRow({ expiresAt: new Date('2020-01-01') }),
    );

    const result = await resolveReferralCode('AMB-ABC123');

    expect(result).toBeNull();
    expect(mockUserProfileFindUnique).not.toHaveBeenCalled();
  });

  it('returns null when currentUses >= maxUses', async () => {
    mockReferralCodeFindUnique.mockResolvedValue(
      ambassadorRow({ maxUses: 5, currentUses: 5 }),
    );

    const result = await resolveReferralCode('AMB-ABC123');

    expect(result).toBeNull();
    expect(mockUserProfileFindUnique).not.toHaveBeenCalled();
  });

  it('returns null when isActive=false', async () => {
    mockReferralCodeFindUnique.mockResolvedValue(
      ambassadorRow({ isActive: false }),
    );

    const result = await resolveReferralCode('AMB-ABC123');

    expect(result).toBeNull();
    expect(mockUserProfileFindUnique).not.toHaveBeenCalled();
  });

  it('falls back to legacy UserProfile.referralCode for REF-XXXXXX', async () => {
    mockReferralCodeFindUnique.mockResolvedValue(null);
    mockUserProfileFindUnique.mockResolvedValue({ id: 'u1', name: 'Anna' });

    const result = await resolveReferralCode('REF-AAA111');

    expect(result).toEqual({
      type: 'user',
      userProfile: { id: 'u1', name: 'Anna' },
    });
    expect(mockUserProfileFindUnique).toHaveBeenCalledWith({
      where: { referralCode: 'REF-AAA111' },
      select: { id: true, name: true },
    });
  });

  it('returns null for unknown code shape without DB calls', async () => {
    const result = await resolveReferralCode('invalid!');

    expect(result).toBeNull();
    expect(mockReferralCodeFindUnique).not.toHaveBeenCalled();
    expect(mockUserProfileFindUnique).not.toHaveBeenCalled();
  });
});
