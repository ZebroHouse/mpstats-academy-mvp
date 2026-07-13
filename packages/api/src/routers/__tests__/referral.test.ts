import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';

const mockUserFindUnique = vi.hoisted(() => vi.fn());
const mockUserFindFirst = vi.hoisted(() => vi.fn());
const mockPkgFindMany = vi.hoisted(() => vi.fn());
const mockReferralCount = vi.hoisted(() => vi.fn());
const mockActivatePackage = vi.hoisted(() => vi.fn());
const mockReferralCodeFindUnique = vi.hoisted(() => vi.fn());
const mockReferralCodeFindMany = vi.hoisted(() => vi.fn());
const mockReferralCodeCreate = vi.hoisted(() => vi.fn());
const mockReferralCodeUpdate = vi.hoisted(() => vi.fn());
const mockQueryRaw = vi.hoisted(() => vi.fn());
const mockEnsureUserReferralCode = vi.hoisted(() => vi.fn());

vi.mock('@mpstats/db/client', () => ({
  prisma: {
    userProfile: { findUnique: mockUserFindUnique, findFirst: mockUserFindFirst },
    referralBonusPackage: { findMany: mockPkgFindMany },
    referral: { count: mockReferralCount },
    referralCode: {
      findUnique: mockReferralCodeFindUnique,
      findMany: mockReferralCodeFindMany,
      create: mockReferralCodeCreate,
      update: mockReferralCodeUpdate,
    },
    $queryRaw: mockQueryRaw,
  },
}));

// Mock @mpstats/db for the Prisma namespace import (PrismaClientKnownRequestError).
vi.mock('@mpstats/db', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@mpstats/db');
  class PrismaClientKnownRequestError extends Error {
    code: string;
    constructor(msg: string, opts: { code: string }) {
      super(msg);
      this.code = opts.code;
    }
  }
  return {
    ...actual,
    Prisma: {
      PrismaClientKnownRequestError,
    },
  };
});

// Force-deterministic ambassador code generation for create tests.
vi.mock('../../services/referral/code-generator', () => ({
  generateAmbassadorCode: () => 'AMB-TESTCD',
  ensureUserReferralCode: mockEnsureUserReferralCode,
}));

vi.mock('../../services/referral/activation', () => ({
  activatePackage: mockActivatePackage,
  PackageActivationError: class extends Error {
    code: string;
    constructor(code: string, msg: string) {
      super(msg);
      this.code = code;
    }
  },
}));

import { referralRouter } from '../referral';

// protectedProcedure fires ctx.prisma.userProfile.findUnique (lastActiveAt debounce).
// Provide a minimal stub so the middleware doesn't crash.
const ctxPrismaStub = {
  userProfile: {
    findUnique: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue({}),
  },
};

const ctx = {
  user: { id: 'user-1' },
  prisma: ctxPrismaStub as any,
};

