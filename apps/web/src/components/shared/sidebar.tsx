'use client';


import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Logo, LogoIcon } from './Logo';
import { trpc } from '@/lib/trpc/client';

interface NavItem {
  title: string;
  href: string;
  icon: React.ReactNode;
}

interface NavSubItem {
  title: string;
  href: string;
}

// «Обучение 2.0» sub-routes (D-01) — canon labels, no «трек»/«плейбук»/«джоба»
export const learnSubItems: NavSubItem[] = [
  { title: 'Персональный план', href: '/learn/plan' },
  { title: 'Решения под задачу', href: '/learn/solutions' },
  { title: 'База знаний', href: '/learn/library' },
  { title: 'Избранное', href: '/learn/favorites' },
];

const learnGroupIcon = (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
  </svg>
);

const navItems: NavItem[] = [
  {
    title: 'Главная',
    href: '/dashboard',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    title: 'Диагностика',
    href: '/diagnostic',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    // MPSTATS logo mark = platform LogoIcon in the MPSTATS brand green (#17BF50,
    // from go_mpstats_academy/brand-assets/logos). Only coloured icon in the menu.
    title: 'Инструменты MPSTATS',
    href: '/mpstats-tools',
    icon: <LogoIcon size={20} primaryColor="#17BF50" className="w-5 h-5" />,
  },
  {
    title: 'Профиль',
    href: '/profile',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
];

const adminNavItem: NavItem = {
  title: 'Админка',
  href: '/admin',
  icon: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
};

const supportNavItem: NavItem = {
  title: 'Поддержка',
  href: '/support',
  icon: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

const billingNavItem: NavItem = {
  title: 'Тарифы',
  href: '/pricing',
  icon: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h.01M11 15h2M7 15a1 1 0 100-2 1 1 0 000 2zM3 6a2 2 0 012-2h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6z" />
    </svg>
  ),
};

export function Sidebar({ partnerEnabled = false }: { partnerEnabled?: boolean }) {
  const pathname = usePathname();
  const isLearnActive = pathname.startsWith('/learn');
  const [learnOpen, setLearnOpen] = useState(isLearnActive);
  const { data: billingEnabled } = trpc.billing.isEnabled.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const { data: myProfile } = trpc.profile.get.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Build nav items with conditional billing and admin links.
  // Partner-courses entry («Инструменты MPSTATS») is env-gated via partnerEnabled.
  const items = [...navItems].filter((i) => i.href !== '/mpstats-tools' || partnerEnabled);
  if (billingEnabled) {
    // Insert before "Профиль" (last item)
    items.splice(items.length - 1, 0, billingNavItem);
  }
  const isAdmin = myProfile?.role === 'ADMIN' || myProfile?.role === 'SUPERADMIN';

  return (
    <aside className="w-64 border-r border-mp-gray-200 bg-white hidden md:flex flex-col fixed top-0 left-0 h-screen z-30">
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-mp-gray-200">
        <Link href="/dashboard" className="flex items-center">
          <Logo size="sm" showText={false} />
          <span className="ml-2 text-heading-sm text-mp-gray-900 font-semibold">Academy</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1" data-tour="sidebar-nav">
        {items.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');

          const link = (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-body-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-mp-blue-50 text-mp-blue-600 shadow-mp-sm'
                  : 'text-mp-gray-600 hover:bg-mp-gray-100 hover:text-mp-gray-900'
              )}
            >
              <span className={cn(
                'transition-colors',
                isActive ? 'text-mp-blue-500' : 'text-mp-gray-400'
              )}>
                {item.icon}
              </span>
              {item.title}
            </Link>
          );

          // Inject the expandable «Обучение» group right after «Диагностика»
          if (item.href === '/diagnostic') {
            return (
              <div key="learn-group-wrap">
                {link}
                {/* Expandable «Обучение» group (D-01) — hand-rolled toggle, no radix Collapsible */}
                <button
                  type="button"
                  data-tour="learn-submenu"
                  onClick={() => setLearnOpen((o) => !o)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-body-sm font-medium transition-all duration-200',
                    isLearnActive
                      ? 'bg-mp-blue-50 text-mp-blue-600 shadow-mp-sm'
                      : 'text-mp-gray-600 hover:bg-mp-gray-100 hover:text-mp-gray-900'
                  )}
                  aria-expanded={learnOpen}
                >
                  <span className={cn(
                    'transition-colors',
                    isLearnActive ? 'text-mp-blue-500' : 'text-mp-gray-400'
                  )}>
                    {learnGroupIcon}
                  </span>
                  <span className="flex-1 text-left">Обучение</span>
                  <svg
                    className={cn(
                      'w-4 h-4 text-mp-gray-400 transition-transform',
                      learnOpen && 'rotate-180'
                    )}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {learnOpen && (
                  <div className="mt-1 space-y-1">
                    {learnSubItems.map((sub) => {
                      const subActive =
                        pathname === sub.href || pathname.startsWith(sub.href + '/');
                      return (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          className={cn(
                            'flex items-center pl-10 pr-3 py-2 rounded-lg text-body-sm font-medium transition-all duration-200',
                            subActive
                              ? 'bg-mp-blue-50 text-mp-blue-600 shadow-mp-sm'
                              : 'text-mp-gray-600 hover:bg-mp-gray-100 hover:text-mp-gray-900'
                          )}
                        >
                          {sub.title}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          return link;
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-mp-gray-200 space-y-1">
        <Link
          href={supportNavItem.href}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-body-sm font-medium transition-all duration-200',
            pathname === '/support'
              ? 'bg-mp-blue-50 text-mp-blue-600 shadow-mp-sm'
              : 'text-mp-gray-600 hover:bg-mp-gray-100 hover:text-mp-gray-900'
          )}
        >
          <span className={cn(
            'transition-colors',
            pathname === '/support' ? 'text-mp-blue-500' : 'text-mp-gray-400'
          )}>
            {supportNavItem.icon}
          </span>
          {supportNavItem.title}
        </Link>
        {isAdmin && (
          <Link
            href={adminNavItem.href}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-body-sm font-medium transition-all duration-200',
              pathname.startsWith('/admin')
                ? 'bg-mp-blue-50 text-mp-blue-600 shadow-mp-sm'
                : 'text-mp-gray-600 hover:bg-mp-gray-100 hover:text-mp-gray-900'
            )}
          >
            <span className={cn(
              'transition-colors',
              pathname.startsWith('/admin') ? 'text-mp-blue-500' : 'text-mp-gray-400'
            )}>
              {adminNavItem.icon}
            </span>
            {adminNavItem.title}
          </Link>
        )}
        <Link
          href="/legal/offer"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-body-sm font-medium transition-all duration-200 text-mp-gray-600 hover:bg-mp-gray-100 hover:text-mp-gray-900"
        >
          <span className="text-mp-gray-400 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </span>
          Правовая информация
        </Link>
        <div className="px-3 py-2 text-caption text-mp-gray-400">
          MPSTATS Academy v1.0
        </div>
      </div>
    </aside>
  );
}
