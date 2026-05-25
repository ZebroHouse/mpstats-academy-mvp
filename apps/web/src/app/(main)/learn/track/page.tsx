'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { trpc } from '@/lib/trpc/client';
import type { LessonWithProgress } from '@mpstats/shared';

// ── helpers ──────────────────────────────────────────────────────────────────

function pluralLessons(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return `${n} урок`;
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return `${n} урока`;
  return `${n} уроков`;
}

const SECTION_DESCRIPTIONS: Record<string, (count: number) => string> = {
  custom: (n) => pluralLessons(n),
  errors: (n) => `${pluralLessons(n)} по темам, где были ошибки`,
  deepening: (n) => `${pluralLessons(n)} для слабых навыков`,
  growth: (n) => `${pluralLessons(n)} для средних навыков`,
  advanced: (n) => `${pluralLessons(n)} повышенной сложности`,
};

const SECTION_STYLES: Record<
  string,
  { icon: string; bgColor: string; borderColor: string; textColor: string; badgeColor: string }
> = {
  errors: {
    icon: '!',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    textColor: 'text-red-700',
    badgeColor: 'bg-red-100 text-red-700',
  },
  deepening: {
    icon: '↓',
    bgColor: 'bg-mp-blue-50',
    borderColor: 'border-mp-blue-200',
    textColor: 'text-mp-blue-700',
    badgeColor: 'bg-mp-blue-100 text-mp-blue-700',
  },
  growth: {
    icon: '↑',
    bgColor: 'bg-mp-green-50',
    borderColor: 'border-mp-green-200',
    textColor: 'text-mp-green-700',
    badgeColor: 'bg-mp-green-100 text-mp-green-700',
  },
  advanced: {
    icon: '★',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
    textColor: 'text-yellow-700',
    badgeColor: 'bg-yellow-100 text-yellow-700',
  },
  custom: {
    icon: '❤',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    textColor: 'text-purple-700',
    badgeColor: 'bg-purple-100 text-purple-700',
  },
};

// ── page ─────────────────────────────────────────────────────────────────────

