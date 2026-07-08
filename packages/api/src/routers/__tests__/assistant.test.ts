import { describe, it, expect, vi, beforeEach } from 'vitest';

const pipelineMock = vi.fn();
vi.mock('@mpstats/ai', () => ({ runAssistantPipeline: (...a: unknown[]) => pipelineMock(...a) }));

const quotaMock = vi.fn();
vi.mock('../../utils/assistant-quota', async (orig) => {
  const actual = await (orig as any)();
  return { ...actual, getAssistantQuota: (...a: unknown[]) => quotaMock(...a) };
});

import { assistantRouter } from '../assistant';

function makeCtx() {
  const conversation = { id: 'C1', userId: 'u1' };
  const prisma = {
    assistantConversation: {
      findFirst: vi.fn().mockResolvedValue(conversation),
      create: vi.fn().mockResolvedValue(conversation),
      update: vi.fn().mockResolvedValue(conversation),
    },
    assistantMessage: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
    },
    userProfile: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    userActivityDay: {
      upsert: vi.fn().mockResolvedValue({}),
    },
  };
  return { prisma, user: { id: 'u1' } } as any;
}

describe('assistant.sendMessage', () => {
  beforeEach(() => { pipelineMock.mockReset(); quotaMock.mockReset(); });

  it('блокирует при исчерпанной квоте (FORBIDDEN)', async () => {
    quotaMock.mockResolvedValue({ tier: 'free', limit: 5, used: 5, remaining: 0, resetsAt: new Date() });
    const caller = assistantRouter.createCaller(makeCtx());
    await expect(caller.sendMessage({ message: 'привет' })).rejects.toThrow(/quota/);
    expect(pipelineMock).not.toHaveBeenCalled();
  });

  it('гоняет пайплайн, персистит user+assistant сообщения, возвращает ответ+квоту', async () => {
    quotaMock
      .mockResolvedValueOnce({ tier: 'full', limit: 50, used: 0, remaining: 50, resetsAt: new Date() })
      .mockResolvedValueOnce({ tier: 'full', limit: 50, used: 1, remaining: 49, resetsAt: new Date() });
    pipelineMock.mockResolvedValue({ inDomain: true, answer: 'ответ про ДРР', lessons: [{ lessonId: 'L1', title: 'x', durationMin: 5, courseTitle: null, reason: '' }], jobs: [] });
    const ctx = makeCtx();
    const caller = assistantRouter.createCaller(ctx);
    const res = await caller.sendMessage({ message: 'что такое ДРР' });
    expect(res.answer).toBe('ответ про ДРР');
    expect(res.lessons).toHaveLength(1);
    expect(res.quota.remaining).toBe(49);
    expect(ctx.prisma.assistantMessage.create).toHaveBeenCalledTimes(2);
  });
});
