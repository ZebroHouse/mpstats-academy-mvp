'use client';

import React from 'react';
import Link from 'next/link';
import { BarChart3, CalendarCheck, Search, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DarkIsland, DarkIslandStat } from '@/components/ui/dark-island';
import { Skeleton } from '@/components/ui/skeleton';
import { Shelf } from '@/components/learning/Shelf';
import { HeroFirstLesson } from '@/components/dashboard/HeroFirstLesson';
import { DatabaseError } from '@/components/shared/DatabaseError';
import { trpc } from '@/lib/trpc/client';

/**
 * Tone palette reused from BentoCard (bento-card.tsx):
 *   blue  → #2C4FF8 (brand blue), white text — plan (primary CTA)
 *   gray  → #f4f4f4 (light fill), dark text  — library (soft, exploratory)
 *   dark  → #0F172A (navy),       white text  — solutions (authoritative)
 *   orange→ #ff6b16 (accent),     white text  — diagnostic (action/energy)
 * Buttons are filled (not white) so they stand out above lesson cards.
 */
type EntryTone = 'blue' | 'gray' | 'dark' | 'orange';

const ENTRY_TONE_STYLES: Record<EntryTone, { bg: React.CSSProperties; wrapper: string; iconBg: string; iconColor: string; labelColor: string }> = {
  blue:   { bg: { backgroundColor: '#2C4FF8' }, wrapper: 'hover:-translate-y-0.5 hover:shadow-md hover:brightness-110', iconBg: 'bg-white/20',          iconColor: 'text-white',      labelColor: 'text-white' },
  gray:   { bg: { backgroundColor: '#f4f4f4' }, wrapper: 'hover:-translate-y-0.5 hover:shadow-md hover:bg-[#e8e8e8]',   iconBg: 'bg-[#121212]/10',       iconColor: 'text-[#121212]',  labelColor: 'text-[#121212]' },
  dark:   { bg: { backgroundColor: '#0F172A' }, wrapper: 'hover:-translate-y-0.5 hover:shadow-md hover:brightness-125', iconBg: 'bg-white/15',           iconColor: 'text-white',      labelColor: 'text-white' },
  orange: { bg: { backgroundColor: '#ff6b16' }, wrapper: 'hover:-translate-y-0.5 hover:shadow-md hover:brightness-110', iconBg: 'bg-white/20',          iconColor: 'text-white',      labelColor: 'text-white' },
};

const ENTRY_BUTTONS: Array<{ href: string; icon: React.ElementType; label: string; dataTour?: string; tone: EntryTone }> = [
  { href: '/learn/plan',     icon: CalendarCheck, label: 'Продолжить мой план',  dataTour: 'dashboard-learn-cta',       tone: 'blue' },
  { href: '/learn/library',  icon: Search,        label: 'Найти быстрый ответ',  dataTour: undefined,                   tone: 'gray' },
  { href: '/learn/solutions',icon: Target,        label: 'Решить задачу',        dataTour: undefined,                   tone: 'dark' },
  { href: '/diagnostic',     icon: BarChart3,     label: 'Пройти диагностику',   dataTour: 'dashboard-diagnostic-cta',  tone: 'orange' },
];

export default function DashboardPage() {
  const { data: profile } = trpc.profile.get.useQuery();
  const { data: dashboard, isLoading, error } = trpc.profile.getDashboard.useQuery();
  const storefront = trpc.dashboard.getStorefront.useQuery();

  const name = profile?.name || 'Пользователь';

  if (error) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-display-sm text-mp-gray-900">
            Привет, {name}!
          </h1>
          <p className="text-body text-mp-gray-500 mt-1">
            Добро пожаловать в MPSTATS Academy
          </p>
        </div>
        <DatabaseError error={{ message: error.message }} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        {/* Slim hero placeholder */}
        <Skeleton className="h-28 rounded-2xl" />
        {/* 4 compact entry button placeholders */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
        {/* Shelf-row placeholders */}
        {[1, 2].map(i => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-5 w-40" />
            <div className="flex gap-4 overflow-hidden">
              {[1, 2, 3].map(j => (
                <Skeleton key={j} className="h-36 w-56 shrink-0 rounded-xl" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Profile completeness banner */}
      {profile && !profile.name && (
        <Card className="border-mp-blue-200 bg-mp-blue-50 animate-slide-up" style={{ animationDelay: '0ms' }}>
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-mp-blue-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-mp-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <p className="text-body-sm font-semibold text-mp-gray-800">Заполните профиль</p>
                <p className="text-body-xs text-mp-gray-500">Укажите ваше имя и загрузите фото для персонализации</p>
              </div>
            </div>
            <Link href="/profile">
              <Button variant="default" size="sm">
                Перейти в профиль
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Hero — DarkIsland (v2), slim: greeting + learning stats only */}
      {(() => {
        const lessons = dashboard?.stats.totalLessonsCompleted || 0;
        const watch = dashboard?.stats.totalWatchTime || 0;
        const streak = dashboard?.stats.currentStreak || 0;
        const completion = dashboard?.completionPercent || 0;
        const allZero = lessons === 0 && watch === 0 && streak === 0 && completion === 0;
        return (
          <DarkIsland
            className="animate-slide-up p-5 sm:p-6"
            eyebrow="MPSTATS Academy"
            title={`Привет, ${name}!`}
            aside={
              allZero ? undefined : (
                <div className="flex gap-8">
                  <DarkIslandStat value={lessons} label="уроков пройдено" />
                  <DarkIslandStat value={watch} label="минут обучения" />
                  <DarkIslandStat value={streak} label="дней подряд" />
                </div>
              )
            }
          />
        );
      })()}

      <HeroFirstLesson />

      {/* Compact entry row — 4 icon-inline buttons (incl. diagnostic), each with own BentoCard tone */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-slide-up" style={{ animationDelay: '50ms' }}>
        {ENTRY_BUTTONS.map(({ href, icon: Icon, label, dataTour, tone }) => {
          const t = ENTRY_TONE_STYLES[tone];
          return (
            <Link
              key={href}
              href={href}
              data-tour={dataTour}
              className={`flex items-center gap-3 rounded-2xl px-4 py-4 transition-all ${t.wrapper}`}
              style={t.bg}
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${t.iconBg} ${t.iconColor}`}>
                <Icon className="h-5 w-5" />
              </span>
              <span className={`text-body-sm font-semibold leading-tight ${t.labelColor}`}>{label}</span>
            </Link>
          );
        })}
      </div>

      {/* Zone 2 — Лента полок */}
      <div className="space-y-8 mt-8 animate-slide-up" style={{ animationDelay: '150ms' }}>
        {storefront.isLoading && <div className="text-body-sm text-mp-gray-500">Загружаем рекомендации…</div>}
        {storefront.isError && (
          <div className="text-body-sm text-mp-gray-500">
            Не удалось загрузить рекомендации.{' '}
            <button onClick={() => storefront.refetch()} className="text-mp-blue-600 hover:underline">
              Повторить
            </button>
          </div>
        )}
        {storefront.data?.map((shelf) => <Shelf key={shelf.shelfKey} shelf={shelf} />)}
        {storefront.data && storefront.data.length === 0 && (
          <div className="text-center py-10 text-body-sm text-mp-gray-500">
            Пройди <Link href="/diagnostic" className="text-mp-blue-600">диагностику</Link>, чтобы собрать персональную ленту.
          </div>
        )}
      </div>
    </div>
  );
}
