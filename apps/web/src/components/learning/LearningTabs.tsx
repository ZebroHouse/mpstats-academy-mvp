'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/**
 * Mobile-only horizontal pill-tab strip for the «Обучение 2.0» sub-sections (D-01, A3).
 *
 * The bottom bar has no room for 4 items, so a single «Обучение» item routes to the
 * default sub-section and this strip exposes all 4 sub-routes at the top of every
 * `/learn/*` page on mobile (`md:hidden`). 61-02 mounts it at the top of each page.
 */
const tabs = [
  { title: 'План', href: '/learn/plan' },
  { title: 'Решения', href: '/learn/solutions' },
  { title: 'База знаний', href: '/learn/library' },
  { title: 'Избранное', href: '/learn/favorites' },
];

export function LearningTabs() {
  const pathname = usePathname();

  return (
    <nav
      className="md:hidden -mx-4 px-4 overflow-x-auto"
      aria-label="Разделы обучения"
    >
      <div className="flex gap-2 min-w-max pb-1">
        {tabs.map((tab) => {
          const isActive =
            pathname === tab.href || pathname.startsWith(tab.href + '/');
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'shrink-0 px-3 py-1.5 rounded-full text-body-sm font-medium transition-colors',
                isActive
                  ? 'bg-mp-blue-50 text-mp-blue-600'
                  : 'text-mp-gray-600 hover:bg-mp-gray-100'
              )}
            >
              {tab.title}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
