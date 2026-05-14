import { timingSafeEqual } from 'node:crypto';

/** Extracts the token value from `Authorization: Bearer <token>`. Null if missing or non-Bearer scheme. */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const trimmed = authHeader.trim();
  const prefix = 'Bearer ';
  if (!trimmed.startsWith(prefix)) return null;
  const token = trimmed.slice(prefix.length).trim();
  return token.length > 0 ? token : null;
}

/**
 * Constant-time check against an allowlist of valid tokens.
 * Returns true iff `token` exactly matches at least one entry in `allowed`.
 * Empty/missing inputs always return false.
 */
export function validateBearerToken(token: string | null, allowed: string[]): boolean {
  if (!token || allowed.length === 0) return false;
  const tokenBuf = Buffer.from(token, 'utf-8');
  let matched = false;
  for (const candidate of allowed) {
    const candBuf = Buffer.from(candidate, 'utf-8');
    if (candBuf.length === tokenBuf.length && timingSafeEqual(candBuf, tokenBuf)) {
      matched = true;
      // don't break — keep loop running to avoid timing on # of allowed tokens
    }
  }
  return matched;
}

/** Parse `RAG_API_TOKENS` env into a string array. Tolerant: empty / malformed = []. */
export function parseAllowedTokens(envValue: string | undefined): string[] {
  if (!envValue) return [];
  try {
    const parsed = JSON.parse(envValue) as unknown;
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
      return parsed.filter((x) => x.length > 0);
    }
    return [];
  } catch {
    return [];
  }
}
