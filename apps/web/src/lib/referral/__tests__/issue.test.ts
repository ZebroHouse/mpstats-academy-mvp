/**
 * Tests for issueReferralOnSignup orchestrator (Phase 53A + Phase 60 extension).
 *
 * Covers:
 *   - Phase 60 ambassador branch (8 cases): happy / stale-user (D-03) /
 *     limit-hit / disabled / race-overflow (D-04) / fraud PENDING_REVIEW /
 *     CQ failure tolerance / unknown code.
 *   - Phase 53A user branch (1 regression case): peer-to-peer flow still
 *     creates ReferralBonusPackage + TRIAL Subscription.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';

const {
  mockResolveReferralCode,
  mockResolveReferralCodeRaw,
  mockCreateTrialSubscription,
  mockIsFeatureEnabled,
  mockUserProfileFindUnique,
  mockReferralCreate,
  mockReferralBonusPackageCreate,
  mockReferralCodeUpdate,
  mockCheckFraudSignals,
  mockTransaction,
  mockCqSetUserProps,
  mockCqTrackEvent,
  mockSentryCaptureMessage,
  mockSentryCaptureException,
} = vi.hoisted(() => ({
  mockResolveReferralCode: vi.fn(),
  mockResolveReferralCodeRaw: vi.fn(),
  mockCreateTrialSubscription: vi.fn(),
  mockIsFeatureEnabled: vi.fn(),
  mockUserProfileFindUnique: vi.fn(),
  mockReferralCreate: vi.fn(),
  mockReferralBonusPackageCreate: vi.fn(),
  mockReferralCodeUpdate: vi.fn(),
  mockCheckFraudSignals: vi.fn(),
  mockTransaction: vi.fn(),
  mockCqSetUserProps: vi.fn(),
  mockCqTrackEvent: vi.fn(),
  mockSentryCaptureMessage: vi.fn(),
  mockSentryCaptureException: vi.fn(),
}));

vi.mock('@mpstats/api', () => ({
  resolveReferralCode: mockResolveReferralCode,
  resolveReferralCodeRaw: mockResolveReferralCodeRaw,
  createTrialSubscription: mockCreateTrialSubscription,
  isFeatureEnabled: mockIsFeatureEnabled,
}));

vi.mock('@mpstats/db/client', () => {
  const tx = {
    referral: { create: mockReferralCreate },
    referralBonusPackage: { create: mockReferralBonusPackageCreate },
    referralCode: { update: mockReferralCodeUpdate },
  };
  return {
    prisma: {
      userProfile: { findUnique: mockUserProfileFindUnique },
      $transaction: mockTransaction.mockImplementation(
        async (cb: (tx: unknown) => Promise<unknown>) => cb(tx),
      ),
    },
  };
});

vi.mock('./fraud-checks', () => ({
  checkFraudSignals: mockCheckFraudSignals,
}));
vi.mock('../fraud-checks', () => ({
  checkFraudSignals: mockCheckFraudSignals,
}));

vi.mock('@/lib/carrotquest/client', () => ({
  cq: {
    setUserProps: mockCqSetUserProps,
    trackEvent: mockCqTrackEvent,
  },
}));

vi.mock('@sentry/nextjs', () => ({
  captureMessage: mockSentryCaptureMessage,
  captureException: mockSentryCaptureException,
}));

import { issueReferralOnSignup } from '../issue';

const FRESH_USER_CREATED = new Date(Date.now() - 60 * 1000); // 1 min ago
const STALE_USER_CREATED = new Date(Date.now() - 10 * 60 * 1000); // 10 min ago

function ambassadorCode(overrides: Record<string, unknown> = {}) {
  return {
    id: 'amb-code-id-1',
    code: 'AMB-XYZ123',
    codeType: 'AMBASSADOR' as const,
    label: 'Блогер Анна',
    refereeTrialDays: 30,
    maxUses: null as number | null,
    currentUses: 0,
    expiresAt: null as Date | null,
    isActive: true,
    createdByUserId: 'admin-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: fresh friend
  mockUserProfileFindUnique.mockResolvedValue({
    id: 'friend-1',
    name: 'Friend',
    createdAt: FRESH_USER_CREATED,
  });
  mockCheckFraudSignals.mockResolvedValue({ verdict: 'OK' });
  mockReferralCreate.mockResolvedValue({ id: 'ref-1' });
  mockReferralBonusPackageCreate.mockResolvedValue({ id: 'pkg-1' });
  mockCreateTrialSubscription.mockResolvedValue({ id: 'sub-1' });
  mockReferralCodeUpdate.mockResolvedValue({ id: 'amb-code-id-1', currentUses: 1, maxUses: null });
  mockIsFeatureEnabled.mockResolvedValue(false); // i1 mode
});

describe('issueReferralOnSignup — ambassador branch', () => {
  it('happy path: creates AMBASSADOR Referral + TRIAL Subscription + increments currentUses + fires CQ', async () => {
    const code = ambassadorCode({ refereeTrialDays: 14 });
    mockResolveReferralCode.mockResolvedValue({ type: 'ambassador', code });

    await issueReferralOnSignup({ refCode: 'AMB-XYZ123', friendUserId: 'friend-1' });

    expect(mockReferralCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        code: 'AMB-XYZ123',
        codeType: 'AMBASSADOR',
        referrerUserId: null,
        referredUserId: 'friend-1',
        codeId: 'amb-code-id-1',
        status: 'CONVERTED',
        conversionTrigger: 'registration',
      }),
    });
    // NO bonus package for ambassador
    expect(mockReferralBonusPackageCreate).not.toHaveBeenCalled();
    expect(mockCreateTrialSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'friend-1', durationDays: 14 }),
    );
    expect(mockReferralCodeUpdate).toHaveBeenCalledWith({
      where: { id: 'amb-code-id-1' },
      data: { currentUses: { increment: 1 } },
    });
    expect(mockCqTrackEvent).toHaveBeenCalledWith('friend-1', 'pa_ambassador_signup');
    expect(mockCqSetUserProps).toHaveBeenCalledWith(
      'friend-1',
      expect.objectContaining({
        pa_referral_source: 'Блогер Анна',
        pa_referral_trial_days: 14,
      }),
    );
  });

  it('D-03 stale user: friend older than 5 min → early return, no DB writes', async () => {
    mockUserProfileFindUnique.mockResolvedValue({
      id: 'friend-1',
      name: 'Friend',
      createdAt: STALE_USER_CREATED,
    });
    mockResolveReferralCode.mockResolvedValue({ type: 'ambassador', code: ambassadorCode() });

    await issueReferralOnSignup({ refCode: 'AMB-XYZ123', friendUserId: 'friend-1' });

    expect(mockReferralCreate).not.toHaveBeenCalled();
    expect(mockCreateTrialSubscription).not.toHaveBeenCalled();
    expect(mockReferralCodeUpdate).not.toHaveBeenCalled();
    expect(mockSentryCaptureMessage).toHaveBeenCalledWith(
      'referral.ambassador.stale_user',
      expect.objectContaining({ level: 'info' }),
    );
  });

  it('limit-hit: resolveReferralCode null + raw row exists (expired) → Sentry log + no writes', async () => {
    mockResolveReferralCode.mockResolvedValue(null);
    mockResolveReferralCodeRaw.mockResolvedValue(
      ambassadorCode({ expiresAt: new Date(Date.now() - 1000) }),
    );

    await issueReferralOnSignup({ refCode: 'AMB-XYZ123', friendUserId: 'friend-1' });

    expect(mockReferralCreate).not.toHaveBeenCalled();
    expect(mockCreateTrialSubscription).not.toHaveBeenCalled();
    expect(mockSentryCaptureMessage).toHaveBeenCalledWith(
      'referral.ambassador.limit_hit',
      expect.objectContaining({ level: 'info' }),
    );
  });

  it('disabled: resolveReferralCode null + raw row exists (isActive=false) → Sentry log', async () => {
    mockResolveReferralCode.mockResolvedValue(null);
    mockResolveReferralCodeRaw.mockResolvedValue(ambassadorCode({ isActive: false }));

    await issueReferralOnSignup({ refCode: 'AMB-XYZ123', friendUserId: 'friend-1' });

    expect(mockReferralCreate).not.toHaveBeenCalled();
    expect(mockSentryCaptureMessage).toHaveBeenCalledWith(
      'referral.ambassador.limit_hit',
      expect.objectContaining({ level: 'info' }),
    );
  });

  it('D-04 race overflow: post-increment currentUses > maxUses → throw rollback + Sentry warning', async () => {
    const code = ambassadorCode({ maxUses: 1, currentUses: 0 });
    mockResolveReferralCode.mockResolvedValue({ type: 'ambassador', code });
    // Simulate another tx already incremented: our update returns currentUses=2 > maxUses=1
    mockReferralCodeUpdate.mockResolvedValue({ id: code.id, currentUses: 2, maxUses: 1 });

    await issueReferralOnSignup({ refCode: 'AMB-XYZ123', friendUserId: 'friend-1' });

    // Transaction callback ran, but threw — referral/sub creation was attempted inside tx
    // (the throw rolls them back at DB level — Sentry warning fired in outer handler)
    expect(mockSentryCaptureMessage).toHaveBeenCalledWith(
      'referral.ambassador.race_overflow',
      expect.objectContaining({ level: 'warning' }),
    );
    // CQ events must NOT fire after rollback
    expect(mockCqTrackEvent).not.toHaveBeenCalled();
  });

  it('fraud PENDING_REVIEW: status flips to PENDING_REVIEW, no Subscription, no currentUses increment', async () => {
    const code = ambassadorCode();
    mockResolveReferralCode.mockResolvedValue({ type: 'ambassador', code });
    mockCheckFraudSignals.mockResolvedValue({ verdict: 'PENDING_REVIEW' });

    await issueReferralOnSignup({ refCode: 'AMB-XYZ123', friendUserId: 'friend-1' });

    expect(mockReferralCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'PENDING_REVIEW' }),
    });
    expect(mockCreateTrialSubscription).not.toHaveBeenCalled();
    expect(mockReferralCodeUpdate).not.toHaveBeenCalled();
    expect(mockCqTrackEvent).not.toHaveBeenCalled();
  });

  it('CQ failure tolerant: cq.trackEvent throws → Sentry log, transaction stays committed', async () => {
    const code = ambassadorCode();
    mockResolveReferralCode.mockResolvedValue({ type: 'ambassador', code });
    mockCqTrackEvent.mockRejectedValue(new Error('CQ down'));

    await issueReferralOnSignup({ refCode: 'AMB-XYZ123', friendUserId: 'friend-1' });

    expect(mockReferralCreate).toHaveBeenCalled();
    expect(mockCreateTrialSubscription).toHaveBeenCalled();
    expect(mockSentryCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: expect.objectContaining({ area: 'referral', stage: 'cq' }) }),
    );
  });

  it('unknown code: resolveReferralCode null + raw null → referral.unknown_code Sentry log', async () => {
    mockResolveReferralCode.mockResolvedValue(null);
    mockResolveReferralCodeRaw.mockResolvedValue(null);

    await issueReferralOnSignup({ refCode: 'AMB-NOPE', friendUserId: 'friend-1' });

    expect(mockReferralCreate).not.toHaveBeenCalled();
    expect(mockSentryCaptureMessage).toHaveBeenCalledWith(
      'referral.unknown_code',
      expect.objectContaining({ level: 'info' }),
    );
  });
});

describe('issueReferralOnSignup — 53A user branch (regression)', () => {
  it('user code: creates EXTERNAL_USER Referral + ReferralBonusPackage + TRIAL Subscription', async () => {
    mockResolveReferralCode.mockResolvedValue({
      type: 'user',
      userProfile: { id: 'referrer-1', name: 'Alice' },
    });

    await issueReferralOnSignup({ refCode: 'REF-ABC', friendUserId: 'friend-1' });

    expect(mockReferralCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        code: 'REF-ABC',
        codeType: 'EXTERNAL_USER',
        referrerUserId: 'referrer-1',
        referredUserId: 'friend-1',
        status: 'CONVERTED',
      }),
    });
    // i1 mode (default mock) → bonus package issued
    expect(mockReferralBonusPackageCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerUserId: 'referrer-1',
        days: 14,
        status: 'PENDING',
      }),
    });
    expect(mockCreateTrialSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'friend-1', durationDays: 14 }),
    );
    expect(mockCqTrackEvent).toHaveBeenCalledWith('friend-1', 'pa_referral_trial_started');
  });
});
