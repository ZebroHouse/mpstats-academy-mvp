import { describe, it, expect } from 'vitest';
import { buildNavLinks } from './concierge-synthesize';
import type { MapEntry } from './types';

const entries: MapEntry[] = [
  { id: 'cancel', kind: 'static', section: 'billing', triggers: [], answer: 'x', deepLink: { label: 'Профиль', href: '/profile' } },
  { id: 'fav', kind: 'static', section: 'navigation', triggers: [], answer: 'y', deepLink: { label: 'Избранное', href: '/learn/favorites' } },
  { id: 'cat', kind: 'dynamic', section: 'catalog', triggers: [], resolver: 'courseFacts' },
];

describe('buildNavLinks', () => {
  it('собирает deep-links только из переданных записей (whitelist)', () => {
    const links = buildNavLinks(entries);
    expect(links).toEqual([
      { label: 'Профиль', href: '/profile' },
      { label: 'Избранное', href: '/learn/favorites' },
    ]);
  });

  it('dynamic без deepLink → пропускается', () => {
    const links = buildNavLinks([entries[2]]);
    expect(links).toEqual([]);
  });
});
