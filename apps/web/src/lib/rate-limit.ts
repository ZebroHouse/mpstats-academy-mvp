/**
 * Tiny in-memory fixed-window rate limiter for public route handlers.
 *
 * Single-instance app (one web container), so an in-process Map is enough — this
 * is a throttle against scripted abuse, not a distributed security boundary. State
 * resets on redeploy, which is fine for that purpose.
 */

export interface RateLimiter {
  /** Returns true if the request is allowed, false if the key is over its budget. */
  check(key: string, now: number): boolean;
}

/** Soft cap on tracked keys — prune expired entries past this to bound memory. */
const MAX_TRACKED_KEYS = 10_000;

export function createFixedWindowLimiter(limit: number, windowMs: number): RateLimiter {
  const hits = new Map<string, { count: number; windowStart: number }>();

  return {
    check(key, now) {
      const rec = hits.get(key);
      if (!rec || now - rec.windowStart >= windowMs) {
        if (hits.size > MAX_TRACKED_KEYS) {
          for (const [k, v] of hits) {
            if (now - v.windowStart >= windowMs) hits.delete(k);
          }
        }
        hits.set(key, { count: 1, windowStart: now });
        return true;
      }
      if (rec.count >= limit) return false;
      rec.count += 1;
      return true;
    },
  };
}

/**
 * Best-effort client IP from proxy headers. Behind nginx/KVMKA the real client is
 * the first hop of x-forwarded-for; x-real-ip is the fallback. 'unknown' groups
 * header-less callers into one bucket (still throttled together).
 */
export function clientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get('x-real-ip');
  if (real?.trim()) return real.trim();
  return 'unknown';
}
