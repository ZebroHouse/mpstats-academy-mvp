import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted: vi.mock фабрики хойстятся выше объявлений — иначе TDZ на этих const.
const { classifyDomain, retrieveForAssistant, synthesizeAssistantResponse, runConciergePipeline } = vi.hoisted(() => ({
  classifyDomain: vi.fn(),
  retrieveForAssistant: vi.fn(),
  synthesizeAssistantResponse: vi.fn(),
  runConciergePipeline: vi.fn(),
}));

vi.mock('./gate', () => ({ classifyDomain }));
vi.mock('./retrieve', () => ({ retrieveForAssistant }));
vi.mock('./synthesize', () => ({ synthesizeAssistantResponse }));
vi.mock('./concierge', () => ({ runConciergePipeline }));

import { runAssistantPipeline } from './pipeline';

describe('runAssistantPipeline routing', () => {
  beforeEach(() => {
    classifyDomain.mockReset();
    retrieveForAssistant.mockReset();
    synthesizeAssistantResponse.mockReset();
    runConciergePipeline.mockReset();
  });

  it('off_domain → отказ, без ретрива', async () => {
    classifyDomain.mockResolvedValue({ category: 'off_domain' });
    const r = await runAssistantPipeline({ query: 'x', history: [] });
    expect(r.category).toBe('off_domain');
    expect(r.lessons).toEqual([]);
    expect(r.navLinks).toEqual([]);
    expect(retrieveForAssistant).not.toHaveBeenCalled();
    expect(runConciergePipeline).not.toHaveBeenCalled();
  });

  it('material → retrieve + synthesize', async () => {
    classifyDomain.mockResolvedValue({ category: 'material' });
    retrieveForAssistant.mockResolvedValue({ lessons: [], jobs: [], materials: [] });
    synthesizeAssistantResponse.mockResolvedValue({ answer: 'A', lessons: [], jobs: [], navLinks: [], materials: [] });
    const r = await runAssistantPipeline({ query: 'как ДРР', history: [] });
    expect(r.category).toBe('material');
    expect(r.answer).toBe('A');
    expect(runConciergePipeline).not.toHaveBeenCalled();
  });

  it('complaint → ведёт себя как material', async () => {
    classifyDomain.mockResolvedValue({ category: 'complaint' });
    retrieveForAssistant.mockResolvedValue({ lessons: [], jobs: [], materials: [] });
    synthesizeAssistantResponse.mockResolvedValue({ answer: 'help', lessons: [], jobs: [], navLinks: [], materials: [] });
    const r = await runAssistantPipeline({ query: 'ничего не работает', history: [] });
    expect(r.category).toBe('complaint');
    expect(synthesizeAssistantResponse).toHaveBeenCalled();
  });

  it('material → retrieve с withMaterials:true', async () => {
    classifyDomain.mockResolvedValue({ category: 'material' });
    retrieveForAssistant.mockResolvedValue({ lessons: [], jobs: [], materials: [] });
    synthesizeAssistantResponse.mockResolvedValue({ answer: 'A', lessons: [], jobs: [], navLinks: [], materials: [] });
    await runAssistantPipeline({ query: 'как считать ДРР', history: [] });
    expect(retrieveForAssistant).toHaveBeenCalledWith('как считать ДРР', { withMaterials: true });
  });

  it('complaint → retrieve с withMaterials:false', async () => {
    classifyDomain.mockResolvedValue({ category: 'complaint' });
    retrieveForAssistant.mockResolvedValue({ lessons: [], jobs: [], materials: [] });
    synthesizeAssistantResponse.mockResolvedValue({ answer: 'help', lessons: [], jobs: [], navLinks: [], materials: [] });
    await runAssistantPipeline({ query: 'не работает', history: [] });
    expect(retrieveForAssistant).toHaveBeenCalledWith('не работает', { withMaterials: false });
  });

  it('platform_help → concierge-ветка', async () => {
    classifyDomain.mockResolvedValue({ category: 'platform_help' });
    runConciergePipeline.mockResolvedValue({ answer: 'нажми X', lessons: [], jobs: [], navLinks: [{ label: 'Профиль', href: '/profile' }] });
    const r = await runAssistantPipeline({ query: 'как отменить', history: [] });
    expect(r.category).toBe('platform_help');
    expect(r.navLinks).toEqual([{ label: 'Профиль', href: '/profile' }]);
    expect(retrieveForAssistant).not.toHaveBeenCalled();
  });
});
