import { describe, it, expect, vi } from 'vitest';
import { startOfMskDay, FREE_DAILY, PAID_DAILY, getAssistantQuota } from '../utils/assistant-quota';

describe('startOfMskDay', () => {
  it('11:00 UTC 8 июля → полночь МСК = 21:00 UTC 7 июля', () => {
    const d = startOfMskDay(new Date('2026-07-08T11:00:00Z'));
    expect(d.toISOString()).toBe('2026-07-07T21:00:00.000Z');
  });
  it('01:00 UTC (04:00 МСК) → полночь МСК = 21:00 UTC предыдущего дня', () => {
    const d = startOfMskDay(new Date('2026-07-08T01:00:00Z'));
    expect(d.toISOString()).toBe('2026-07-07T21:00:00.000Z');
  });
});

describe('getAssistantQuota', () => {
  function fakePrisma(subCount: number, msgCount: number, role = 'ADMIN_NONE') {
    return {
      subscription: { findMany: vi.fn().mockResolvedValue(Array.from({ length: subCount }, () => ({ id: 'x', courseId: null, plan: { type: 'PLATFORM' } }))) },
      userProfile: { findUnique: vi.fn().mockResolvedValue({ role: role === 'ADMIN' ? 'ADMIN' : 'USER' }) },
      assistantMessage: { count: vi.fn().mockResolvedValue(msgCount) },
    } as any;
  }

  it('free-тир: нет активных подписок → лимит 5', async () => {
    const q = await getAssistantQuota('u1', fakePrisma(0, 2), new Date('2026-07-08T11:00:00Z'));
    expect(q.tier).toBe('free');
    expect(q.limit).toBe(FREE_DAILY);
    expect(q.remaining).toBe(3);
  });

  it('full-тир: есть активная подписка → лимит 50', async () => {
    const q = await getAssistantQuota('u1', fakePrisma(1, 10), new Date('2026-07-08T11:00:00Z'));
    expect(q.tier).toBe('full');
    expect(q.limit).toBe(PAID_DAILY);
    expect(q.remaining).toBe(40);
  });

  it('remaining не уходит в минус', async () => {
    const q = await getAssistantQuota('u1', fakePrisma(0, 99), new Date('2026-07-08T11:00:00Z'));
    expect(q.remaining).toBe(0);
  });

  it('admin-bypass: без подписок, но ADMIN → full-тир (лимит 50)', async () => {
    const q = await getAssistantQuota('u1', fakePrisma(0, 0, 'ADMIN'), new Date('2026-07-08T11:00:00Z'));
    expect(q.tier).toBe('full');
    expect(q.limit).toBe(PAID_DAILY);
  });
});
