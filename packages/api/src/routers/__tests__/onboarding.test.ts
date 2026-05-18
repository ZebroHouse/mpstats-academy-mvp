import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/carrotquest', () => ({
  cqSetUserProps: vi.fn().mockResolvedValue(undefined),
  cqTrackEvent: vi.fn().mockResolvedValue(undefined),
}));

import { onboardingRouter } from '../onboarding';
import { cqSetUserProps, cqTrackEvent } from '../../utils/carrotquest';

// protectedProcedure middleware fires ctx.prisma.userProfile.findUnique
// (lastActiveAt debounce); ensureUserProfile calls upsert. Provide minimal
// stubs so neither crashes. The middleware's findUnique (select: lastActiveAt)
// returns a *fresh* lastActiveAt so its debounce skips the side-effect
// update — keeping update calls in this suite limited to the procedure.
const ctxPrismaStub = {
  userProfile: {
    findUnique: vi.fn().mockImplementation((args: any) =>
      args?.select?.lastActiveAt
        ? Promise.resolve({ lastActiveAt: new Date() })
        : Promise.resolve(null),
    ),
    update: vi.fn().mockResolvedValue({}),
    upsert: vi.fn().mockResolvedValue({}),
  },
};

const ctx = {
  user: { id: 'user-1' },
  prisma: ctxPrismaStub as any,
};

function caller() {
  return onboardingRouter.createCaller(ctx as any);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('onboarding.complete', () => {
  it('persists qualification fields and stamps onboardingCompletedAt', async () => {
    await caller().complete({
      marketplaces: ['WB', 'OZON'],
      experienceLevel: 'BEGINNER',
      goals: ['SALES'],
      goalText: 'хочу выйти на маркетплейсы',
    });

    expect(ctxPrismaStub.userProfile.update).toHaveBeenCalledTimes(1);
    const updateArg = ctxPrismaStub.userProfile.update.mock.calls[0][0];
    // Write hard-bound to server-session userId, never input.
    expect(updateArg.where).toEqual({ id: 'user-1' });
    expect(updateArg.data.onboardingCompletedAt).toBeInstanceOf(Date);
    expect(updateArg.data.marketplaces).toEqual(['WB', 'OZON']);
    expect(updateArg.data.goals).toEqual(['SALES']);
    expect(updateArg.data.experienceLevel).toBe('BEGINNER');
  });

  it('rejects an unknown marketplace key before reaching the DB', async () => {
    await expect(
      caller().complete({ marketplaces: ['BOGUS'] as any }),
    ).rejects.toThrow();
    expect(ctxPrismaStub.userProfile.update).not.toHaveBeenCalled();
  });

  it('accepts a null experienceLevel', async () => {
    await caller().complete({ experienceLevel: null });
    expect(ctxPrismaStub.userProfile.update).toHaveBeenCalledTimes(1);
    const updateArg = ctxPrismaStub.userProfile.update.mock.calls[0][0];
    expect(updateArg.data.experienceLevel).toBeNull();
  });

  it('mirrors qualification to CarrotQuest as pa_* props', async () => {
    await caller().complete({
      marketplaces: ['WB', 'OZON'],
      experienceLevel: 'BEGINNER',
      goals: ['SALES', 'ADS'],
      goalText: 'хочу выйти на маркетплейсы',
    });

    expect(cqSetUserProps).toHaveBeenCalledTimes(1);
    expect(cqSetUserProps).toHaveBeenCalledWith('user-1', {
      pa_marketplaces: 'WB, OZON',
      pa_experience: 'BEGINNER',
      pa_goals: 'SALES, ADS',
      pa_goal_text: 'хочу выйти на маркетплейсы',
    });
  });

  it('fires pa_onboarding_completed on the first completion', async () => {
    // Default findUnique stub returns null for the onboardingCompletedAt read
    // → wasFirstCompletion is true.
    await caller().complete({ marketplaces: ['WB'] });

    expect(cqTrackEvent).toHaveBeenCalledTimes(1);
    expect(cqTrackEvent).toHaveBeenCalledWith('user-1', 'pa_onboarding_completed');
  });

  it('does NOT fire pa_onboarding_completed when onboarding was already done', async () => {
    // Profile edit: prior onboardingCompletedAt is already set.
    ctxPrismaStub.userProfile.findUnique.mockImplementation((args: any) =>
      args?.select?.lastActiveAt
        ? Promise.resolve({ lastActiveAt: new Date() })
        : args?.select?.onboardingCompletedAt
          ? Promise.resolve({ onboardingCompletedAt: new Date('2026-01-01') })
          : Promise.resolve(null),
    );

    await caller().complete({ marketplaces: ['OZON'] });

    expect(cqSetUserProps).toHaveBeenCalledTimes(1); // props still synced
    expect(cqTrackEvent).not.toHaveBeenCalled();     // but no completion event
  });

  it('still completes when the CarrotQuest call fails', async () => {
    vi.mocked(cqSetUserProps).mockRejectedValueOnce(new Error('CQ down'));

    const result = caller().complete({ marketplaces: ['WB'] });

    await expect(result).resolves.not.toThrow();
    expect(ctxPrismaStub.userProfile.update).toHaveBeenCalledTimes(1);
  });
});

describe('onboarding.getState', () => {
  it('returns the current qualification fields', async () => {
    const state = {
      onboardingCompletedAt: new Date('2026-05-18T00:00:00Z'),
      marketplaces: ['WB'],
      experienceLevel: 'STABLE',
      goals: ['ADS', 'ANALYTICS'],
      goalText: null,
    };
    // The protectedProcedure middleware also calls findUnique (lastActiveAt
    // debounce, select: { lastActiveAt }). Discriminate by the select arg so
    // call ordering does not matter.
    ctxPrismaStub.userProfile.findUnique.mockImplementation((args: any) =>
      args?.select?.lastActiveAt ? Promise.resolve(null) : Promise.resolve(state),
    );

    const result = await caller().getState();

    expect(result).toEqual({
      onboardingCompletedAt: new Date('2026-05-18T00:00:00Z'),
      marketplaces: ['WB'],
      experienceLevel: 'STABLE',
      goals: ['ADS', 'ANALYTICS'],
      goalText: null,
    });
  });
});
