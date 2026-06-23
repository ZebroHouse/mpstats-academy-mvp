'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { SkillRadarChart } from '@/components/charts/RadarChart';
import { LessonCard } from '@/components/learning/LessonCard';
import { RecommendedJobsBlock } from '@/components/diagnostic/RecommendedJobsBlock';
import { trpc } from '@/lib/trpc/client';
import { reachGoal } from '@/lib/analytics/metrika';
import { METRIKA_GOALS } from '@/lib/analytics/constants';
import type { LessonWithProgress } from '@mpstats/shared';

const PRIORITY_STYLES = {
  HIGH: { badge: 'destructive' as const, label: 'Высокий', tooltip: 'Большой разрыв с целью — рекомендуем начать с этой темы' },
  MEDIUM: { badge: 'warning' as const, label: 'Средний', tooltip: 'Есть потенциал для улучшения' },
  LOW: { badge: 'success' as const, label: 'Низкий', tooltip: 'Близко к цели — поддерживайте уровень' },
};

function pluralizeZones(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return `${n} зона`;
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return `${n} зоны`;
  return `${n} зон`;
}

export default function DiagnosticResultsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('id');

  const { data: results, isLoading } = trpc.diagnostic.getResults.useQuery(
    { sessionId: sessionId! },
    { enabled: !!sessionId, retry: 2, retryDelay: 1000 }
  );
  const { data: recommendedPath } = trpc.learning.getRecommendedPath.useQuery();

  // Fetch diagnostic history to find the previous session for dual radar
  const { data: history } = trpc.diagnostic.getHistory.useQuery();
  const previousSession = history && history.length >= 2 ? history[1] : null;
  const { data: previousResults } = trpc.diagnostic.getResults.useQuery(
    { sessionId: previousSession?.id ?? '' },
    { enabled: !!previousSession }
  );

  // Track diagnostic completion in Metrika
  useEffect(() => {
    if (results?.accuracy !== undefined) {
      reachGoal(METRIKA_GOALS.DIAGNOSTIC_COMPLETE, { avgScore: results.accuracy });
    }
  }, [results?.accuracy]);

  if (!sessionId) {
    router.push('/diagnostic');
    return null;
  }

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card className="shadow-mp-card">
          <CardContent className="py-12 text-center">
            <svg className="animate-spin h-10 w-10 mx-auto text-mp-blue-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <p className="mt-4 text-body text-mp-gray-500">Анализируем результаты...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card className="shadow-mp-card">
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-mp-gray-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-mp-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-body text-mp-gray-500">
              Произошла ошибка при загрузке результатов. Попробуйте перезагрузить страницу.
            </p>
            <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
              Перезагрузить
            </Button>
            <Button variant="ghost" className="mt-2" onClick={() => router.push('/diagnostic')}>
              Пройти диагностику заново
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const scoreColor = results.accuracy >= 70 ? 'text-mp-green-500' : results.accuracy >= 50 ? 'text-mp-blue-500' : 'text-mp-pink-500';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-mp-green-100 mb-4">
          <svg className="w-10 h-10 text-mp-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="font-sans text-3xl sm:text-4xl font-bold tracking-tight text-mp-gray-900">Диагностика завершена!</h1>
        <p className="text-body text-mp-gray-500 mt-2">
          Вы ответили на {results.totalQuestions} вопросов
        </p>
      </div>

      {/* Score overview */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="shadow-mp-card">
          <CardContent className="py-6 text-center">
            <div className={`text-display font-bold ${scoreColor}`}>
              {results.accuracy}%
            </div>
            <div className="text-body-sm text-mp-gray-500 mt-1">Общий результат</div>
          </CardContent>
        </Card>
        <Card className="shadow-mp-card">
          <CardContent className="py-6 text-center">
            <div className="text-display font-bold text-mp-gray-900">
              {results.correctAnswers}/{results.totalQuestions}
            </div>
            <div className="text-body-sm text-mp-gray-500 mt-1">Правильных ответов</div>
          </CardContent>
        </Card>
        <Card className="shadow-mp-card">
          <CardContent className="py-6 text-center">
            <div className="text-display font-bold text-mp-blue-500">
              {results.gaps.filter(g => g.gap > 0).length}
            </div>
            <div className="text-body-sm text-mp-gray-500 mt-1">
              {pluralizeZones(results.gaps.filter(g => g.gap > 0).length)} для развития
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Radar chart */}
      <Card className="shadow-mp-card">
        <CardHeader>
          <CardTitle className="text-heading">Профиль навыков</CardTitle>
          <CardDescription className="text-body-sm">
            Ваш уровень по 5 ключевым компетенциям селлера
          </CardDescription>
        </CardHeader>
        <CardContent>
          {previousResults && (
            <div className="text-center mb-4 p-3 bg-mp-green-50 rounded-lg border border-mp-green-200">
              <p className="text-body font-medium text-mp-green-700">
                Сравнение с предыдущей диагностикой
              </p>
              <p className="text-body-sm text-mp-gray-500">
                Пунктирная линия — прошлый результат, сплошная — текущий
              </p>
            </div>
          )}
          <SkillRadarChart
            data={results.skillProfile}
            previousData={previousResults?.skillProfile}
          />
        </CardContent>
      </Card>

      {/* Skill gaps */}
      <Card className="shadow-mp-card">
        <CardHeader>
          <CardTitle className="text-heading">Рекомендации по развитию</CardTitle>
          <CardDescription className="text-body-sm">
            Навыки отсортированы по приоритету улучшения
          </CardDescription>
          <p className="text-body-sm font-medium text-mp-gray-700 mt-3">Приоритет изучения</p>
        </CardHeader>
        <CardContent>
          <TooltipProvider>
          <div className="space-y-4">
            {results.gaps
              .filter(gap => gap.gap > 0)
              .sort((a, b) => b.gap - a.gap)
              .map((gap) => (
                <div
                  key={gap.category}
                  className="flex flex-wrap items-center gap-2 sm:gap-0 sm:justify-between p-4 border border-mp-gray-200 rounded-2xl hover:bg-mp-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div className="text-heading-xl font-bold text-mp-gray-900">
                        {gap.currentScore}%
                      </div>
                      <div className="text-caption text-mp-gray-500">текущий</div>
                    </div>
                    <div>
                      <svg className="w-6 h-6 text-mp-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </div>
                    <div className="text-center">
                      <div className="text-heading-xl font-bold text-mp-blue-500">
                        {gap.targetScore}%
                      </div>
                      <div className="text-caption text-mp-gray-500">цель</div>
                    </div>
                  </div>
                  <div className="flex-1 px-6">
                    <div className="font-medium text-mp-gray-900">{gap.label}</div>
                    <div className="text-body-sm text-mp-gray-500">
                      Нужно улучшить на {gap.gap}%
                    </div>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={0} className="cursor-help shrink-0">
                        <Badge variant={PRIORITY_STYLES[gap.priority].badge} className="text-xs">
                          {PRIORITY_STYLES[gap.priority].label}
                        </Badge>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{PRIORITY_STYLES[gap.priority].tooltip}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              ))}
            {results.gaps.filter(gap => gap.gap > 0).length === 0 && (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-2xl bg-mp-green-100 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-mp-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-body text-mp-gray-500">
                  Отличный результат! Все навыки на высоком уровне.
                </p>
              </div>
            )}
          </div>
          </TooltipProvider>
        </CardContent>
      </Card>

      {/* CTA */}
      <Card variant="gradient" className="shadow-mp-lg">
        <CardContent className="py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="font-sans text-2xl sm:text-3xl font-bold tracking-tight text-mp-gray-900">
                Готов персональный план обучения
              </h3>
              <p className="text-body text-mp-gray-500 mt-1">
                {results.recommendedPath.length} уроков для закрытия пробелов в знаниях
              </p>
            </div>
            <div className="flex gap-3">
              <Link href="/learn">
                <Button size="lg" className="shadow-mp-md">
                  Начать обучение
                </Button>
              </Link>
              <Link href="/dashboard">
                <Button variant="outline" size="lg">
                  На главную
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Phase 58: top-3 recommended jobs (playbooks) */}
      <RecommendedJobsBlock jobs={results.recommendedJobs ?? []} />

      {/* Track preview with gating */}
      {recommendedPath && recommendedPath.lessons.length > 0 && (() => {
        const showGating = recommendedPath.hasPlatformSubscription === false
          && recommendedPath.lessons.some(l => l.locked);
        const visibleCount = showGating ? 3 : recommendedPath.lessons.length;
        const visibleLessons = recommendedPath.lessons.slice(0, visibleCount);
        const hiddenLessons = showGating ? recommendedPath.lessons.slice(visibleCount) : [];

        return (
          <div className="space-y-3">
            <h3 className="text-heading text-mp-gray-900">Рекомендованные уроки</h3>
            {visibleLessons.map((lesson, idx) => (
              <LessonCard
                key={lesson.id}
                lesson={{ ...lesson, title: `${idx + 1}. ${lesson.title}` } as LessonWithProgress}
                showCourse
                courseName={lesson.courseName}
                isRecommended
                locked={lesson.locked}
              />
            ))}
            {hiddenLessons.length > 0 && (
              <>
                <div className="blur-sm pointer-events-none select-none space-y-3">
                  {hiddenLessons.map((lesson, idx) => (
                    <LessonCard
                      key={lesson.id}
                      lesson={{ ...lesson, title: `${visibleCount + idx + 1}. ${lesson.title}` } as LessonWithProgress}
                      showCourse
                      courseName={lesson.courseName}
                      locked
                    />
                  ))}
                </div>
                <Card className="shadow-mp-card border-mp-blue-200 bg-gradient-to-br from-mp-blue-50 to-white">
                  <CardContent className="py-8 text-center">
                    <h3 className="text-heading text-mp-gray-900 mb-2">
                      Оформите полный доступ для персонального трека обучения
                    </h3>
                    <p className="text-body text-mp-gray-500 mb-4">
                      Ещё {hiddenLessons.length} уроков доступны с полной подпиской
                    </p>
                    <Link href="/pricing">
                      <Button size="lg">Оформить полный доступ</Button>
                    </Link>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
}
