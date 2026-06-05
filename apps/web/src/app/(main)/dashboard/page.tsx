'use client';

import Link from 'next/link';
import { CalendarCheck, Search, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { SkillRadarChart } from '@/components/charts/RadarChart';
import { LessonCard } from '@/components/learning/LessonCard';
import { DatabaseError } from '@/components/shared/DatabaseError';
import { trpc } from '@/lib/trpc/client';

const formatTimeAgo = (date: Date | null) => {
  if (!date) return 'Никогда';
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (hours < 1) return 'Только что';
  if (hours < 24) return `${hours} ч. назад`;
  if (days < 7) return `${days} дн. назад`;
  return new Date(date).toLocaleDateString('ru-RU');
};

const ACTIVITY_ICONS: Record<string, JSX.Element> = {
  lesson_completed: (
    <div className="w-10 h-10 rounded-xl bg-mp-green-100 flex items-center justify-center">
      <svg className="w-5 h-5 text-mp-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    </div>
  ),
  diagnostic_completed: (
    <div className="w-10 h-10 rounded-xl bg-mp-blue-100 flex items-center justify-center">
      <svg className="w-5 h-5 text-mp-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    </div>
  ),
  lesson_started: (
    <div className="w-10 h-10 rounded-xl bg-mp-pink-100 flex items-center justify-center">
      <svg className="w-5 h-5 text-mp-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
      </svg>
    </div>
  ),
};

// 3 accent entry cards (D-08, UI-SPEC §3). plan→soft-blue, library→soft-green,
// solutions→gradient.
const ENTRY_CARDS = [
  {
    href: '/learn/plan',
    variant: 'soft-blue' as const,
    icon: CalendarCheck,
    iconBg: 'bg-mp-blue-200 text-mp-blue-600',
    title: 'Продолжить мой план',
    sub: 'Персональный план на основе диагностики',
    dataTour: 'dashboard-learn-cta',
  },
  {
    href: '/learn/library',
    variant: 'soft-green' as const,
    icon: Search,
    iconBg: 'bg-mp-green-200 text-mp-green-600',
    title: 'Найти быстрый ответ',
    sub: 'Поиск по урокам и материалам',
    dataTour: undefined,
  },
  {
    href: '/learn/solutions',
    variant: 'gradient' as const,
    icon: Target,
    iconBg: 'bg-white/70 text-mp-blue-600',
    title: 'Решить задачу',
    sub: 'Инструкции под конкретную задачу',
    dataTour: undefined,
  },
];

export default function DashboardPage() {
  const { data: profile } = trpc.profile.get.useQuery();
  const { data: dashboard, isLoading, error } = trpc.profile.getDashboard.useQuery();

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

      {/* Welcome */}
      <div className="animate-slide-up" style={{ animationDelay: '0ms' }}>
        <h1 className="text-display-sm text-mp-gray-900">
          Привет, {name}!
        </h1>
        <p className="text-body text-mp-gray-500 mt-1">
          Добро пожаловать в MPSTATS Academy
        </p>
      </div>

      {/* 3 accent entry cards (D-08) — lead the dashboard above condensed stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 animate-slide-up" style={{ animationDelay: '50ms' }}>
        {ENTRY_CARDS.map(({ href, variant, icon: Icon, iconBg, title, sub, dataTour }) => (
          <Link key={href} href={href}>
            <Card variant={variant} interactive className="h-full p-6" data-tour={dataTour}>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ${iconBg}`}>
                <Icon className="w-6 h-6" />
              </div>
              <h2 className="text-heading-lg text-mp-gray-900">{title}</h2>
              <p className="text-body-sm text-mp-gray-600 mt-1">{sub}</p>
            </Card>
          </Link>
        ))}
      </div>

      {/* Condensed stats strip (D-08) — all-zero new users get a hint, not dead zeros */}
      {(() => {
        const lessons = dashboard?.stats.totalLessonsCompleted || 0;
        const watch = dashboard?.stats.totalWatchTime || 0;
        const streak = dashboard?.stats.currentStreak || 0;
        const completion = dashboard?.completionPercent || 0;
        const allZero = lessons === 0 && watch === 0 && streak === 0 && completion === 0;

        if (allZero) {
          return (
            <p className="text-body-sm text-mp-gray-500 animate-slide-up" style={{ animationDelay: '75ms' }}>
              Начните с диагностики — и здесь появится ваша статистика обучения.
            </p>
          );
        }

        return (
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-body-sm animate-slide-up" style={{ animationDelay: '75ms' }}>
            <span className="text-mp-gray-500">
              Уроков пройдено: <span className="font-semibold text-mp-gray-900">{lessons}</span>
            </span>
            <span className="text-mp-gray-500">
              Время обучения: <span className="font-semibold text-mp-blue-600">{watch} мин</span>
            </span>
            <span className="text-mp-gray-500">
              Дней подряд: <span className="font-semibold text-mp-green-600">{streak}</span>
            </span>
            <span className="text-mp-gray-500">
              Прогресс курса: <span className="font-semibold text-mp-pink-600">{completion}%</span>
            </span>
          </div>
        );
      })()}

      <div className="grid lg:grid-cols-3 gap-6 animate-slide-up" style={{ animationDelay: '100ms' }}>
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
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

          {/* Recent activity */}
          <Card className="shadow-mp-card">
            <CardHeader>
              <CardTitle className="text-heading">Последняя активность</CardTitle>
            </CardHeader>
            <CardContent>
              {dashboard?.recentActivity && dashboard.recentActivity.length > 0 ? (
                <div className="space-y-4">
                  {dashboard.recentActivity.slice(0, 5).map((activity) => (
                    <div key={activity.id} className="flex items-start gap-3 p-3 rounded-xl hover:bg-mp-gray-50 transition-colors">
                      {ACTIVITY_ICONS[activity.type]}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-mp-gray-900">{activity.title}</p>
                        <p className="text-body-sm text-mp-gray-500">{activity.description}</p>
                      </div>
                      <span className="text-caption text-mp-gray-400">
                        {formatTimeAgo(activity.timestamp)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-2xl bg-mp-gray-100 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-mp-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-body text-mp-gray-500">
                    Пока нет активности. Начните с диагностики!
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column - Radar */}
        <div className="space-y-6">
          <Card data-tour="dashboard-skill-radar" className="shadow-mp-card">
            <CardHeader>
              <CardTitle className="text-heading">Профиль навыков</CardTitle>
              <CardDescription className="text-body-sm">
                Ваш уровень по 5 компетенциям
              </CardDescription>
            </CardHeader>
            <CardContent>
              {dashboard?.skillProfile ? (
                <SkillRadarChart data={dashboard.skillProfile} showLabels={false} />
              ) : (
                <div className="h-64 flex items-center justify-center border-2 border-dashed border-mp-gray-200 rounded-xl bg-mp-gray-50">
                  <div className="text-center">
                    <div className="w-14 h-14 rounded-2xl bg-mp-gray-200 flex items-center justify-center mx-auto mb-3">
                      <svg className="w-7 h-7 text-mp-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                    <p className="text-body-sm text-mp-gray-500 mb-3">Пройдите диагностику для оценки навыков</p>
                    <Link href="/diagnostic">
                      <Button size="sm">Начать диагностику</Button>
                    </Link>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Average score */}
          {dashboard?.skillProfile && (
            <Card variant="gradient" className="shadow-mp-card">
              <CardContent className="py-6 text-center">
                <div className="text-display font-bold text-mp-blue-600">
                  {dashboard.stats.averageScore}%
                </div>
                <div className="text-body-sm text-mp-gray-500 mt-1">Средний балл</div>
                <Link href="/diagnostic">
                  <Button variant="link" className="mt-3 text-mp-blue-600">
                    Улучшить результат →
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
