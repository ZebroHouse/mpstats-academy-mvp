import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock modules before importing (top-level defaults; full-flow cases re-mock
// per-test with vi.resetModules() + vi.doMock, mirroring yandex-oauth.test.ts).
vi.mock('@/lib/auth/oauth-providers', () => {
  const mockExchangeCode = vi.fn();
  const mockGetUserInfo = vi.fn();
  const mockAuthorizeUrl = vi.fn();

  return {
    TochkaProvider: vi.fn().mockImplementation(() => ({
      name: 'tochka',
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
        createUser: vi.fn(),
        updateUserById: vi.fn().mockResolvedValue({ error: null }),
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
    $queryRaw: vi.fn().mockResolvedValue([]),
  },
}));

const mockCookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
  getAll: vi.fn().mockReturnValue([]),
};

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
}));

describe('Tochka OAuth Callback Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-anon-key');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://platform.mpstats.academy');
    vi.stubEnv('TOCHKA_LOGIN_ENABLED', 'true');
  });

  it('redirects to /login?error=invalid_state when state mismatch', async () => {
    const { GET } = await import('@/app/api/auth/tochka/callback/route');

    mockCookieStore.get.mockReturnValue({ value: 'A' });

    const request = new Request(
      'https://platform.mpstats.academy/api/auth/tochka/callback?code=abc&state=B'
    );
    const response = await GET(request);

    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    const location = response.headers.get('location');
    expect(location).toContain('/login');
    expect(location).toContain('error=invalid_state');
  });

  it('redirects to /login?error=tochka_no_email when userInfo has no email (no createUser)', async () => {
    vi.resetModules();

    const createUserSpy = vi.fn();
    vi.doMock('@/lib/auth/oauth-providers', () => ({
      TochkaProvider: vi.fn().mockImplementation(() => ({
        name: 'tochka',
        exchangeCode: vi.fn().mockResolvedValue({ accessToken: 't-token' }),
        getUserInfo: vi.fn().mockResolvedValue({
          id: 's',
          email: null,
          phone: '+7',
          name: null,
        }),
      })),
    }));

    vi.doMock('@/lib/auth/supabase-admin', () => ({
      getSupabaseAdmin: vi.fn(() => ({
        auth: {
          admin: {
            createUser: createUserSpy,
            updateUserById: vi.fn().mockResolvedValue({ error: null }),
            generateLink: vi.fn(),
          },
          verifyOtp: vi.fn(),
        },
      })),
    }));

    vi.doMock('@mpstats/db/client', () => ({
      prisma: {
        userProfile: { upsert: vi.fn().mockResolvedValue({}) },
        $queryRaw: vi.fn().mockResolvedValue([]),
      },
    }));

    vi.doMock('next/headers', () => ({
      cookies: vi.fn(() =>
        Promise.resolve({
          get: vi.fn().mockReturnValue({ value: 'valid-state' }),
          set: vi.fn(),
          delete: vi.fn(),
          getAll: vi.fn().mockReturnValue([]),
        })
      ),
    }));

    const { GET } = await import('@/app/api/auth/tochka/callback/route');

    const request = new Request(
      'https://platform.mpstats.academy/api/auth/tochka/callback?code=valid-code&state=valid-state'
    );
    const response = await GET(request);

    const location = response.headers.get('location');
    expect(location).toContain('error=tochka_no_email');
    expect(createUserSpy).not.toHaveBeenCalled();
  });

  it('existing email signs in without createUser and without base trial', async () => {
    vi.resetModules();

    vi.doMock('@/lib/auth/oauth-providers', () => ({
      TochkaProvider: vi.fn().mockImplementation(() => ({
        name: 'tochka',
        exchangeCode: vi.fn().mockResolvedValue({ accessToken: 't-token' }),
        getUserInfo: vi.fn().mockResolvedValue({
          id: 's-tochka',
          email: 'x@tochka.com',
          name: 'Тест',
          phone: '+79001234567',
        }),
      })),
    }));

    const createUserSpy = vi.fn();
    vi.doMock('@/lib/auth/supabase-admin', () => ({
      getSupabaseAdmin: vi.fn(() => ({
        auth: {
          admin: {
            createUser: createUserSpy,
            updateUserById: vi.fn().mockResolvedValue({ error: null }),
            generateLink: vi.fn().mockResolvedValue({
              data: { properties: { hashed_token: 'hashed-token-123' } },
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
      })),
    }));

    vi.doMock('@supabase/ssr', () => ({
      createServerClient: vi.fn(() => ({
        auth: { setSession: vi.fn().mockResolvedValue({ data: {}, error: null }) },
      })),
    }));

    vi.doMock('@mpstats/db/client', () => ({
      prisma: {
        userProfile: {
          upsert: vi.fn().mockResolvedValue({ phone: '+79001234567' }),
        },
        $queryRaw: vi.fn().mockResolvedValue([
          { id: 'u1', email: 'x@tochka.com' },
        ]),
      },
    }));

    const ensureBaseTrialSpy = vi.fn().mockResolvedValue(undefined);
    vi.doMock('@mpstats/api', async (importActual) => ({
      ...(await importActual<typeof import('@mpstats/api')>()),
      ensureBaseTrial: ensureBaseTrialSpy,
    }));

    vi.doMock('next/headers', () => ({
      cookies: vi.fn(() =>
        Promise.resolve({
          get: vi.fn().mockReturnValue({ value: 'valid-state' }),
          set: vi.fn(),
          delete: vi.fn(),
          getAll: vi.fn().mockReturnValue([]),
        })
      ),
    }));

    const { GET } = await import('@/app/api/auth/tochka/callback/route');

    const request = new Request(
      'https://platform.mpstats.academy/api/auth/tochka/callback?code=valid-code&state=valid-state'
    );
    const response = await GET(request);

    const location = response.headers.get('location');
    expect(location).not.toContain('error=');
    expect(location).toContain('/dashboard');
    expect(createUserSpy).not.toHaveBeenCalled();
    expect(ensureBaseTrialSpy).not.toHaveBeenCalled();
  });

  it('new email creates pre-confirmed user and grants base trial', async () => {
    vi.resetModules();

    vi.doMock('@/lib/auth/oauth-providers', () => ({
      TochkaProvider: vi.fn().mockImplementation(() => ({
        name: 'tochka',
        exchangeCode: vi.fn().mockResolvedValue({ accessToken: 't-token' }),
        getUserInfo: vi.fn().mockResolvedValue({
          id: 'tochka-sub-1',
          email: 'new@tochka.com',
          name: 'Новый',
          phone: '+79007654321',
          emailVerified: true,
          phoneVerified: false,
        }),
      })),
    }));

    const createUserSpy = vi.fn().mockResolvedValue({
      data: { user: { id: 'new-uid', email: 'new@tochka.com' } },
      error: null,
    });
    vi.doMock('@/lib/auth/supabase-admin', () => ({
      getSupabaseAdmin: vi.fn(() => ({
        auth: {
          admin: {
            createUser: createUserSpy,
            updateUserById: vi.fn().mockResolvedValue({ error: null }),
            generateLink: vi.fn().mockResolvedValue({
              data: { properties: { hashed_token: 'hashed-token-123' } },
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
      })),
    }));

    vi.doMock('@supabase/ssr', () => ({
      createServerClient: vi.fn(() => ({
        auth: { setSession: vi.fn().mockResolvedValue({ data: {}, error: null }) },
      })),
    }));

    vi.doMock('@mpstats/db/client', () => ({
      prisma: {
        userProfile: {
          upsert: vi.fn().mockResolvedValue({ phone: '+79007654321' }),
        },
        $queryRaw: vi.fn().mockResolvedValue([]),
      },
    }));

    const ensureBaseTrialSpy = vi.fn().mockResolvedValue(undefined);
    vi.doMock('@mpstats/api', async (importActual) => ({
      ...(await importActual<typeof import('@mpstats/api')>()),
      ensureBaseTrial: ensureBaseTrialSpy,
    }));

    vi.doMock('next/headers', () => ({
      cookies: vi.fn(() =>
        Promise.resolve({
          get: vi.fn().mockReturnValue({ value: 'valid-state' }),
          set: vi.fn(),
          delete: vi.fn(),
          getAll: vi.fn().mockReturnValue([]),
        })
      ),
    }));

    const { GET } = await import('@/app/api/auth/tochka/callback/route');

    const request = new Request(
      'https://platform.mpstats.academy/api/auth/tochka/callback?code=valid-code&state=valid-state'
    );
    await GET(request);

    expect(createUserSpy).toHaveBeenCalledTimes(1);
    const createArg = createUserSpy.mock.calls[0][0];
    expect(createArg.email_confirm).toBe(true);
    expect(createArg.user_metadata.tochka_id).toBe('tochka-sub-1');
    expect(ensureBaseTrialSpy).toHaveBeenCalledWith('new-uid');
  });

  it('new user without phone is routed to /complete-profile', async () => {
    vi.resetModules();

    vi.doMock('@/lib/auth/oauth-providers', () => ({
      TochkaProvider: vi.fn().mockImplementation(() => ({
        name: 'tochka',
        exchangeCode: vi.fn().mockResolvedValue({ accessToken: 't-token' }),
        getUserInfo: vi.fn().mockResolvedValue({
          id: 'tochka-sub-2',
          email: 'nophone@tochka.com',
          name: 'Без телефона',
          phone: null,
        }),
      })),
    }));

    vi.doMock('@/lib/auth/supabase-admin', () => ({
      getSupabaseAdmin: vi.fn(() => ({
        auth: {
          admin: {
            createUser: vi.fn().mockResolvedValue({
              data: { user: { id: 'nophone-uid', email: 'nophone@tochka.com' } },
              error: null,
            }),
            updateUserById: vi.fn().mockResolvedValue({ error: null }),
            generateLink: vi.fn().mockResolvedValue({
              data: { properties: { hashed_token: 'hashed-token-123' } },
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
      })),
    }));

    vi.doMock('@supabase/ssr', () => ({
      createServerClient: vi.fn(() => ({
        auth: { setSession: vi.fn().mockResolvedValue({ data: {}, error: null }) },
      })),
    }));

    vi.doMock('@mpstats/db/client', () => ({
      prisma: {
        userProfile: {
          upsert: vi.fn().mockResolvedValue({ phone: null }),
        },
        $queryRaw: vi.fn().mockResolvedValue([]),
      },
    }));

    const ensureBaseTrialSpy = vi.fn().mockResolvedValue(undefined);
    vi.doMock('@mpstats/api', async (importActual) => ({
      ...(await importActual<typeof import('@mpstats/api')>()),
      ensureBaseTrial: ensureBaseTrialSpy,
    }));

    vi.doMock('next/headers', () => ({
      cookies: vi.fn(() =>
        Promise.resolve({
          get: vi.fn().mockReturnValue({ value: 'valid-state' }),
          set: vi.fn(),
          delete: vi.fn(),
          getAll: vi.fn().mockReturnValue([]),
        })
      ),
    }));

    const { GET } = await import('@/app/api/auth/tochka/callback/route');

    const request = new Request(
      'https://platform.mpstats.academy/api/auth/tochka/callback?code=valid-code&state=valid-state'
    );
    const response = await GET(request);

    const location = response.headers.get('location');
    expect(location).toContain('/complete-profile');
  });

  it('flag off redirects silently to /login without touching the provider', async () => {
    vi.resetModules();
    vi.stubEnv('TOCHKA_LOGIN_ENABLED', 'false');

    const exchangeCodeSpy = vi.fn();
    vi.doMock('@/lib/auth/oauth-providers', () => ({
      TochkaProvider: vi.fn().mockImplementation(() => ({
        name: 'tochka',
        exchangeCode: exchangeCodeSpy,
        getUserInfo: vi.fn(),
      })),
    }));

    vi.doMock('next/headers', () => ({
      cookies: vi.fn(() =>
        Promise.resolve({
          get: vi.fn().mockReturnValue({ value: 'valid-state' }),
          set: vi.fn(),
          delete: vi.fn(),
          getAll: vi.fn().mockReturnValue([]),
        })
      ),
    }));

    const { GET } = await import('@/app/api/auth/tochka/callback/route');

    const request = new Request(
      'https://platform.mpstats.academy/api/auth/tochka/callback?code=valid-code&state=valid-state'
    );
    const response = await GET(request);

    const location = response.headers.get('location');
    expect(location).toContain('/login');
    expect(location).not.toContain('error=');
    expect(exchangeCodeSpy).not.toHaveBeenCalled();
  });
});
