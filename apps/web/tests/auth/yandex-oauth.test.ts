import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock modules before importing
vi.mock('@/lib/auth/oauth-providers', () => {
  const mockExchangeCode = vi.fn();
  const mockGetUserInfo = vi.fn();
  const mockAuthorizeUrl = vi.fn();

  return {
    YandexProvider: vi.fn().mockImplementation(() => ({
      name: 'yandex',
      authorizeUrl: mockAuthorizeUrl,
      exchangeCode: mockExchangeCode,
      getUserInfo: mockGetUserInfo,
    })),
    __mockExchangeCode: mockExchangeCode,
    __mockGetUserInfo: mockGetUserInfo,
    __mockAuthorizeUrl: mockAuthorizeUrl,
  };
});

vi.mock('@/lib/auth/supabase-admin', () => {
  const mockAdminClient = {
    auth: {
      admin: {
        listUsers: vi.fn(),
        createUser: vi.fn(),
        generateLink: vi.fn(),
      },
      verifyOtp: vi.fn(),
    },
  };

  return {
    getSupabaseAdmin: vi.fn(() => mockAdminClient),
    __mockAdminClient: mockAdminClient,
  };
});

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      setSession: vi.fn().mockResolvedValue({ data: {}, error: null }),
    },
  })),
}));

vi.mock('@mpstats/db/client', () => ({
  prisma: {
    userProfile: {
      upsert: vi.fn().mockResolvedValue({}),
    },
    // Phase 17/post-incident 2026-04-27: callback uses raw SQL on auth.users
    // instead of admin.listUsers() (pagination bug). Tests mock empty result
    // so the new-user path is exercised.
    $queryRaw: vi.fn().mockResolvedValue([]),
  },
}));

// Mock next/headers cookies
const mockCookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
  getAll: vi.fn().mockReturnValue([]),
};

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
}));

describe('Yandex OAuth Callback Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://platform.mpstats.academy');
  });

  it('redirects to /login?error=missing_code when no code param', async () => {
    const { GET } = await import('@/app/api/auth/yandex/callback/route');

    const request = new Request('https://platform.mpstats.academy/api/auth/yandex/callback');
    const response = await GET(request);

    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    const location = response.headers.get('location');
    expect(location).toContain('/login');
    expect(location).toContain('error=missing_code');
  });

  it('redirects to /login?error=invalid_state when state mismatch', async () => {
    const { GET } = await import('@/app/api/auth/yandex/callback/route');

    // Set mismatched state cookie
    mockCookieStore.get.mockReturnValue({ value: 'correct-state' });

    const request = new Request(
      'https://platform.mpstats.academy/api/auth/yandex/callback?code=abc&state=wrong-state'
    );
    const response = await GET(request);

    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    const location = response.headers.get('location');
    expect(location).toContain('/login');
    expect(location).toContain('error=invalid_state');
  });

  it('handles full OAuth flow: code exchange, user creation, session, redirect', async () => {
    // Reset module to clear previous test state
    vi.resetModules();

    // Re-mock everything for fresh import
    vi.doMock('@/lib/auth/oauth-providers', () => {
      return {
        YandexProvider: vi.fn().mockImplementation(() => ({
          name: 'yandex',
          exchangeCode: vi.fn().mockResolvedValue({ accessToken: 'ya-token' }),
          getUserInfo: vi.fn().mockResolvedValue({
            id: '12345',
            email: 'user@yandex.ru',
            name: 'Test User',
          }),
        })),
      };
    });

    const mockAdmin = {
      auth: {
        admin: {
          listUsers: vi.fn().mockResolvedValue({
            data: { users: [] },
            error: null,
          }),
          createUser: vi.fn().mockResolvedValue({
            data: {
              user: { id: 'supabase-uid', email: 'user@yandex.ru' },
            },
            error: null,
          }),
          generateLink: vi.fn().mockResolvedValue({
            data: {
              properties: { hashed_token: 'hashed-token-123' },
            },
            error: null,
          }),
        },
        verifyOtp: vi.fn().mockResolvedValue({
          data: {
            session: {
              access_token: 'sb-access-token',
              refresh_token: 'sb-refresh-token',
            },
          },
          error: null,
        }),
      },
    };

    vi.doMock('@/lib/auth/supabase-admin', () => ({
      getSupabaseAdmin: vi.fn(() => mockAdmin),
    }));

    vi.doMock('@supabase/ssr', () => ({
      createServerClient: vi.fn(() => ({
        auth: {
          setSession: vi.fn().mockResolvedValue({ data: {}, error: null }),
        },
      })),
    }));

    vi.doMock('@mpstats/db/client', () => ({
      prisma: {
        userProfile: {
          upsert: vi.fn().mockResolvedValue({}),
        },
        $queryRaw: vi.fn().mockResolvedValue([]),
      },
    }));

    const freshCookieStore = {
      get: vi.fn().mockReturnValue({ value: 'valid-state' }),
      set: vi.fn(),
      delete: vi.fn(),
      getAll: vi.fn().mockReturnValue([]),
    };

    vi.doMock('next/headers', () => ({
      cookies: vi.fn(() => Promise.resolve(freshCookieStore)),
    }));

    const { GET } = await import('@/app/api/auth/yandex/callback/route');

    const request = new Request(
      'https://platform.mpstats.academy/api/auth/yandex/callback?code=valid-code&state=valid-state'
    );
    const response = await GET(request);

    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    const location = response.headers.get('location');
    // Phase 45: Yandex users without a phone in user_metadata are routed to
    // /complete-profile (the mocked getUserInfo here has no phone field).
    expect(location).toMatch(/\/complete-profile|\/dashboard|\/learn/);
  });
});

describe('signInWithYandex action', () => {
  it('signInWithYandex is exported from actions.ts', async () => {
    const actions = await import('@/lib/auth/actions');
    expect(typeof actions.signInWithYandex).toBe('function');
  });

  it('signInWithGoogle is NOT exported from actions.ts', async () => {
    const actions = await import('@/lib/auth/actions');
    expect((actions as Record<string, unknown>).signInWithGoogle).toBeUndefined();
  });
});
