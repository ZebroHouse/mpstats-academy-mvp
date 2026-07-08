/**
 * Tochka ID SSO OAuth client.
 *
 * Ported verbatim from go.mpstats.academy (`lib/auth/tochka.ts`, Phase 13) —
 * that project already solved the fragile parts (Variti WAF bypass, comma-scope,
 * Basic-auth token exchange). Two deltas vs source: no signed-state dependency
 * (`./session` import dropped) and `buildAuthorizeUrl` takes a plain-string state
 * (CSRF handled by an httpOnly cookie in the callback, not a signed payload).
 *
 * Pure HTTP client — no Next.js cookies API, no DB. Callers (server action +
 * callback route) wire these functions into the OAuth flow.
 *
 * SECURITY:
 * - client_secret passed via Basic auth header only, never in body.
 * - All HTTP calls use 8s AbortSignal timeout.
 * - Error logs include HTTP status + short body excerpt; NEVER log tokens.
 */

const DEFAULT_SSO_BASE = 'https://id.tochka.com/api/v1/tochka-id/auth/v1/sso'
const HTTP_TIMEOUT_MS = 8000

// Tochka's id.tochka.com sits behind a Variti antibot WAF that rejects fetch()
// without browser-like User-Agent (returns 403 with QRCode HTML challenge) and
// requires a cookie handshake on first POST (returns 307 + spid/spsc cookies,
// expects retry with those cookies). Browser handles this automatically;
// server-to-server clients must do it manually.
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36'

/**
 * Fetch wrapper that handles Tochka's WAF cookie handshake.
 *
 * 1. Sends initial request with redirect: 'manual'.
 * 2. If response is 307 with Set-Cookie headers, parses the cookies and
 *    retries the request once with them in a Cookie header.
 * 3. Returns the final response (either real OAuth response or unchanged
 *    307 if no cookies were set).
 *
 * Defends against infinite redirect loops by only retrying once.
 */
async function tochkaFetch(
  url: string,
  init: RequestInit
): Promise<Response> {
  const initialResp = await fetch(url, { ...init, redirect: 'manual' })

  if (initialResp.status !== 307 && initialResp.status !== 302) {
    return initialResp
  }

  // Drain body to free socket
  await initialResp.text().catch(() => '')

  const setCookieHeaders =
    typeof initialResp.headers.getSetCookie === 'function'
      ? initialResp.headers.getSetCookie()
      : []

  if (setCookieHeaders.length === 0) {
    return initialResp
  }

  const cookieHeader = setCookieHeaders
    .map((c) => c.split(';')[0])
    .join('; ')

  const retryHeaders = new Headers(init.headers)
  retryHeaders.set('Cookie', cookieHeader)

  return fetch(url, { ...init, headers: retryHeaders, redirect: 'manual' })
}

export type TochkaErrorCode =
  | 'invalid_state'
  | 'token_exchange_failed'
  | 'user_info_failed'
  | 'timeout'
  | 'missing_env'
  | 'unknown'

export class TochkaError extends Error {
  constructor(
    public code: TochkaErrorCode,
    message: string,
    public cause?: unknown
  ) {
    super(message)
    this.name = 'TochkaError'
  }
}

export interface TochkaTokenResponse {
  access_token: string
  refresh_token?: string
  token_type: string // 'Bearer'
  expires_in: number
  state?: string
  user_id?: string
}

export interface TochkaUserInfo {
  sub: string
  given_name?: string
  middle_name?: string
  family_name?: string
  name?: string
  email?: string
  email_verified?: boolean
  phone_number?: string
  phone_number_verified?: boolean
  updated_at?: number
}

interface TochkaEnv {
  clientId: string
  clientSecret: string
  redirectUri: string
  ssoBaseUrl: string
}

