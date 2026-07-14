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

  it('дедуп по href: несколько записей на одну страницу → одна карточка', () => {
    const dupes: MapEntry[] = [
      { id: 'plan', kind: 'static', section: 'nav', triggers: [], answer: 'a', deepLink: { label: 'Открыть план', href: '/learn/plan' } },
      { id: 'recos', kind: 'static', section: 'diag', triggers: [], answer: 'b', deepLink: { label: 'Открыть план', href: '/learn/plan' } },
      { id: 'rebuild', kind: 'static', section: 'diag', triggers: [], answer: 'c', deepLink: { label: 'Открыть план', href: '/learn/plan' } },
    ];
    expect(buildNavLinks(dupes)).toEqual([{ label: 'Открыть план', href: '/learn/plan' }]);
  });
});
