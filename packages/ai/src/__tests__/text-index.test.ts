import { describe, it, expect, vi } from 'vitest';

// text-index.ts imports embeddings (→ server-only) for indexLessonText. These pure-function
// tests don't touch embedding, so neutralize the transitive server-only/embeddings load.
vi.mock('server-only', () => ({}));
vi.mock('../embeddings', () => ({ embedQuery: vi.fn() }));

import { extractPlainText, chunkText } from '../text-index';

describe('extractPlainText', () => {
  it('joins text from nested TipTap nodes with block breaks', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Заголовок' }] },
        { type: 'paragraph', content: [
          { type: 'text', text: 'Привет ' },
          { type: 'text', marks: [{ type: 'bold' }], text: 'мир' },
        ] },
        { type: 'bulletList', content: [
          { type: 'listItem', content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'пункт' }] },
          ] },
        ] },
      ],
    };
    expect(extractPlainText(doc)).toBe('Заголовок\nПривет мир\nпункт');
  });

  it('returns empty string for null/empty doc', () => {
    expect(extractPlainText(null)).toBe('');
    expect(extractPlainText({ type: 'doc', content: [] })).toBe('');
  });
});

describe('chunkText', () => {
  it('splits long text into chunks under maxLen, never mid-word', () => {
    const para = 'слово '.repeat(400).trim(); // ~2400 chars
    const chunks = chunkText(para, 1500);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1500);
  });

  it('keeps short text as a single chunk', () => {
    expect(chunkText('короткий текст', 1500)).toEqual(['короткий текст']);
  });

  it('drops empty/whitespace input', () => {
    expect(chunkText('   ', 1500)).toEqual([]);
  });
});
