import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PLATFORM_MAP } from '@mpstats/ai';

// Каждый deepLink.href в карте должен соответствовать реальному роуту App Router.
// Роут /a/b → apps/web/src/app/a/b/page.tsx (учитываем route-группы (main)/(auth)).
const APP_DIR = join(__dirname, '..', '..', 'src', 'app');
const GROUPS = ['', '(main)', '(auth)'];

function routeExists(href: string): boolean {
  const path = href.split('?')[0].replace(/^\//, '');
  return GROUPS.some((g) => existsSync(join(APP_DIR, g, path, 'page.tsx')));
}

describe('platform map deep-links', () => {
  const links = PLATFORM_MAP.flatMap((e) =>
    e.kind === 'static' && e.deepLink ? [e.deepLink.href] : [],
  );

  it('в карте есть хотя бы одна ссылка', () => {
    expect(links.length).toBeGreaterThan(0);
  });

  it.each(links)('href %s резолвится в реальный роут', (href) => {
    expect(routeExists(href)).toBe(true);
  });
});