function loadEnv(): TochkaEnv {
  const clientId = process.env.TOCHKA_CLIENT_ID
  const clientSecret = process.env.TOCHKA_CLIENT_SECRET
  const redirectUri = process.env.TOCHKA_REDIRECT_URI
  const ssoBaseUrl = process.env.TOCHKA_SSO_BASE_URL || DEFAULT_SSO_BASE
  if (!clientId || !clientSecret || !redirectUri) {
    throw new TochkaError(
      'missing_env',
      '[tochka-oauth] missing TOCHKA_CLIENT_ID / TOCHKA_CLIENT_SECRET / TOCHKA_REDIRECT_URI'
    )
  }
  return { clientId, clientSecret, redirectUri, ssoBaseUrl }
}

/**
 * Build authorize URL. `state` — непрозрачная CSRF-строка (генерится в server-action,
 * сверяется в callback против одноимённой куки). Партнёрский контекст не тащим.
 */
export function buildAuthorizeUrl(state: string): string {
  const env = loadEnv()
  const params = new URLSearchParams({
    client_id: env.clientId,
    redirect_uri: env.redirectUri,
    response_type: 'code',
    // Боевой клиент 245da9… принимает ТОЛЬКО scope=default (проверено 2026-07-08 на
    // проде: openid / openid,customers / customers / accounts / openapi → 400
    // "Incorrect scope"; default → 302 на логин Точки). go.mpstats дефолтил
    // 'openid,customers', но для этого клиента это невалидно. Значения comma-separated
    // (квирк Точки, не RFC 6749). Override — TOCHKA_SCOPE.
    scope: process.env.TOCHKA_SCOPE || 'default',
    state,
  })
  return `${env.ssoBaseUrl}/authorize?${params.toString()}`
}

/**
 * Exchange authorization code for an access token via POST /token.
 * Uses HTTP Basic auth header for client credentials.
 */
export async function exchangeCodeForToken(
  code: string
): Promise<TochkaTokenResponse> {
  const env = loadEnv()
  const basic = Buffer.from(`${env.clientId}:${env.clientSecret}`).toString(
    'base64'
  )
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: env.redirectUri,
  })

  let resp: Response
  try {
    resp = await tochkaFetch(`${env.ssoBaseUrl}/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        // Browser-like UA + WAF cookie handshake handled by tochkaFetch wrapper.
        'User-Agent': BROWSER_UA,
      },
      body: body.toString(),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    })
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'TimeoutError'
    throw new TochkaError(
      isTimeout ? 'timeout' : 'token_exchange_failed',
      '[tochka-oauth] token exchange network error',
      err
    )
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    console.error(
      '[tochka-oauth] token exchange failed:',
      resp.status,
      text.slice(0, 300)
    )
    throw new TochkaError(
      'token_exchange_failed',
      `[tochka-oauth] token exchange HTTP ${resp.status}`
    )
  }

  const json = (await resp
    .json()
    .catch(() => null)) as TochkaTokenResponse | null
  if (!json || !json.access_token) {
    throw new TochkaError(
      'token_exchange_failed',
      '[tochka-oauth] token response missing access_token'
    )
  }
  return json
}

/** Fetch /user_info with Bearer access token. */
export async function fetchUserInfo(
  accessToken: string
): Promise<TochkaUserInfo> {
  const env = loadEnv()
  let resp: Response
  try {
    resp = await tochkaFetch(`${env.ssoBaseUrl}/user_info`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        // Browser UA + WAF cookie handshake handled by tochkaFetch wrapper.
        'User-Agent': BROWSER_UA,
      },
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    })
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'TimeoutError'
    throw new TochkaError(
      isTimeout ? 'timeout' : 'user_info_failed',
      '[tochka-oauth] user_info network error',
      err
    )
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    console.error(
      '[tochka-oauth] user_info failed:',
      resp.status,
      text.slice(0, 300)
    )
    throw new TochkaError(
      'user_info_failed',
      `[tochka-oauth] user_info HTTP ${resp.status}`
    )
  }

  const json = (await resp.json().catch(() => null)) as TochkaUserInfo | null
  if (!json || !json.sub) {
    throw new TochkaError(
      'user_info_failed',
      '[tochka-oauth] user_info response missing sub'
    )
  }
  return json
}
