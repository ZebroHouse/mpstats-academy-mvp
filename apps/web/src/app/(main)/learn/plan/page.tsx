'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DarkIsland, DarkIslandStat } from '@/components/ui/dark-island';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { LessonCard } from '@/components/learning/LessonCard';
import { LearningTabs } from '@/components/learning/LearningTabs';
import { trpc } from '@/lib/trpc/client';
import type { LessonWithProgress } from '@mpstats/shared';
import { AXIS_TIER_STYLE, tierBadgeLabel, axisSectionTitle, type AxisTier } from './axis-section';

// ── page ─────────────────────────────────────────────────────────────────────

export default function PlanPage() {
  // null = follow the backend's per-section `collapsed` default (weak/medium open,
  // strong folded). Once the user toggles anything we track the explicit set.
  const [expandedAxes, setExpandedAxes] = useState<Set<string> | null>(null);

  const { data: recommendedPath, isLoading } = trpc.learning.getRecommendedPath.useQuery();

  const utils = trpc.useUtils();

  const rebuildTrackMutation = trpc.learning.rebuildTrack.useMutation({
    onSuccess: () => {
      toast.success('План обновлён');
      utils.learning.getRecommendedPath.invalidate();
    },
    onError: () => toast.error('Не удалось обновить план'),
  });

  // Axis sections — v3 diagnostic-derived plan only. Narrow on the `isAxis`
  // discriminant so the union stays honest for typecheck.
  const axisSections = useMemo(
    () =>
      recommendedPath && 'isAxis' in recommendedPath && recommendedPath.isAxis
        ? recommendedPath.sections
        : [],
    [recommendedPath],
  );

  const hasDiagnosticLessons = axisSections.some(
    (s) => s.lessons.length > 0 || s.errorLessons.length > 0,
  );

  // Which axes are open: user's explicit toggles, else the backend `collapsed` default.
  const effectiveExpanded = useMemo(() => {
    if (expandedAxes) return expandedAxes;
    return new Set(axisSections.filter((s) => !s.collapsed).map((s) => s.axis));
  }, [expandedAxes, axisSections]);

  const toggleAxis = (axis: string) => {
    setExpandedAxes(() => {
      const next = new Set(effectiveExpanded);
      if (next.has(axis)) next.delete(axis);
      else next.add(axis);
      return next;
    });
  };

  // Header progress + «Продолжить с того места» count all axis lessons
  // (error-review lessons first within each axis, matching the render order).
  const allAxisLessons = useMemo(
    () => axisSections.flatMap((s) => [...s.errorLessons, ...s.lessons]),
    [axisSections],
  );
  const visibleTotal = allAxisLessons.length;
  const visibleCompleted = useMemo(
    () => allAxisLessons.filter((l) => l.status === 'COMPLETED').length,
    [allAxisLessons],
  );
  const firstUnfinishedLesson = useMemo(
    () =>
      allAxisLessons.find((l) => l.status === 'IN_PROGRESS') ??
      allAxisLessons.find((l) => l.status === 'NOT_STARTED') ??
      null,
    [allAxisLessons],
  );

  // ── loading ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-6">
        <LearningTabs />
        <div className="h-8 bg-mp-gray-200 rounded-lg w-48 animate-pulse" />
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-mp-gray-200 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // План is "empty" when there are no diagnostic-built axis lessons to show.
  const planIsEmpty = !recommendedPath || !hasDiagnosticLessons;

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 animate-fade-in">
      <LearningTabs />

      {/* ── Page header ─────────────────────────────────────────────────── */}
      {planIsEmpty ? (
        <div className="animate-slide-up">
          <h1 className="text-display-sm text-mp-gray-900">Персональный план</h1>
          <p className="text-body text-mp-gray-500 mt-1">
            Программа на основе вашей диагностики
          </p>
        </div>
      ) : (
        <DarkIsland
          className="animate-slide-up"
          eyebrow="Обучение"
          title="Персональный план"
          subtitle="Программа на основе вашей диагностики"
          aside={
            visibleTotal > 0 ? (
              <DarkIslandStat value={`${visibleCompleted}/${visibleTotal}`} label="уроков завершено" />
            ) : undefined
          }
          actions={
            <>
              {firstUnfinishedLesson && (
                <Link
                  href={`/learn/${firstUnfinishedLesson.id}?from=plan`}
                  className="inline-flex items-center justify-center rounded-full h-11 px-6 text-[15px] font-medium text-white bg-mp-blue-500 hover:bg-mp-blue-600 transition-colors"
                >
                  Продолжить с того места
                </Link>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    type="button"
                    disabled={rebuildTrackMutation.isPending}
                    className="inline-flex items-center justify-center rounded-full h-11 px-6 text-[15px] font-medium text-white border border-white/30 bg-transparent hover:bg-white/10 transition-colors disabled:opacity-50"
                  >
                    Обновить план
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Обновить план по диагностике?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Соберём план заново на основе вашей последней диагностики. Удалённые вручную
                      уроки могут вернуться.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Отмена</AlertDialogCancel>
                    <AlertDialogAction onClick={() => rebuildTrackMutation.mutate()}>
                      Обновить план
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          }
        />
      )}

      {/* ── Empty state: «Плана пока нет» ───────────────────────────────── */}
      {planIsEmpty ? (
        <Card className="shadow-mp-card border-mp-gray-200">
          <CardContent className="py-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-mp-gray-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-mp-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h2 className="text-heading-lg text-mp-gray-900 mb-2">Плана пока нет</h2>
            <p className="text-body text-mp-gray-600 mb-6 max-w-md mx-auto">
              Пройдите диагностику — соберём персональный план под ваши задачи.
            </p>
            <Link href="/diagnostic">
              <Button size="lg">Пройти диагностику</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div data-tour="learn-sections" className="space-y-4">
          {/* ── Progress bar ──────────────────────────────────────────── */}
          {visibleTotal > 0 && (
            <div className="animate-slide-up" style={{ animationDelay: '25ms' }}>
              <div className="flex justify-between text-body-sm text-mp-gray-600 mb-2">
                <span>Прогресс плана</span>
                <span className="font-medium">
                  {visibleCompleted}/{visibleTotal} уроков завершено
                </span>
              </div>
              <div className="h-2 bg-mp-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-mp-green-500 rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.round((visibleCompleted / visibleTotal) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* ── План по компетенциям — ось-аккордеон (weak/medium открыты) ── */}
          {hasDiagnosticLessons && (
            <div className="space-y-3">
              <h2 className="text-heading font-semibold text-mp-gray-900">Ваш план по компетенциям</h2>
              {axisSections
                .filter(
                  (s) => s.lessons.length > 0 || s.errorLessons.length > 0 || s.jobs.length > 0,
                )
                .map((section) => {
                  const tier = section.tier as AxisTier;
                  const style = AXIS_TIER_STYLE[tier] ?? AXIS_TIER_STYLE.medium;
                  const isOpen = effectiveExpanded.has(section.axis);
                  const errorLessons = section.errorLessons;
                  const normalLessons = section.lessons;
                  const jobs = section.jobs;
                  const allLessons = [...errorLessons, ...normalLessons];
                  const completedInSection = allLessons.filter(
                    (l) => l.status === 'COMPLETED',
                  ).length;

                  return (
                    <Card key={section.axis} className={`shadow-mp-card overflow-hidden border-l-4 ${style.accent}`}>
                      <button
                        onClick={() => toggleAxis(section.axis)}
                        aria-expanded={isOpen}
                        className="w-full text-left px-5 py-4 flex items-center justify-between gap-3 hover:bg-mp-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${style.chip}`}>
                            {tierBadgeLabel(tier)}
                          </span>
                          <h3 className={`text-heading font-semibold ${style.title}`}>
                            {axisSectionTitle(section.label, section.score)}
                          </h3>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-body-sm font-medium text-mp-gray-500 tabular-nums">
                            {completedInSection}/{allLessons.length}
                          </span>
                          <svg
                            className={`w-5 h-5 text-mp-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </button>

                      {isOpen && (
                        <CardContent className="pt-3 pb-4 px-2 sm:px-5 border-t border-mp-gray-100 space-y-4">
                          {errorLessons.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-body-sm font-bold text-red-700">⚠ Разбор ошибки</p>
                              <div className="grid gap-2 sm:gap-3">
                                {errorLessons.map((lesson, idx) => (
                                  <LessonCard
                                    key={lesson.id}
                                    lesson={{ ...lesson, title: `${idx + 1}. ${lesson.title}` } as LessonWithProgress}
                                    showCourse
                                    courseName={(lesson as Record<string, unknown>).courseName as string}
                                    locked={lesson.locked}
                                    context="plan"
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                          {normalLessons.length > 0 && (
                            <div className="grid gap-2 sm:gap-3">
                              {normalLessons.map((lesson, idx) => (
                                <LessonCard
                                  key={lesson.id}
                                  lesson={{ ...lesson, title: `${idx + 1}. ${lesson.title}` } as LessonWithProgress}
                                  showCourse
                                  courseName={(lesson as Record<string, unknown>).courseName as string}
                                  locked={lesson.locked}
                                  context="plan"
                                />
                              ))}
                            </div>
                          )}
                          {jobs.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-body-sm font-semibold text-mp-gray-700">Задачи по этой компетенции</p>
                              <div className="grid gap-3 sm:grid-cols-2">
                                {jobs.map((job) => {
                                  const jl = job.lessons ?? [];
                                  const done = jl.filter((l) => l.status === 'COMPLETED').length;
                                  return (
                                    <Link
                                      key={job.id}
                                      href={`/learn/job/${job.slug}`}
                                      className="flex items-start gap-3 bg-white border border-mp-gray-200 rounded-xl p-4 shadow-mp-card hover:shadow-mp-card-hover transition-shadow"
                                    >
                                      <div className="p-2 rounded-md bg-mp-gray-50 text-mp-gray-500 shrink-0">
                                        <Wrench className="w-5 h-5" />
                                      </div>
                                      <div className="min-w-0">
                                        <div className="text-xs text-mp-gray-500 mb-0.5">Задача</div>
                                        <div className="text-body font-semibold text-mp-gray-900 leading-snug line-clamp-2">
                                          {job.title}
                                        </div>
                                        <div className="text-body-sm text-mp-gray-500 mt-1">
                                          {jl.length} уроков · прогресс {done}/{jl.length}
                                        </div>
                                      </div>
                                    </Link>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      )}
                    </Card>
                  );
                })}
            </div>
          )}

          {/* Re-diagnostic CTA when the whole plan is complete */}
          {visibleTotal > 0 && visibleCompleted === visibleTotal && (
            <Card className="shadow-mp-card border-mp-green-200 bg-gradient-to-br from-mp-green-50 to-white">
              <CardContent className="py-8 text-center">
                <h3 className="text-heading text-mp-gray-900 mb-2">Отлично! План пройден</h3>
                <p className="text-body text-mp-gray-500 mb-4">
                  Хотите проверить, как вырос ваш уровень? Пройдите диагностику снова!
                </p>
                <Link href="/diagnostic">
                  <Button variant="outline">Пройти диагностику снова</Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
