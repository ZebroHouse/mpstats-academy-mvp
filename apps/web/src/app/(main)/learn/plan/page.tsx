'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Wrench } from 'lucide-react';
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
import { LearningTabs } from '@/components/learning/LearningTabs';
import { trpc } from '@/lib/trpc/client';
import type { LessonWithProgress } from '@mpstats/shared';

// ── helpers ──────────────────────────────────────────────────────────────────

// Priority badge per diagnostic section. Colors reuse SECTION_STYLES.badgeColor.
const SECTION_BADGES: Record<string, string> = {
  errors: 'Ошибка',
  deepening: 'Углубление',
  growth: 'Рост',
  advanced: 'Продвинутый',
};

const SECTION_STYLES: Record<string, { badgeColor: string }> = {
  errors: { badgeColor: 'bg-red-100 text-red-700' },
  deepening: { badgeColor: 'bg-mp-blue-100 text-mp-blue-700' },
  growth: { badgeColor: 'bg-mp-green-100 text-mp-green-700' },
  advanced: { badgeColor: 'bg-yellow-100 text-yellow-700' },
};

// Diagnostic-only section order (custom intentionally absent — manual additions
// live in «Избранное», Wave D / 61-07). Order = lesson priority: errors first.
const DIAGNOSTIC_SECTION_IDS = ['errors', 'deepening', 'growth', 'advanced'];

// ── page ─────────────────────────────────────────────────────────────────────

export default function PlanPage() {
  const { data: recommendedPath, isLoading } = trpc.learning.getRecommendedPath.useQuery();

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
    onSuccess: () => toast.success('Урок убран из плана'),
    onSettled: () => utils.learning.getRecommendedPath.invalidate(),
  });

  const rebuildTrackMutation = trpc.learning.rebuildTrack.useMutation({
    onSuccess: () => {
      toast.success('План обновлён');
      utils.learning.getRecommendedPath.invalidate();
    },
    onError: () => toast.error('Не удалось обновить план'),
  });

  // Diagnostic sections only — the `custom` section (manual additions) is split off
  // into «Избранное» in Wave D / 61-07 and must NOT surface as part of «план» now.
  const diagnosticSections = useMemo(() => {
    if (!recommendedPath?.sections) return [];
    return (recommendedPath.sections as any[]).filter((s) => DIAGNOSTIC_SECTION_IDS.includes(s.id));
  }, [recommendedPath]);

  const hasDiagnosticLessons = diagnosticSections.some((s: any) => s.lessons.length > 0);

  // Recommended jobs (Phase 58). Backend returns addedJobs as { id, slug, title,
  // marketplace, lessons[] }. План shows them as link-cards (no сердечко).
  const addedJobs = useMemo(
    () => (recommendedPath?.addedJobs as any[] | undefined) ?? [],
    [recommendedPath],
  );

  // Header progress must count ONLY the visible diagnostic sections — NOT
  // recommendedPath.totalLessons (which still includes the custom/manual section
  // that now lives in «Избранное»). Otherwise the header (0/33) contradicts the
  // rendered sections (e.g. 15). UAT 03.06 (tokarev1195).
  const visibleTotal = useMemo(
    () => diagnosticSections.reduce((sum: number, s: any) => sum + s.lessons.length, 0),
    [diagnosticSections],
  );
  const visibleCompleted = useMemo(
    () =>
      diagnosticSections.reduce(
        (sum: number, s: any) => sum + s.lessons.filter((l: any) => l.status === 'COMPLETED').length,
        0,
      ),
    [diagnosticSections],
  );

  // Flatten all diagnostic-section lessons into one prioritized list
  // (errors → deepening → growth → advanced). Each lesson carries its section id
  // so we can render a priority badge above the card.
  const flatLessons = useMemo(() => {
    return DIAGNOSTIC_SECTION_IDS.flatMap((sectionId) => {
      const section = diagnosticSections.find((s: any) => s.id === sectionId);
      if (!section) return [];
      return (section.lessons as any[]).map((lesson: any) => ({ lesson, sectionId }));
    });
  }, [diagnosticSections]);

  const firstUnfinishedLesson = useMemo(() => {
    const flat = flatLessons.map((e) => e.lesson);
    return (
      flat.find((l: any) => l.status === 'IN_PROGRESS') ??
      flat.find((l: any) => l.status === 'NOT_STARTED') ??
      null
    );
  }, [flatLessons]);

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

  // План is "empty" when there is neither diagnostic-built lessons NOR recommended
  // jobs to show. addedJobs alone keeps the План non-empty (a jobs-only plan).
  // NOTE: do NOT gate on `isSectioned` here — legacy flat-format paths (no sections)
  // still carry addedJobs, and gating on isSectioned would hide the «Рекомендованные
  // задачи» block from those users (WR-01). hasDiagnosticLessons already requires
  // sections, so flat paths contribute only via addedJobs.
  const planIsEmpty =
    !recommendedPath || (!hasDiagnosticLessons && addedJobs.length === 0);

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 animate-fade-in">
      <LearningTabs />

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 animate-slide-up">
        <div>
          <h1 className="text-display-sm text-mp-gray-900">Персональный план</h1>
          <p className="text-body text-mp-gray-500 mt-1">
            Программа на основе вашей диагностики
          </p>
        </div>
        {!planIsEmpty && (
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
                  Обновить план
                </Button>
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
          </div>
        )}
      </div>

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

          {/* ── Рекомендованные задачи — карточки-ссылки из addedJobs ──────── */}
          {addedJobs.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-heading font-semibold text-mp-gray-900">
                Рекомендованные задачи
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {addedJobs.map((job: any) => {
                  const lessons = (job.lessons as any[]) ?? [];
                  const total = lessons.length;
                  const completed = lessons.filter(
                    (l: any) => l.status === 'COMPLETED',
                  ).length;
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
                          {total} уроков · прогресс {completed}/{total}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Рекомендованные уроки — плоский список с бейджем приоритета ── */}
          {flatLessons.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-heading font-semibold text-mp-gray-900">
                Рекомендованные уроки
              </h2>
              <div className="grid gap-3">
                {flatLessons.map(({ lesson, sectionId }) => {
                  const badgeColor =
                    SECTION_STYLES[sectionId]?.badgeColor ?? SECTION_STYLES.growth.badgeColor;
                  const badgeLabel = SECTION_BADGES[sectionId] ?? SECTION_BADGES.growth;
                  return (
                    <div key={lesson.id} className="space-y-1">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-caption font-medium ${badgeColor}`}
                      >
                        {badgeLabel}
                      </span>
                      <LessonCard
                        lesson={lesson as LessonWithProgress}
                        showCourse
                        courseName={
                          ((lesson as unknown) as Record<string, unknown>).courseName as string
                        }
                        locked={lesson.locked}
                        onRemoveFromTrack={() =>
                          removeFromTrackMutation.mutate({ lessonId: lesson.id })
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Re-diagnostic CTA when errors section is fully completed */}
          {diagnosticSections
            .find((s: { id: string }) => s.id === 'errors')
            ?.lessons.length > 0 &&
            diagnosticSections
              .find((s: { id: string }) => s.id === 'errors')
              ?.lessons.every((l: { status: string }) => l.status === 'COMPLETED') && (
              <Card className="shadow-mp-card border-mp-green-200 bg-gradient-to-br from-mp-green-50 to-white">
                <CardContent className="py-8 text-center">
                  <h3 className="text-heading text-mp-gray-900 mb-2">
                    Отлично! Все ошибки проработаны
                  </h3>
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
