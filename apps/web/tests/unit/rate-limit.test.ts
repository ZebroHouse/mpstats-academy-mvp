import { describe, it, expect } from 'vitest';
import { createFixedWindowLimiter, clientIp } from '@/lib/rate-limit';

describe('createFixedWindowLimiter', () => {
  it('allows up to `limit` requests within the window, blocks the next', () => {
    const rl = createFixedWindowLimiter(3, 60_000);
    expect(rl.check('1.1.1.1', 0)).toBe(true);
    expect(rl.check('1.1.1.1', 10)).toBe(true);
    expect(rl.check('1.1.1.1', 20)).toBe(true);
    expect(rl.check('1.1.1.1', 30)).toBe(false); // 4th within window → blocked
  });

  it('resets once the window elapses', () => {
    const rl = createFixedWindowLimiter(2, 1000);
    expect(rl.check('ip', 0)).toBe(true);
    expect(rl.check('ip', 500)).toBe(true);
    expect(rl.check('ip', 900)).toBe(false); // still in window
    expect(rl.check('ip', 1000)).toBe(true); // window elapsed → fresh
  });

  it('tracks keys independently', () => {
    const rl = createFixedWindowLimiter(1, 60_000);
    expect(rl.check('a', 0)).toBe(true);
    expect(rl.check('b', 0)).toBe(true); // different key, own budget
    expect(rl.check('a', 0)).toBe(false);
  });
});

describe('clientIp', () => {
  const req = (headers: Record<string, string>) =>
    new Request('https://x/api', { headers });

  it('takes the first hop from x-forwarded-for', () => {
    expect(clientIp(req({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7');
  });

  it('falls back to x-real-ip', () => {
    expect(clientIp(req({ 'x-real-ip': '198.51.100.4' }))).toBe('198.51.100.4');
  });

  it('returns "unknown" when no IP header is present', () => {
    expect(clientIp(req({}))).toBe('unknown');
  });
});
