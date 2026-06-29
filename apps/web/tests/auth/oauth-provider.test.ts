import { describe, it, expect, vi, beforeEach } from 'vitest';

// We'll import after creating the module
import { YandexProvider, type OAuthProvider, type OAuthUserInfo } from '@/lib/auth/oauth-providers';

describe('OAuthProvider interface', () => {
  it('OAuthUserInfo has id, email, name, phone fields', () => {
    const info: OAuthUserInfo = {
      id: '123',
      email: 'test@yandex.ru',
      name: 'Test User',
      phone: '+79001234567',
    };
    expect(info.id).toBe('123');
    expect(info.email).toBe('test@yandex.ru');
    expect(info.name).toBe('Test User');
    expect(info.phone).toBe('+79001234567');
  });

  it('OAuthUserInfo name and phone can be null', () => {
    const info: OAuthUserInfo = {
      id: '123',
      email: 'test@yandex.ru',
      name: null,
      phone: null,
    };
    expect(info.name).toBeNull();
    expect(info.phone).toBeNull();
  });
});

describe('YandexProvider', () => {
  let provider: YandexProvider;

  beforeEach(() => {
    vi.stubEnv('YANDEX_CLIENT_ID', 'test-client-id');
    vi.stubEnv('YANDEX_CLIENT_SECRET', 'test-client-secret');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://platform.mpstats.academy');
    provider = new YandexProvider();
  });

  it('has name "yandex"', () => {
    expect(provider.name).toBe('yandex');
  });

  it('authorizeUrl returns correct Yandex OAuth URL with all params', () => {
    const url = provider.authorizeUrl('test-state-123');

    expect(url).toContain('https://oauth.yandex.ru/authorize');

    const parsed = new URL(url);
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('client_id')).toBe('test-client-id');
    expect(parsed.searchParams.get('redirect_uri')).toBe(
      'https://platform.mpstats.academy/api/auth/yandex/callback'
    );
    // Phase 45 added `login:default_phone` to collect phone via Yandex OAuth.
    expect(parsed.searchParams.get('scope')).toBe('login:email login:info login:default_phone');
    expect(parsed.searchParams.get('state')).toBe('test-state-123');
  });

  it('exchangeCode POSTs to Yandex token endpoint with correct format', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: 'ya-token-abc' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await provider.exchangeCode('auth-code-xyz');

    expect(result.accessToken).toBe('ya-token-abc');

    // Verify fetch was called correctly
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://oauth.yandex.ru/token');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/x-www-form-urlencoded');

    // Verify body contains all required params
    const body = new URLSearchParams(options.body);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('auth-code-xyz');
    expect(body.get('client_id')).toBe('test-client-id');
    expect(body.get('client_secret')).toBe('test-client-secret');
  });

  it('exchangeCode throws on error response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ error: 'invalid_grant', error_description: 'Code expired' }),
    }));

    await expect(provider.exchangeCode('bad-code')).rejects.toThrow('Yandex token error');
  });

  it('getUserInfo GETs Yandex user info with OAuth header', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        id: '999888',
        default_email: 'ivan@yandex.ru',
        display_name: 'Ivan Petrov',
        first_name: 'Ivan',
        last_name: 'Petrov',
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const info = await provider.getUserInfo('ya-token-abc');

    expect(info.id).toBe('999888');
    expect(info.email).toBe('ivan@yandex.ru');
    expect(info.name).toBe('Ivan Petrov');

    // Verify correct Authorization header (objectContaining so AbortSignal etc are ignored)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://login.yandex.ru/info?format=json',
      expect.objectContaining({ headers: { Authorization: 'OAuth ya-token-abc' } })
    );
  });

  it('getUserInfo falls back to first_name + last_name when display_name is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        id: '111',
        default_email: 'test@yandex.ru',
        first_name: 'Anna',
        last_name: 'Smirnova',
      }),
    }));

    const info = await provider.getUserInfo('token');
    expect(info.name).toBe('Anna Smirnova');
  });

  it('getUserInfo normalizes email to trimmed lowercase', async () => {
    // Regression (2026-06-29): Yandex returns default_email with original
    // casing (e.g. an uppercase letter). GoTrue stores emails lowercased, so a
    // case-sensitive lookup missed the existing user → createUser → "already
    // registered" → auth_callback_error → returning Yandex users locked out.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        id: '17741187',
        default_email: '  TR0F@Yandex.RU  ',
        display_name: 'Сергей',
      }),
    }));

    const info = await provider.getUserInfo('token');
    expect(info.email).toBe('tr0f@yandex.ru');
  });

  it('getUserInfo returns null name when no name fields present', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        id: '222',
        default_email: 'anon@yandex.ru',
      }),
    }));

    const info = await provider.getUserInfo('token');
    expect(info.name).toBeNull();
  });

  it('implements OAuthProvider interface', () => {
    const p: OAuthProvider = provider;
    expect(p.name).toBe('yandex');
    expect(typeof p.authorizeUrl).toBe('function');
    expect(typeof p.exchangeCode).toBe('function');
    expect(typeof p.getUserInfo).toBe('function');
  });
});
