import { describe, it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../embeddings', () => ({ embedQuery: vi.fn() }));
import { extractPlainText } from '../text-index';

describe('extractPlainText — interactive nodes', () => {
  it('extracts nested branch paragraphs AND option labels', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Кем стать?' }] },
        {
          type: 'checkpoint',
          attrs: { id: 'cp1' },
          content: [
            {
              type: 'checkpointOption',
              attrs: { id: 'o1', label: 'Космонавт' },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Космонавты много зарабатывают.' }] }],
            },
            {
              type: 'checkpointOption',
              attrs: { id: 'o2', label: 'Водолаз' },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Водолазы работают под водой.' }] }],
            },
          ],
        },
      ],
    };
    const out = extractPlainText(doc);
    const lines = out.split('\n');
    expect(out).toContain('Кем стать?');
    // Label must surface as its OWN line, not merely as a substring of the
    // branch body ("Космонавт" is a prefix of "Космонавты…"), so assert the
    // exact line is present.
    expect(lines).toContain('Космонавт'); // label
    expect(out).toContain('Космонавты много зарабатывают.'); // branch body
    expect(lines).toContain('Водолаз'); // label
    expect(out).toContain('Водолазы работают под водой.');
  });

  it('ignores revealGate (no extractable text)', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'до гейта' }] },
        { type: 'revealGate', attrs: { id: 'g1', buttonLabel: 'Читать дальше' } },
        { type: 'paragraph', content: [{ type: 'text', text: 'после гейта' }] },
      ],
    };
    expect(extractPlainText(doc)).toBe('до гейта\nпосле гейта');
  });
});
