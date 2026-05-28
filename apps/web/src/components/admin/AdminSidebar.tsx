'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { LogoMark } from '@/components/shared/Logo';
import {
  LayoutDashboard,
  Users,
  BookOpen,
  FileText,
  MessageSquare,
  BarChart3,
  Ticket,
  Gift,
  Tag,
  Settings,
  ArrowLeft,
  Menu,
  X,
} from 'lucide-react';
import { trpc } from '@/lib/trpc/client';

const navItems = [
  {
    title: 'Dashboard',
    href: '/admin',
    icon: LayoutDashboard,
    superadminOnly: false,
  },
  {
    title: 'Users',
    href: '/admin/users',
    icon: Users,
    superadminOnly: false,
  },
  {
    title: 'Content',
    href: '/admin/content',
    icon: BookOpen,
    superadminOnly: false,
  },
  {
    title: 'Materials',
    href: '/admin/content/materials',
    icon: FileText,
    superadminOnly: false,
  },
  {
    title: 'Comments',
    href: '/admin/comments',
    icon: MessageSquare,
    superadminOnly: false,
  },
  {
    title: 'Analytics',
    href: '/admin/analytics',
    icon: BarChart3,
    superadminOnly: false,
  },
  {
    title: 'Promo',
    href: '/admin/promo',
    icon: Ticket,
    superadminOnly: false,
  },
  {
    title: 'Referrals',
    href: '/admin/referrals',
    icon: Gift,
    superadminOnly: false,
  },
  {
    title: 'Коды амбассадоров',
    href: '/admin/referrals/codes',
    icon: Tag,
    superadminOnly: false,
  },
  {
    title: 'Settings',
    href: '/admin/settings',
    icon: Settings,
    superadminOnly: true,
  },
];

function NavLinks({ userRole, pathname, onNavigate }: { userRole: string; pathname: string; onNavigate?: () => void }) {
  const newComments = trpc.admin.getNewCommentsCount.useQuery(undefined, {
    refetchInterval: 60_000,
  });
  const referralCounts = trpc.referral.adminStatusCounts.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  return (
    <>
      {navItems
        .filter((item) => !item.superadminOnly || userRole === 'SUPERADMIN')
        .map((item) => {
          // Exact match for /admin/referrals (so /admin/referrals/codes doesn't
          // also highlight the parent Referrals entry).
          const isActive =
            item.href === '/admin/referrals'
              ? pathname === '/admin/referrals'
              : pathname === item.href ||
                (item.href !== '/admin' && pathname.startsWith(item.href + '/'));

          const badgeCount =
            item.href === '/admin/comments'
              ? (newComments.data?.count ?? 0)
              : item.href === '/admin/referrals'
                ? (referralCounts.data?.PENDING_REVIEW ?? 0)
                : 0;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-body-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-mp-blue-50 text-mp-blue-600 shadow-mp-sm'
                  : 'text-mp-gray-600 hover:bg-mp-gray-100 hover:text-mp-gray-900',
              )}
            >
              <item.icon
                className={cn(
                  'w-5 h-5 transition-colors',
                  isActive ? 'text-mp-blue-500' : 'text-mp-gray-400',
                )}
              />
              {item.title}
              {badgeCount > 0 && (
                <span className="ml-auto bg-mp-blue-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5">
                  {badgeCount > 99 ? '99+' : badgeCount}
                </span>
              )}
            </Link>
          );
        })}
    </>
  );
}

export function AdminSidebar({ userRole }: { userRole: string }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="w-64 border-r border-mp-gray-200 bg-white hidden md:flex flex-col fixed top-0 left-0 h-screen z-30">
        {/* Logo + Admin badge */}
        <div className="h-16 flex items-center px-4 border-b border-mp-gray-200 gap-2">
          <LogoMark size="sm" href="/admin" />
          <span className="text-heading-sm text-mp-gray-900 font-semibold">Academy</span>
          <span className="ml-auto text-xs font-medium bg-mp-blue-100 text-mp-blue-700 px-2 py-0.5 rounded-full">
            Admin
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          <NavLinks userRole={userRole} pathname={pathname} />
        </nav>

        {/* Footer — back to app */}
        <div className="p-4 border-t border-mp-gray-200">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-body-sm font-medium text-mp-gray-500 hover:bg-mp-gray-100 hover:text-mp-gray-900 transition-all duration-200"
          >
            <ArrowLeft className="w-4 h-4" />
            Назад в приложение
          </Link>
        </div>
      </aside>

      {/* Mobile header bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-white border-b border-mp-gray-200 z-50 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="w-10 h-10 flex items-center justify-center rounded-lg text-mp-gray-600 hover:bg-mp-gray-100 transition-colors"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <span className="text-body-sm font-semibold text-mp-gray-900">Admin</span>
        </div>
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 text-body-sm font-medium text-mp-blue-600"
        >
          <ArrowLeft className="w-4 h-4" />
          Назад
        </Link>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="md:hidden fixed inset-0 bg-black/30 z-40"
            onClick={() => setMobileOpen(false)}
          />
          {/* Drawer */}
          <div className="md:hidden fixed top-14 left-0 right-0 bottom-0 bg-white z-50 overflow-y-auto animate-slide-up">
            <nav className="p-4 space-y-1">
              <NavLinks userRole={userRole} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            </nav>
            <div className="p-4 border-t border-mp-gray-200">
              <Link
                href="/dashboard"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-body-sm font-medium text-mp-gray-500 hover:bg-mp-gray-100 hover:text-mp-gray-900 transition-all duration-200"
              >
                <ArrowLeft className="w-4 h-4" />
                Назад в приложение
              </Link>
            </div>
          </div>
        </>
      )}
    </>
  );
}
