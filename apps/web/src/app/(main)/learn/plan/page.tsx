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

// ── helpers ──────────────────────────────────────────────────────────────────

function pluralLessons(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return `${n} урок`;
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return `${n} урока`;
  return `${n} уроков`;
}

// Per-section description — the priority "label" lives ONCE here in the section
// header (not duplicated as a badge on every lesson card). UAT 04.06.
const SECTION_DESCRIPTIONS: Record<string, (count: number) => string> = {
  errors: (n) => `${pluralLessons(n)} по темам, где были ошибки`,
  deepening: (n) => `${pluralLessons(n)} для слабых навыков`,
  growth: (n) => `${pluralLessons(n)} для средних навыков`,
  advanced: (n) => `${pluralLessons(n)} повышенной сложности`,
};

// Elegant section identity: a colored left-accent + a small icon chip, on a
// neutral white header — cohesive instead of four loud full-color blocks.
const SECTION_STYLES: Record<
  string,
  { icon: string; accent: string; chip: string; title: string }
> = {
  errors: { icon: '!', accent: 'border-l-red-400', chip: 'bg-red-100 text-red-700', title: 'text-red-700' },
  deepening: { icon: '↓', accent: 'border-l-mp-blue-400', chip: 'bg-mp-blue-100 text-mp-blue-700', title: 'text-mp-blue-700' },
  growth: { icon: '↑', accent: 'border-l-mp-green-400', chip: 'bg-mp-green-100 text-mp-green-700', title: 'text-mp-green-700' },
  advanced: { icon: '★', accent: 'border-l-yellow-400', chip: 'bg-yellow-100 text-yellow-700', title: 'text-yellow-700' },
};

// Diagnostic-only section order (custom intentionally absent — manual additions
// live in «Избранное», Wave D / 61-07). Order = priority: errors first.
const DIAGNOSTIC_SECTION_IDS = ['errors', 'deepening', 'growth', 'advanced'];

// ── page ─────────────────────────────────────────────────────────────────────

export default function PlanPage() {
  // Only «Ошибки» open by default — focuses attention on the highest priority.
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['errors']));

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

  const firstUnfinishedLesson = useMemo(() => {
    const flat = diagnosticSections.flatMap((s: any) => s.lessons as any[]);
    return (
      flat.find((l: any) => l.status === 'IN_PROGRESS') ??
      flat.find((l: any) => l.status === 'NOT_STARTED') ??
      null
    );
  }, [diagnosticSections]);

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
                  href={`/learn/${firstUnfinishedLesson.id}`}
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

          {/* ── Рекомендованные уроки — секции-аккордеон по приоритету ─────── */}
          {hasDiagnosticLessons && (
            <div className="space-y-3">
              <h2 className="text-heading font-semibold text-mp-gray-900">
                Рекомендованные уроки
              </h2>
              {diagnosticSections
                .filter((section: any) => section.lessons.length > 0)
                .map((section: any) => {
                  const style = SECTION_STYLES[section.id] ?? SECTION_STYLES.growth;
                  const isOpen = expandedSections.has(section.id);
                  const completedInSection = (section.lessons as any[]).filter(
                    (l: { status: string }) => l.status === 'COMPLETED',
                  ).length;

                  return (
                    <Card key={section.id} className={`shadow-mp-card overflow-hidden border-l-4 ${style.accent}`}>
                      <button
                        onClick={() => toggleSection(section.id)}
                        aria-expanded={isOpen}
                        className="w-full text-left px-5 py-4 flex items-center justify-between gap-3 hover:bg-mp-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={`inline-flex items-center justify-center w-9 h-9 rounded-xl text-base font-bold shrink-0 ${style.chip}`}
                          >
                            {style.icon}
                          </span>
                          <div className="min-w-0">
                            <h3 className={`text-heading font-semibold ${style.title}`}>
                              {section.title}
                            </h3>
                            <p className="text-body-sm text-mp-gray-500">
                              {(SECTION_DESCRIPTIONS[section.id] ?? SECTION_DESCRIPTIONS.growth)(
                                section.lessons.length,
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-body-sm font-medium text-mp-gray-500 tabular-nums">
                            {completedInSection}/{section.lessons.length}
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
                        <CardContent className="pt-3 pb-4 px-2 sm:px-5 border-t border-mp-gray-100">
                          <div className="grid gap-2 sm:gap-3">
                            {(section.lessons as any[]).map((lesson: any, idx: number) => (
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
