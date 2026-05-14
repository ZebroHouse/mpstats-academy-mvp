import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@mpstats/ai', () => ({
  searchChunksPublic: vi.fn(),
}));

import { POST } from '../route';
import { searchChunksPublic } from '@mpstats/ai';

const mockedSearch = vi.mocked(searchChunksPublic);

beforeEach(() => {
  mockedSearch.mockReset();
  process.env.RAG_API_TOKENS = '["test_token"]';
});

function makeReq(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/rag/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('POST /api/rag/search', () => {
  it('returns 401 when Authorization header missing', async () => {
    const res = await POST(makeReq({ query: 'x' }));
    expect(res.status).toBe(401);
  });

  it('returns 401 for invalid bearer token', async () => {
    const res = await POST(makeReq({ query: 'x' }, { Authorization: 'Bearer wrong' }));
    expect(res.status).toBe(401);
  });

  it('returns 503 when RAG_API_TOKENS is empty (auth disabled by default)', async () => {
    process.env.RAG_API_TOKENS = '[]';
    const res = await POST(makeReq({ query: 'x' }, { Authorization: 'Bearer test_token' }));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/disabled|no tokens/i);
  });

  it('returns 400 when body is missing query', async () => {
    const res = await POST(
      makeReq({}, { Authorization: 'Bearer test_token' }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when query is empty string', async () => {
    const res = await POST(
      makeReq({ query: '' }, { Authorization: 'Bearer test_token' }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 200 with chunks on valid request', async () => {
    mockedSearch.mockResolvedValue({
      chunks: [
        {
          content: 'snippet',
          lessonId: 'L1',
          lessonTitle: 'L1 title',
          courseTitle: 'C1 title',
          source_type: 'video',
          trust_tier: 1,
          similarity: 0.92,
          deeplink: 'https://platform.mpstats.academy/learn/L1?t=10',
        },
      ],
    });

    const res = await POST(
      makeReq(
        { query: 'размерная сетка', limit: 3 },
        { Authorization: 'Bearer test_token' },
      ),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { chunks: { lessonId: string }[] };
    expect(body.chunks).toHaveLength(1);
    expect(body.chunks[0]!.lessonId).toBe('L1');
    expect(mockedSearch).toHaveBeenCalledWith({
      query: 'размерная сетка',
      limit: 3,
      threshold: undefined,
      sourceTypes: undefined,
      trustTiers: undefined,
    });
  });

  it('clamps limit to [1, 25]', async () => {
    mockedSearch.mockResolvedValue({ chunks: [] });
    await POST(
      makeReq({ query: 'q', limit: 99 }, { Authorization: 'Bearer test_token' }),
    );
    expect(mockedSearch).toHaveBeenCalledWith(expect.objectContaining({ limit: 25 }));

    mockedSearch.mockClear();
    await POST(
      makeReq({ query: 'q', limit: 0 }, { Authorization: 'Bearer test_token' }),
    );
    expect(mockedSearch).toHaveBeenCalledWith(expect.objectContaining({ limit: 1 }));
  });

  it('returns 500 if searchChunksPublic throws', async () => {
    mockedSearch.mockRejectedValue(new Error('db down'));
    const res = await POST(
      makeReq({ query: 'q' }, { Authorization: 'Bearer test_token' }),
    );
    expect(res.status).toBe(500);
  });
});
