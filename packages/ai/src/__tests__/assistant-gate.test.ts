import { describe, it, expect, vi, beforeEach } from 'vitest';

const createMock = vi.fn();
vi.mock('../openrouter', () => ({
  getOpenRouterClient: () => ({ chat: { completions: { create: createMock } } }),
  MODELS: { chat: 'openai/gpt-4.1-mini' },
}));

import { classifyDomain } from '../assistant/gate';

function mockReply(json: unknown) {
  createMock.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(json) } }] });
}

describe('classifyDomain', () => {
  beforeEach(() => createMock.mockReset());

  it('возвращает inDomain=true для бизнес-вопроса селлера', async () => {
    mockReply({ inDomain: true });
    const r = await classifyDomain('из чего складывается ДРР?');
    expect(r.inDomain).toBe(true);
  });

  it('возвращает inDomain=false для офф-топика', async () => {
    mockReply({ inDomain: false });
    const r = await classifyDomain('напиши код на python');
    expect(r.inDomain).toBe(false);
  });

  it('fail-open: при невалидном JSON пропускает (inDomain=true), чтобы не блокировать реального юзера', async () => {
    createMock.mockResolvedValueOnce({ choices: [{ message: { content: 'не json' } }] });
    const r = await classifyDomain('вопрос');
    expect(r.inDomain).toBe(true);
  });
});
