import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
vi.mock('../openrouter', () => ({
  MODELS: { chat: 'test-model' },
  getOpenRouterClient: () => ({ chat: { completions: { create: mockCreate } } }),
}));

import { classifyDomain } from './gate';

function reply(json: unknown) {
  return { choices: [{ message: { content: JSON.stringify(json) } }] };
}

describe('classifyDomain', () => {
  beforeEach(() => mockCreate.mockReset());

  it('возвращает platform_help', async () => {
    mockCreate.mockResolvedValue(reply({ category: 'platform_help' }));
    expect(await classifyDomain('как отменить подписку')).toEqual({ category: 'platform_help' });
  });

  it('возвращает off_domain', async () => {
    mockCreate.mockResolvedValue(reply({ category: 'off_domain' }));
    expect(await classifyDomain('реши уравнение')).toEqual({ category: 'off_domain' });
  });

  it('fail-open → material при ошибке', async () => {
    // Ошибку моделируем невалидным ответом (JSON.parse бросит внутри classifyDomain).
    // Прямой mockRejectedValue тут не годится: в vitest 2.1.9 отклонённый промис из
    // мока при наличии beforeEach всплывает как unhandled rejection и валит тест,
    // хотя catch в classifyDomain его обрабатывает. Тот же приём — в assistant-gate.test.ts.
    mockCreate.mockResolvedValue({ choices: [{ message: { content: 'не json' } }] });
    expect(await classifyDomain('что угодно')).toEqual({ category: 'material' });
  });

  it('неизвестная категория → material', async () => {
    mockCreate.mockResolvedValue(reply({ category: 'zzz' }));
    expect(await classifyDomain('x')).toEqual({ category: 'material' });
  });
});
