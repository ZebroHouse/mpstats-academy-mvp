'use client';

import Link from 'next/link';
import { CalendarCheck, Search, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DarkIsland, DarkIslandStat } from '@/components/ui/dark-island';
import { BentoCard } from '@/components/ui/bento-card';
import { Skeleton } from '@/components/ui/skeleton';
import { LessonCard } from '@/components/learning/LessonCard';
import { Shelf } from '@/components/learning/Shelf';
import { DatabaseError } from '@/components/shared/DatabaseError';
import { trpc } from '@/lib/trpc/client';

// 3 bento entry cards (v2 reskin). plan→blue, library→gray, solutions→dark.
const ENTRY_CARDS = [
  {
    href: '/learn/plan',
    tone: 'blue' as const,
    icon: CalendarCheck,
    title: 'Продолжить мой план',
    sub: 'Персональный план на основе диагностики',
    dataTour: 'dashboard-learn-cta',
  },
  {
    href: '/learn/library',
    tone: 'gray' as const,
    icon: Search,
    title: 'Найти быстрый ответ',
    sub: 'Поиск по урокам и материалам',
    dataTour: undefined,
  },
  {
    href: '/learn/solutions',
    tone: 'dark' as const,
    icon: Target,
    title: 'Решить задачу',
    sub: 'Инструкции под конкретную задачу',
    dataTour: undefined,
  },
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
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-5 w-64" />
        </div>
        <div className="grid md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="shadow-mp-card">
              <CardContent className="py-5">
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-4 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="grid md:grid-cols-2 gap-4">
              <Skeleton className="h-48 rounded-xl" />
              <Skeleton className="h-48 rounded-xl" />
            </div>
          </div>
          <Skeleton className="h-72 rounded-xl" />
        </div>
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

      {/* Hero — DarkIsland (v2): greeting + plan CTA + learning stats */}
      {(() => {
        const lessons = dashboard?.stats.totalLessonsCompleted || 0;
        const watch = dashboard?.stats.totalWatchTime || 0;
        const streak = dashboard?.stats.currentStreak || 0;
        const completion = dashboard?.completionPercent || 0;
        const allZero = lessons === 0 && watch === 0 && streak === 0 && completion === 0;
        return (
          <DarkIsland
            className="animate-slide-up"
            eyebrow="MPSTATS Academy"
            title={`Привет, ${name}!`}
            subtitle={
              allZero
                ? 'Начните с диагностики — соберём персональный план, и здесь появится ваша статистика.'
                : 'Продолжайте обучение — ваш персональный план ждёт.'
            }
            cta={{
              label: allZero ? 'Пройти диагностику →' : 'К моему плану →',
              href: allZero ? '/diagnostic' : '/learn/plan',
            }}
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

      {/* 3 bento entry cards (v2) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 animate-slide-up" style={{ animationDelay: '50ms' }}>
        {ENTRY_CARDS.map(({ href, tone, icon, title, sub, dataTour }) => (
          <BentoCard key={href} href={href} tone={tone} icon={icon} title={title} sub={sub} dataTour={dataTour} />
        ))}
      </div>

      {/* Diagnostic entry + next-lesson — single-column stack above the shelf feed */}
      <div className="space-y-6 animate-slide-up" style={{ animationDelay: '100ms' }}>
        {/* Diagnostic entry — container-as-button, consistent with the top D-08 cards.
            «Продолжить обучение» removed — it duplicated the «Продолжить мой план» entry card above. */}
        <Link href="/diagnostic">
          <Card data-tour="dashboard-diagnostic-cta" variant="soft-blue" interactive className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-mp-blue-200 text-mp-blue-600 flex items-center justify-center shrink-0">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div>
                <h2 className="text-heading-lg text-mp-gray-900">Пройти диагностику</h2>
                <p className="text-body-sm text-mp-gray-600 mt-1">Узнайте свой уровень по 5 ключевым навыкам</p>
              </div>
            </div>
          </Card>
        </Link>

        {/* Next lesson */}
        {dashboard?.nextLesson && (
          <Card className="shadow-mp-card">
            <CardHeader>
              <CardTitle className="text-heading">Продолжить урок</CardTitle>
            </CardHeader>
            <CardContent>
              <LessonCard lesson={dashboard.nextLesson} />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Zone 2 — Лента полок */}
      <div className="space-y-8 mt-8">
        {storefront.isLoading && <div className="text-body-sm text-mp-gray-500">Загружаем рекомендации…</div>}
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
