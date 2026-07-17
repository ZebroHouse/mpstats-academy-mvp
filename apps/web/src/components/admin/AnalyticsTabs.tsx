'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { label: 'Обзор', href: '/admin/analytics' },
  { label: 'Выручка', href: '/admin/analytics/revenue' },
  { label: 'Воронка', href: '/admin/analytics/funnel' },
  { label: 'Рефералы', href: '/admin/analytics/referrals' },
  { label: 'Клиенты', href: '/admin/analytics/clients' },
  { label: 'Контент', href: '/admin/analytics/content' },
  { label: 'Чекпоинты', href: '/admin/analytics/checkpoints' },
  { label: 'Ассистент', href: '/admin/analytics/assistant' },
] as const;

export function AnalyticsTabs({ role }: { role?: string }) {
  const pathname = usePathname();
  // SALES only has access to the client registry — show just that tab.
  const tabs = role === 'SALES' ? TABS.filter((t) => t.href === '/admin/analytics/clients') : TABS;

  return (
    <div className="border-b border-mp-gray-200">
      <nav className="flex gap-1 -mb-px overflow-x-auto">
        {tabs.map((tab) => {
          const isActive =
            tab.href === '/admin/analytics'
              ? pathname === '/admin/analytics'
              : pathname === tab.href || pathname.startsWith(tab.href + '/');
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'px-4 py-2.5 text-body-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                isActive
                  ? 'border-mp-blue-600 text-mp-blue-600'
                  : 'border-transparent text-mp-gray-500 hover:text-mp-gray-900',
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
