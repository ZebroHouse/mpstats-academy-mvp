import { describe, it, expect, vi, beforeEach } from 'vitest';

const gateMock = vi.fn();
const retrieveMock = vi.fn();
const synthMock = vi.fn();
vi.mock('../assistant/gate', () => ({ classifyDomain: (...a: unknown[]) => gateMock(...a) }));
vi.mock('../assistant/retrieve', () => ({ retrieveForAssistant: (...a: unknown[]) => retrieveMock(...a) }));
vi.mock('../assistant/synthesize', () => ({ synthesizeAssistantResponse: (...a: unknown[]) => synthMock(...a) }));

import { runAssistantPipeline } from '../assistant/pipeline';

describe('runAssistantPipeline', () => {
  beforeEach(() => { gateMock.mockReset(); retrieveMock.mockReset(); synthMock.mockReset(); });

  it('офф-топик: возвращает inDomain=false без ретрива и синтеза', async () => {
    gateMock.mockResolvedValue({ inDomain: false });
    const r = await runAssistantPipeline({ query: 'напиши стих', history: [] });
    expect(r.inDomain).toBe(false);
    expect(r.lessons).toEqual([]);
    expect(retrieveMock).not.toHaveBeenCalled();
    expect(synthMock).not.toHaveBeenCalled();
    expect(r.answer.length).toBeGreaterThan(0);
  });

  it('in-domain: гоняет ретрив + синтез', async () => {
    gateMock.mockResolvedValue({ inDomain: true });
    retrieveMock.mockResolvedValue({ lessons: [{ lessonId: 'L1' }], jobs: [] });
    synthMock.mockResolvedValue({ inDomain: true, answer: 'ответ', lessons: [], jobs: [] });
    const r = await runAssistantPipeline({ query: 'что такое ДРР', history: [] });
    expect(retrieveMock).toHaveBeenCalledWith('что такое ДРР');
    expect(synthMock).toHaveBeenCalled();
    expect(r.answer).toBe('ответ');
  });
});