function caller() {
  return referralRouter.createCaller(ctx as any);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('referral.getMyState', () => {
  it('returns code, counters, packages', async () => {
    mockEnsureUserReferralCode.mockResolvedValue('REF-AAA111');
    mockReferralCount.mockResolvedValueOnce(5).mockResolvedValueOnce(3);
    mockPkgFindMany
      .mockResolvedValueOnce([
        { id: 'pkg1', days: 14, status: 'PENDING', issuedAt: new Date(), usedAt: null },
      ])
      .mockResolvedValueOnce([]);
    const result = await caller().getMyState();
    expect(result.referralCode).toBe('REF-AAA111');
    expect(result.totalReferred).toBe(5);
    expect(result.totalConverted).toBe(3);
    expect(result.pendingPackages).toHaveLength(1);
  });

  it('lazily assigns a code on first read when user has none yet', async () => {
    // ensureUserReferralCode generates + persists a code, so getMyState never
    // surfaces null for an authenticated user.
    mockEnsureUserReferralCode.mockResolvedValue('REF-NEWCDE');
    mockReferralCount.mockResolvedValue(0);
    mockPkgFindMany.mockResolvedValue([]);
    const result = await caller().getMyState();
    expect(result.referralCode).toBe('REF-NEWCDE');
    expect(mockEnsureUserReferralCode).toHaveBeenCalledWith('user-1');
  });
});

describe('referral.validateCode', () => {
  it('returns valid + referrerName + null trialDays for known user code (53A)', async () => {
    mockReferralCodeFindUnique.mockResolvedValue(null);
    mockUserFindUnique.mockResolvedValue({ id: 'u-ref', name: 'Anna' });
    const result = await caller().validateCode({ code: 'REF-AAA111' });
    expect(result.valid).toBe(true);
    expect(result.referrerName).toBe('Anna');
    expect(result.trialDays).toBeNull();
    expect(result.type).toBe('user');
  });

  it('returns invalid for unknown code', async () => {
    mockReferralCodeFindUnique.mockResolvedValue(null);
    mockUserFindUnique.mockResolvedValue(null);
    const result = await caller().validateCode({ code: 'REF-XXXXXX' });
    expect(result.valid).toBe(false);
    expect(result.trialDays).toBeNull();
    expect(result.type).toBeNull();
  });

  it('returns invalid for malformed code', async () => {
    const result = await caller().validateCode({ code: 'garbage' });
    expect(result.valid).toBe(false);
    expect(mockUserFindUnique).not.toHaveBeenCalled();
    expect(mockReferralCodeFindUnique).not.toHaveBeenCalled();
  });

  // Phase 60: ambassador code paths
  it('returns valid + label + refereeTrialDays for active AMBASSADOR code', async () => {
    mockReferralCodeFindUnique.mockResolvedValue({
      id: 'rc-1',
      code: 'AMB-BLOGER1',
      codeType: 'AMBASSADOR',
      label: 'Блогер Анна',
      refereeTrialDays: 7,
      maxUses: null,
      currentUses: 3,
      expiresAt: null,
      isActive: true,
    });
    const result = await caller().validateCode({ code: 'AMB-BLOGER1' });
    expect(result.valid).toBe(true);
    expect(result.referrerName).toBe('Блогер Анна');
    expect(result.trialDays).toBe(7);
    expect(result.type).toBe('ambassador');
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  it('returns invalid for expired AMBASSADOR code', async () => {
    mockReferralCodeFindUnique.mockResolvedValue({
      id: 'rc-2',
      code: 'AMB-OLDONE',
      codeType: 'AMBASSADOR',
      label: 'Old promo',
      refereeTrialDays: 14,
      maxUses: null,
      currentUses: 0,
      expiresAt: new Date('2026-01-01'),
      isActive: true,
    });
    const result = await caller().validateCode({ code: 'AMB-OLDONE' });
    expect(result.valid).toBe(false);
    expect(result.trialDays).toBeNull();
  });

  it('returns invalid for disabled AMBASSADOR code', async () => {
    mockReferralCodeFindUnique.mockResolvedValue({
      id: 'rc-3',
      code: 'AMB-DEADON',
      codeType: 'AMBASSADOR',
      label: 'Killed',
      refereeTrialDays: 30,
      maxUses: null,
      currentUses: 0,
      expiresAt: null,
      isActive: false,
    });
    const result = await caller().validateCode({ code: 'AMB-DEADON' });
    expect(result.valid).toBe(false);
  });

  it('returns invalid for max-uses-reached AMBASSADOR code', async () => {
    mockReferralCodeFindUnique.mockResolvedValue({
      id: 'rc-4',
      code: 'AMB-FULL01',
      codeType: 'AMBASSADOR',
      label: 'Sold out',
      refereeTrialDays: 7,
      maxUses: 10,
      currentUses: 10,
      expiresAt: null,
      isActive: true,
    });
    const result = await caller().validateCode({ code: 'AMB-FULL01' });
    expect(result.valid).toBe(false);
  });
});

describe('referral.activatePackage', () => {
  it('calls activation with userId from ctx', async () => {
    mockActivatePackage.mockResolvedValue(undefined);
    await caller().activatePackage({ packageId: 'pkg-1' });
    expect(mockActivatePackage).toHaveBeenCalledWith('pkg-1', 'user-1');
  });

  it('translates PackageActivationError to TRPCError', async () => {
    const { PackageActivationError } = await import('../../services/referral/activation');
    mockActivatePackage.mockRejectedValue(
      new PackageActivationError('NOT_FOUND', 'Package not found'),
    );
    await expect(caller().activatePackage({ packageId: 'pkg-x' })).rejects.toBeInstanceOf(
      TRPCError,
    );
  });
});

// ====== Phase 60 — referral.admin.* ambassador codes ======

// Admin ctx — adminProcedure middleware calls ctx.prisma.userProfile.findUnique to load role.
const adminCtxPrismaStub = {
  userProfile: {
    findUnique: vi.fn().mockResolvedValue({ role: 'ADMIN' }),
    update: vi.fn().mockResolvedValue({}),
  },
};
const adminCtx = {
  user: { id: 'admin-1' },
  prisma: adminCtxPrismaStub as any,
};
function adminCaller() {
  return referralRouter.createCaller(adminCtx as any);
}

// Non-admin (regular user) — role=USER → FORBIDDEN.
const userCtxPrismaStub = {
  userProfile: {
    findUnique: vi.fn().mockResolvedValue({ role: 'USER' }),
    update: vi.fn().mockResolvedValue({}),
  },
};
const userCtx = {
  user: { id: 'user-2' },
  prisma: userCtxPrismaStub as any,
};
function userCaller() {
  return referralRouter.createCaller(userCtx as any);
}

describe('referral.admin.createAmbassadorCode', () => {
  it('happy path returns AMBASSADOR row with auto-generated code', async () => {
    mockReferralCodeFindUnique.mockResolvedValue(null);
    mockUserFindFirst.mockResolvedValue(null);
    mockReferralCodeCreate.mockResolvedValue({
      id: 'rc1',
      code: 'AMB-TESTCD',
      codeType: 'AMBASSADOR',
      label: 'Анна',
      refereeTrialDays: 14,
      maxUses: 100,
      currentUses: 0,
      expiresAt: null,
      isActive: true,
      createdByUserId: 'admin-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await adminCaller().admin.createAmbassadorCode({
      label: 'Анна',
      refereeTrialDays: 14,
      maxUses: 100,
    });

    expect(result.codeType).toBe('AMBASSADOR');
    expect(result.code).toBe('AMB-TESTCD');
    expect(mockReferralCodeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          code: 'AMB-TESTCD',
          codeType: 'AMBASSADOR',
          refereeTrialDays: 14,
          createdByUserId: 'admin-1',
        }),
      }),
    );
  });

  it('persists landingTarget=HOME when provided', async () => {
    mockReferralCodeFindUnique.mockResolvedValue(null);
    mockUserFindFirst.mockResolvedValue(null);
    mockReferralCodeCreate.mockResolvedValue({ id: 'rc2', code: 'AMB-HOME01', landingTarget: 'HOME' });

    await adminCaller().admin.createAmbassadorCode({
      label: 'Блогер',
      refereeTrialDays: 14,
      landingTarget: 'HOME',
    });

    expect(mockReferralCodeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ landingTarget: 'HOME' }),
      }),
    );
  });

  it('defaults landingTarget to REGISTER when omitted', async () => {
    mockReferralCodeFindUnique.mockResolvedValue(null);
    mockUserFindFirst.mockResolvedValue(null);
    mockReferralCodeCreate.mockResolvedValue({ id: 'rc3', code: 'AMB-REG001', landingTarget: 'REGISTER' });

    await adminCaller().admin.createAmbassadorCode({
      label: 'Блогер',
      refereeTrialDays: 14,
    });

    expect(mockReferralCodeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ landingTarget: 'REGISTER' }),
      }),
    );
  });

  it('rejects an invalid landingTarget value via zod', async () => {
    await expect(
      adminCaller().admin.createAmbassadorCode({
        label: 'X',
        refereeTrialDays: 14,
        // @ts-expect-error — only HOME | REGISTER allowed
        landingTarget: 'DASHBOARD',
      }),
    ).rejects.toThrow();
  });

  it('rejects refereeTrialDays=0 with zod error', async () => {
    await expect(
      adminCaller().admin.createAmbassadorCode({
        label: 'X',
        refereeTrialDays: 0,
      }),
    ).rejects.toThrow();
  });

  it('rejects refereeTrialDays=366 with zod error', async () => {
    await expect(
      adminCaller().admin.createAmbassadorCode({
        label: 'X',
        refereeTrialDays: 366,
      }),
    ).rejects.toThrow();
  });

  it('rejects collision with existing ReferralCode.code (CONFLICT)', async () => {
    mockReferralCodeFindUnique.mockResolvedValue({ id: 'existing' });
    mockUserFindFirst.mockResolvedValue(null);

    await expect(
      adminCaller().admin.createAmbassadorCode({
        label: 'Анна',
        refereeTrialDays: 14,
        code: 'AMB-DUP123',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('rejects collision with existing UserProfile.referralCode (CONFLICT)', async () => {
    mockReferralCodeFindUnique.mockResolvedValue(null);
    mockUserFindFirst.mockResolvedValue({ id: 'u-owner' });

    await expect(
      adminCaller().admin.createAmbassadorCode({
        label: 'Анна',
        refereeTrialDays: 14,
        code: 'REF-USR123',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('referral.admin.updateAmbassadorCode', () => {
  it('rejects unknown key refereeTrialDays via .strict() (zod unrecognized_keys)', async () => {
    await expect(
      adminCaller().admin.updateAmbassadorCode({
        id: 'clxxxxxxxxxxxxxxxxxxxxxxx',
        // @ts-expect-error — strict() rejects unknown keys
        refereeTrialDays: 30,
      }),
    ).rejects.toThrow();
  });

  it('rejects unknown key code via .strict()', async () => {
    await expect(
      adminCaller().admin.updateAmbassadorCode({
        id: 'clxxxxxxxxxxxxxxxxxxxxxxx',
        // @ts-expect-error
        code: 'AMB-NEW123',
      }),
    ).rejects.toThrow();
  });

  it('updates landingTarget when provided', async () => {
    mockReferralCodeUpdate.mockResolvedValue({ id: 'rc1', landingTarget: 'HOME' });

    await adminCaller().admin.updateAmbassadorCode({
      id: 'clxxxxxxxxxxxxxxxxxxxxxxx',
      landingTarget: 'HOME',
    });

    expect(mockReferralCodeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ landingTarget: 'HOME' }),
      }),
    );
  });
});

describe('referral.admin.toggleAmbassadorCode', () => {
  it('flips isActive via update', async () => {
    mockReferralCodeUpdate.mockResolvedValue({ id: 'rc1', isActive: false });

    await adminCaller().admin.toggleAmbassadorCode({
      id: 'clxxxxxxxxxxxxxxxxxxxxxxx',
      isActive: false,
    });

    expect(mockReferralCodeUpdate).toHaveBeenCalledWith({
      where: { id: 'clxxxxxxxxxxxxxxxxxxxxxxx' },
      data: { isActive: false },
    });
  });
});

describe('referral.admin.listAmbassadorCodes', () => {
  it('returns items with activations + paid_conversions stats', async () => {
    mockReferralCodeFindMany.mockResolvedValue([
      {
        id: 'rc1',
        code: 'AMB-ABC123',
        codeType: 'AMBASSADOR',
        label: 'Blogger A',
        refereeTrialDays: 14,
        maxUses: null,
        currentUses: 3,
        expiresAt: null,
        isActive: true,
        createdByUserId: 'admin-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mockReferralCount.mockResolvedValue(3);
    mockQueryRaw.mockResolvedValue([{ count: BigInt(2) }]);

    const result = await adminCaller().admin.listAmbassadorCodes({ take: 50 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 'rc1',
      activations: 3,
      paid_conversions: 2,
    });
    expect(result.nextCursor).toBeNull();
  });
});

describe('referral.admin.* — adminProcedure gating', () => {
  it('non-admin (role=USER) gets FORBIDDEN on listAmbassadorCodes', async () => {
    await expect(
      userCaller().admin.listAmbassadorCodes({ take: 10 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