export default function TrackPage() {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['errors']));

  const { data: recommendedPath, isLoading } = trpc.learning.getRecommendedPath.useQuery();
  const { data: hasDiagnostic } = trpc.diagnostic.hasCompletedDiagnostic.useQuery();

  const utils = trpc.useUtils();

  const removeFromTrackMutation = trpc.learning.removeFromTrack.useMutation({
    onMutate: async ({ lessonId }) => {
      await utils.learning.getRecommendedPath.cancel();
      const prev = utils.learning.getRecommendedPath.getData();
      utils.learning.getRecommendedPath.setData(undefined, (old: typeof prev) => {
        if (!old || !old.sections) return old;
        const sections = old.sections.map((s: any) => ({
          ...s,
          lessons: s.lessons.filter((l: any) => l.id !== lessonId),
        }));
        return { ...old, sections } as any;
      });
      return { prev };
    },
    onError: (_err: unknown, _vars: unknown, ctx: any) => {
      if (ctx?.prev) utils.learning.getRecommendedPath.setData(undefined, ctx.prev);
      toast.error('Не удалось убрать урок');
    },
    onSuccess: () => toast.success('Убрано из трека'),
    onSettled: () => utils.learning.getRecommendedPath.invalidate(),
  });

  const rebuildTrackMutation = trpc.learning.rebuildTrack.useMutation({
    onSuccess: () => {
      toast.success('Трек перестроен');
      utils.learning.getRecommendedPath.invalidate();
    },
    onError: () => toast.error('Не удалось перестроить трек'),
  });

  const isSectioned = useMemo(
    () => recommendedPath?.isSectioned === true && !!recommendedPath?.sections,
    [recommendedPath],
  );

  const isTrackComplete =
    recommendedPath &&
    recommendedPath.completedLessons === recommendedPath.totalLessons &&
    recommendedPath.totalLessons > 0;

  // Dedup set: lesson IDs that appear in playbooks — excluded from custom/flat sections
  const playbookLessonIds = useMemo(
    () =>
      new Set(
        ((recommendedPath as any)?.addedJobs ?? []).flatMap((pb: any) =>
          pb.lessons.map((l: any) => l.id),
        ),
      ),
    [recommendedPath],
  );

  // First unfinished lesson for "Продолжить с того места"
  const firstUnfinishedLesson = useMemo(() => {
    if (!recommendedPath?.lessons) return null;
    return (
      recommendedPath.lessons.find((l: any) => l.status === 'IN_PROGRESS') ??
      recommendedPath.lessons.find((l: any) => l.status === 'NOT_STARTED') ??
      null
    );
  }, [recommendedPath]);

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  // ── loading ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-mp-gray-200 rounded-lg w-48 animate-pulse" />
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-mp-gray-200 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 animate-slide-up">
        <div>
          <h1 className="text-display-sm text-mp-gray-900">Мой трек</h1>
          <p className="text-body text-mp-gray-500 mt-1">
            Персональный план на основе диагностики
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {firstUnfinishedLesson && (
            <Link href={`/learn/${firstUnfinishedLesson.id}`}>
              <Button size="sm">
                <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Продолжить с того места
              </Button>
            </Link>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={rebuildTrackMutation.isPending}>
                <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Перестроить по диагностике
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Перестроить трек по диагностике?</AlertDialogTitle>
                <AlertDialogDescription>
                  Соберём трек заново на основе твоей последней диагностики. Удалённые вручную уроки
                  могут вернуться, секция «Мои уроки» сохранится.
                  <br />
                  <br />
                  <strong>Важно:</strong> эта кнопка не учитывает фильтры — она пересобирает
                  рекомендации по твоим слабым навыкам. Чтобы добавить уроки конкретного курса в трек
                  — перейди в каталог и нажимай «+ В трек» на нужных уроках.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Отмена</AlertDialogCancel>
                <AlertDialogAction onClick={() => rebuildTrackMutation.mutate()}>
                  Перестроить по диагностике
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Link href="/learn">
            <Button variant="outline" size="sm">
              <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Добавить из каталога
            </Button>
          </Link>
        </div>
      </div>

      {/* ── Progress bar ────────────────────────────────────────────────── */}
      {recommendedPath && recommendedPath.totalLessons > 0 && (
        <div className="animate-slide-up" style={{ animationDelay: '25ms' }}>
          <div className="flex justify-between text-body-sm text-mp-gray-600 mb-2">
            <span>Прогресс трека</span>
            <span className="font-medium">
              {recommendedPath.completedLessons}/{recommendedPath.totalLessons} уроков завершено
            </span>
          </div>
          <div className="h-2 bg-mp-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-mp-green-500 rounded-full transition-all duration-500"
              style={{
                width: `${Math.round(
                  (recommendedPath.completedLessons / recommendedPath.totalLessons) * 100,
                )}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* ── Мои плейбуки ────────────────────────────────────────────────── */}
      {(recommendedPath as any)?.addedJobs && (recommendedPath as any).addedJobs.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-heading font-bold text-mp-gray-900">Мои плейбуки</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {(recommendedPath as any).addedJobs.map((pb: any) => {
              const total = pb.lessons.length;
              const completed = pb.lessons.filter((l: any) => l.status === 'COMPLETED').length;
              const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
              return (
                <Link
                  key={pb.id}
                  href={`/learn/job/${pb.slug}`}
                  className="group bg-white border border-mp-gray-200 rounded-xl p-4 shadow-mp-card hover:border-mp-blue-300 hover:shadow-md transition"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <h3 className="text-body font-semibold text-mp-gray-900 group-hover:text-mp-blue-600 transition">
                      {pb.title}
                    </h3>
                    <svg
                      className="w-5 h-5 text-mp-gray-300 group-hover:text-mp-blue-500 shrink-0 transition"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-1.5 bg-mp-gray-200 rounded-full overflow-hidden">
                      <div
                        className={pct === 100 ? 'h-full bg-mp-green-500' : 'h-full bg-mp-blue-500'}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-caption text-mp-gray-500 shrink-0">
                      {completed}/{total} уроков
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Case A: No diagnostic, no track ─────────────────────────────── */}
      {hasDiagnostic === false && !recommendedPath && (
        <Card className="shadow-mp-card border-mp-blue-200 bg-gradient-to-br from-mp-blue-50 to-white">
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-mp-blue-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-mp-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h2 className="text-heading text-mp-gray-900 mb-2">Персональный трек обучения</h2>
            <p className="text-body text-mp-gray-500 mb-6 max-w-md mx-auto">
              Пройди диагностику, чтобы получить персональный трек обучения на основе твоих навыков
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              <Link href="/diagnostic">
                <Button size="lg">Начать диагностику</Button>
              </Link>
              <Link href="/learn">
                <Button variant="outline" size="lg">
                  Собрать вручную из каталога
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Case A2: Diagnostic done but track is empty ──────────────────── */}
      {hasDiagnostic && recommendedPath && recommendedPath.totalLessons === 0 && (
        <Card className="shadow-mp-card border-mp-blue-200 bg-gradient-to-br from-mp-blue-50 to-white">
          <CardContent className="py-10 text-center">
            <h2 className="text-heading text-mp-gray-900 mb-2">Трек пуст</h2>
            <p className="text-body text-mp-gray-500 mb-6 max-w-md mx-auto">
              Ты убрал все уроки из трека. Можно пересобрать его автоматически или добавить нужные
              уроки из каталога.
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              <Button
                size="lg"
                onClick={() => rebuildTrackMutation.mutate()}
                disabled={rebuildTrackMutation.isPending}
              >
                {rebuildTrackMutation.isPending ? 'Пересобираем...' : 'Перестроить по диагностике'}
              </Button>
              <Link href="/learn">
                <Button variant="outline" size="lg">
                  Собрать вручную из каталога
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Case B: Track complete ───────────────────────────────────────── */}
      {hasDiagnostic && isTrackComplete && (
        <Card className="shadow-mp-card border-mp-green-200 bg-gradient-to-br from-mp-green-50 to-white">
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-mp-green-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-mp-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-heading text-mp-gray-900 mb-2">Отличная работа!</h2>
            <p className="text-body text-mp-gray-500 mb-6 max-w-md mx-auto">
              Ты завершил все рекомендованные уроки. Пройди диагностику снова, чтобы проверить
              прогресс!
            </p>
            <Link href="/diagnostic">
              <Button size="lg">Проверь свой прогресс</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* ── Case C: Normal track with lessons ───────────────────────────── */}
      {recommendedPath && !isTrackComplete && recommendedPath.lessons.length > 0 && (
        <div className="space-y-4">
          {isSectioned ? (
            /* Sectioned accordion view */
            <>
              {recommendedPath
                .sections!.map((section: any) => ({
                  ...section,
                  _filteredLessons: (section.lessons as any[]).filter(
                    (l: any) => !playbookLessonIds.has(l.id),
                  ),
                }))
                .filter((section: any) => {
                  // hide empty custom section
                  if (section.id === 'custom' && (!section.lessons || section.lessons.length === 0))
                    return false;
                  return section._filteredLessons.length > 0;
                })
                .map((section: any) => {
                  const style = SECTION_STYLES[section.id] ?? SECTION_STYLES.growth;
                  const isOpen = expandedSections.has(section.id);
                  const completedInSection = section._filteredLessons.filter(
                    (l: { status: string }) => l.status === 'COMPLETED',
                  ).length;

                  return (
                    <Card key={section.id} className={`shadow-mp-card ${style.borderColor}`}>
                      {/* Section header -- clickable to expand/collapse */}
                      <button
                        onClick={() => toggleSection(section.id)}
                        className={`w-full text-left px-6 py-4 flex items-center justify-between ${style.bgColor} rounded-t-lg`}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${style.badgeColor}`}
                          >
                            {style.icon}
                          </span>
                          <div>
                            <h3 className={`text-heading font-semibold ${style.textColor}`}>
                              {section.title}
                            </h3>
                            <p className="text-body-sm text-mp-gray-500">
                              {(
                                SECTION_DESCRIPTIONS[section.id] ?? SECTION_DESCRIPTIONS.growth
                              )(section.lessons.length)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-body-sm text-mp-gray-500">
                            {completedInSection}/{section._filteredLessons.length}
                          </span>
                          <svg
                            className={`w-5 h-5 text-mp-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 9l-7 7-7-7"
                            />
                          </svg>
                        </div>
                      </button>

                      {/* Section content -- collapsible */}
                      {isOpen && (
                        <CardContent className="pt-3 pb-4 px-2 sm:px-6 overflow-hidden">
                          <div className="grid gap-2 sm:gap-3">
                            {section._filteredLessons.map((lesson: any, idx: number) => (
                              <LessonCard
                                key={lesson.id}
                                lesson={
                                  {
                                    ...lesson,
                                    title: `${idx + 1}. ${lesson.title}`,
                                  } as LessonWithProgress
                                }
                                showCourse
                                courseName={
                                  ((lesson as unknown) as Record<string, unknown>)
                                    .courseName as string
                                }
                                isRecommended={section.id === 'errors'}
                                locked={lesson.locked}
                                onRemoveFromTrack={() =>
                                  removeFromTrackMutation.mutate({ lessonId: lesson.id })
                                }
                              />
                            ))}
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  );
                })}

              {/* All sections empty — congratulation placeholder */}
              {recommendedPath.sections!.every(
                (section: any) => section.lessons.length === 0,
              ) && (
                <Card className="shadow-mp-card">
                  <CardContent className="py-8 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-mp-green-100 flex items-center justify-center mx-auto mb-4">
                      <svg
                        className="w-8 h-8 text-mp-green-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                    <p className="text-body font-medium text-mp-green-700">
                      Отличный результат! Все темы освоены.
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Re-diagnostic CTA when errors section is fully completed */}
              {recommendedPath
                .sections!.find((s: { id: string }) => s.id === 'errors')
                ?.lessons.every((l: { status: string }) => l.status === 'COMPLETED') && (
                <Card className="shadow-mp-card border-mp-green-200 bg-gradient-to-br from-mp-green-50 to-white">
                  <CardContent className="py-8 text-center">
                    <h3 className="text-heading text-mp-gray-900 mb-2">
                      Отлично! Все ошибки проработаны
                    </h3>
                    <p className="text-body text-mp-gray-500 mb-4">
                      Хочешь проверить, как вырос твой уровень? Пройди диагностику снова!
                    </p>
                    <Link href="/diagnostic">
                      <Button variant="outline">Пройти диагностику снова</Button>
                    </Link>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            /* Fallback: flat list for old-format paths */
            <div className="space-y-3">
              {(() => {
                const dedupedLessons = recommendedPath.lessons.filter(
                  (l: any) => !playbookLessonIds.has(l.id),
                );
                const showGating =
                  recommendedPath.hasPlatformSubscription === false &&
                  dedupedLessons.some((l: any) => l.locked);
                const visibleCount = showGating ? 3 : dedupedLessons.length;
                const visibleLessons = dedupedLessons.slice(0, visibleCount);
                const hiddenLessons = showGating
                  ? dedupedLessons.slice(visibleCount)
                  : [];

                return (
                  <>
                    {visibleLessons.map((lesson: any, idx: number) => (
                      <LessonCard
                        key={lesson.id}
                        lesson={
                          {
                            ...lesson,
                            title: `${idx + 1}. ${lesson.title}`,
                          } as LessonWithProgress
                        }
                        showCourse
                        courseName={
                          ((lesson as unknown) as Record<string, unknown>).courseName as string
                        }
                        isRecommended
                        locked={lesson.locked}
                      />
                    ))}
                    {hiddenLessons.length > 0 && (
                      <>
                        <div className="blur-sm pointer-events-none select-none space-y-3">
                          {hiddenLessons.map((lesson: any, idx: number) => (
                            <LessonCard
                              key={lesson.id}
                              lesson={
                                {
                                  ...lesson,
                                  title: `${visibleCount + idx + 1}. ${lesson.title}`,
                                } as LessonWithProgress
                              }
                              showCourse
                              courseName={
                                ((lesson as unknown) as Record<string, unknown>)
                                  .courseName as string
                              }
                              locked
                            />
                          ))}
                        </div>
                        <Card className="shadow-mp-card border-mp-blue-200 bg-gradient-to-br from-mp-blue-50 to-white">
                          <CardContent className="py-8 text-center">
                            <h3 className="text-heading text-mp-gray-900 mb-2">
                              Получите полный персональный трек
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
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* ── Case D: Diagnostic done but empty / all skills above target ─── */}
      {hasDiagnostic &&
        (!recommendedPath || (recommendedPath && recommendedPath.lessons.length === 0)) &&
        !isTrackComplete && (
          <Card className="shadow-mp-card border-mp-green-200 bg-gradient-to-br from-mp-green-50 to-white">
            <CardContent className="py-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-mp-green-100 flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-mp-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h2 className="text-heading text-mp-gray-900 mb-2">Отличный результат!</h2>
              <p className="text-body text-mp-gray-500 mb-6 max-w-md mx-auto">
                Все навыки на высоком уровне. Можешь изучать любые курсы или пройти диагностику снова
                для проверки.
              </p>
              <div className="flex gap-3 justify-center">
                <Link href="/learn">
                  <Button variant="outline">Все курсы</Button>
                </Link>
                <Link href="/diagnostic">
                  <Button>Проверить прогресс</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}
    </div>
  );
}
