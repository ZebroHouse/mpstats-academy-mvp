import { describe, it, expect, vi, beforeEach } from 'vitest';

// server-only guard throws in non-server environments — mock it out
vi.mock('server-only', () => ({}));

const mockResolve = vi.hoisted(() => vi.fn());

// Mock @mpstats/ai — use direct object to avoid importOriginal issues
vi.mock('@mpstats/ai', () => ({
  resolveIntent: mockResolve,
  searchChunks: vi.fn(),
  generateLessonSummary: vi.fn(),
  generateChatResponse: vi.fn(),
  embedQuery: vi.fn(),
  embedBatch: vi.fn(),
  openrouter: {},
  retrieve: vi.fn(),
  PROFILES: {},
  tagLesson: vi.fn(),
  generateDiagnosticQuestions: vi.fn(),
  CATEGORY_TO_COURSES: {},
  generatedQuestionSchema: {},
  searchChunksPublic: vi.fn(),
  callWithSpan: vi.fn(),
}));

import { intentRouter } from '../intent';

describe('intent.resolve', () => {
  let ctx: any;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = {
      user: { id: 'user-1' },
      prisma: {
        userProfile: {
          findUnique: vi.fn().mockResolvedValue(null),
          update: vi.fn().mockResolvedValue({}),
        },
      },
    };
  });

  const caller = () => intentRouter.createCaller(ctx);

  it('forwards query and surface to resolveIntent', async () => {
    mockResolve.mockResolvedValue({ mode: 'empty', message: 'x' });
    await caller().resolve({ query: 'снизить ДРР', surface: 'learn' });
    expect(mockResolve).toHaveBeenCalledWith({ query: 'снизить ДРР', surface: 'learn', conversationState: undefined });
  });

  it('rejects empty query', async () => {
    await expect(caller().resolve({ query: '', surface: 'learn' })).rejects.toThrow();
  });
});
