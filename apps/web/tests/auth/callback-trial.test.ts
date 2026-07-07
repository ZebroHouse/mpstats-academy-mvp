import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Spies shared across the mocked modules.
const ensureBaseTrialSpy = vi.fn().mockResolvedValue(undefined);
const issueReferralSpy = vi.fn().mockResolvedValue(undefined);
const exchangeCodeMock = vi.fn();
const getUserMock = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      exchangeCodeForSession: exchangeCodeMock,
      getUser: getUserMock,
    },
  })),
}));

vi.mock('@mpstats/db/client', () => ({
  prisma: {
    userProfile: {
      findUnique: vi.fn().mockResolvedValue({ lastActiveAt: null, name: 'Тест' }),
    },
  },
}));

vi.mock('@mpstats/api', () => ({ ensureBaseTrial: ensureBaseTrialSpy }));
vi.mock('@/lib/referral/issue', () => ({ issueReferralOnSignup: issueReferralSpy }));
vi.mock('@/lib/referral/attribution', () => ({
  REFERRAL_COOKIE_NAME: 'mp_ref',
  isValidRefCodeShape: (s: unknown) => typeof s === 'string' && s.length > 0,
}));
vi.mock('@/lib/carrotquest/emails', () => ({ sendWelcomeEmail: vi.fn().mockResolvedValue(undefined) }));

describe('/auth/callback — base trial on DOI confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://platform.mpstats.academy');
    exchangeCodeMock.mockResolvedValue({ error: null });
    getUserMock.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'a@b.ru', user_metadata: {} } },
    });
  });

  it('grants base trial on referral-less signup confirmation', async () => {
    const { GET } = await import('@/app/auth/callback/route');
    const req = new NextRequest('https://platform.mpstats.academy/auth/callback?code=abc');

    const res = await GET(req);

    expect(ensureBaseTrialSpy).toHaveBeenCalledWith('user-1');
    expect(issueReferralSpy).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toContain('/dashboard');
  });

  it('does NOT grant a trial on password-recovery confirmation', async () => {
    const { GET } = await import('@/app/auth/callback/route');
    const req = new NextRequest(
      'https://platform.mpstats.academy/auth/callback?code=abc&next=/reset-password',
    );

    await GET(req);

    expect(ensureBaseTrialSpy).not.toHaveBeenCalled();
    expect(issueReferralSpy).not.toHaveBeenCalled();
  });

  it('issues referral (not base trial) when a valid ref cookie is present', async () => {
    const { GET } = await import('@/app/auth/callback/route');
    const req = new NextRequest('https://platform.mpstats.academy/auth/callback?code=abc', {
      headers: { cookie: 'mp_ref=REF-TEST1' },
    });

    await GET(req);

    expect(issueReferralSpy).toHaveBeenCalledWith({ refCode: 'REF-TEST1', friendUserId: 'user-1' });
    expect(ensureBaseTrialSpy).not.toHaveBeenCalled();
  });
});
