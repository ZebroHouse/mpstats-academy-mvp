/**
 * OAuth Provider abstraction for custom OAuth flows.
 * Supabase lacks native support for some providers (e.g. Yandex ID),
 * so we handle the OAuth flow server-side and create Supabase sessions via Admin API.
 *
 * To add a new provider: implement OAuthProvider interface, add callback route.
 */

export interface OAuthUserInfo {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
}

export interface OAuthProvider {
  name: string;
  authorizeUrl(state: string): string;
  exchangeCode(code: string): Promise<{ accessToken: string }>;
  getUserInfo(accessToken: string): Promise<OAuthUserInfo>;
}

async function fetchWithRetry(
  input: string,
  init: RequestInit,
  attempts = 3,
): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      try {
        return await fetch(input, { ...init, signal: ctrl.signal });
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 250 * (i + 1)));
      }
    }
  }
  throw lastErr;
}

export class YandexProvider implements OAuthProvider {
  name = 'yandex';

  authorizeUrl(state: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.YANDEX_CLIENT_ID!,
      redirect_uri: `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/yandex/callback`,
      scope: 'login:email login:info login:default_phone',
      state,
      force_confirm: 'yes',
    });
    return `https://oauth.yandex.ru/authorize?${params}`;
  }

  async exchangeCode(code: string): Promise<{ accessToken: string }> {
    const res = await fetchWithRetry('https://oauth.yandex.ru/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.YANDEX_CLIENT_ID!,
        client_secret: process.env.YANDEX_CLIENT_SECRET!,
      }).toString(),
    });

    const data = await res.json();

    if (data.error) {
      throw new Error(`Yandex token error: ${data.error_description || data.error}`);
    }

    return { accessToken: data.access_token };
  }

  async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
    const res = await fetchWithRetry('https://login.yandex.ru/info?format=json', {
      headers: { Authorization: `OAuth ${accessToken}` },
    });

    const data = await res.json();

    return {
      id: data.id,
      // Normalize to trimmed lowercase: GoTrue stores emails lowercased, so the
      // callback's user lookup must compare against the same normalized form.
      // Without this, a Yandex default_email with any uppercase letter misses
      // the existing user and the createUser path 422s with "already
      // registered" — locking returning Yandex users out (incident 2026-06-29).
      email: data.default_email ? String(data.default_email).trim().toLowerCase() : data.default_email,
      name: data.display_name || [data.first_name, data.last_name].filter(Boolean).join(' ') || null,
      phone: data.default_phone?.number || null,
    };
  }
}
