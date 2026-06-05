'use client';

import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LessonCard } from '@/components/learning/LessonCard';
import { AgentSearch } from '@/components/learning/AgentSearch';
import { LearningHero } from '@/components/learning/LearningHero';
import { MaterialCard, type MaterialCardProps } from '@/components/learning/MaterialCard';
import { CourseLockBanner } from '@/components/learning/PaywallBanner';
import { LearningTabs } from '@/components/learning/LearningTabs';
import type { FilterState } from '@/components/learning/FilterPanel';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';
import type { LessonWithProgress } from '@mpstats/shared';

const INITIAL_LESSONS_SHOWN = 5;

// Material-type filter chips (5 MaterialType values) + «Уроки» toggle back to the
// courses accordion (the default view).
type MaterialTypeValue = MaterialCardProps['type'];
type CatalogFilter = MaterialTypeValue | 'LESSONS';

// Внешний сервис (EXTERNAL_SERVICE) намеренно скрыт из каталога (UAT 03.06).
const CATALOG_CHIPS: Array<{ value: CatalogFilter; label: string }> = [
  { value: 'LESSONS', label: 'Уроки' },
  { value: 'PRESENTATION', label: 'Презентации' },
  { value: 'CALCULATION_TABLE', label: 'Таблицы расчётов' },
  { value: 'CHECKLIST', label: 'Чек-листы' },
  { value: 'MEMO', label: 'Памятки' },
];

function isDatabaseUnavailable(errorMessage: string): boolean {
  return errorMessage === 'DATABASE_UNAVAILABLE' || errorMessage.includes('DATABASE_UNAVAILABLE');
}

function filtersFromSearchParams(sp: ReturnType<typeof useSearchParams>): FilterState {
  return {
    category: (sp.get('category') as FilterState['category']) ?? 'ALL',
    status: sp.get('status') ?? 'ALL',
    topics: sp.getAll('topic'),
    difficulty: sp.get('difficulty') ?? 'ALL',
    duration: sp.get('duration') ?? 'ALL',
    courseId: sp.get('courseId') ?? 'ALL',
    marketplace: sp.get('marketplace') ?? 'ALL',
  };
}

function filtersToSearchParams(filters: FilterState): string {
  const sp = new URLSearchParams();
  if (filters.category !== 'ALL') sp.set('category', filters.category);
  if (filters.status !== 'ALL') sp.set('status', filters.status);
  filters.topics.forEach(t => sp.append('topic', t));
  if (filters.difficulty !== 'ALL') sp.set('difficulty', filters.difficulty);
  if (filters.duration !== 'ALL') sp.set('duration', filters.duration);
  if (filters.courseId !== 'ALL') sp.set('courseId', filters.courseId);
  if (filters.marketplace !== 'ALL') sp.set('marketplace', filters.marketplace);
  return sp.toString();
}

export default function LibraryPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Загрузка...</div>}>
      <LibraryPageInner />
    </Suspense>
  );
}

function LibraryPageInner() {
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set());
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilter>('LESSONS');

  const showMaterials = catalogFilter !== 'LESSONS';
  const { data: materialsData, isLoading: materialsLoading } = trpc.material.listForUser.useQuery(
    { type: showMaterials ? (catalogFilter as MaterialTypeValue) : undefined },
    { enabled: showMaterials },
  );

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const filters = useMemo(() => filtersFromSearchParams(searchParams), [searchParams]);
  // setFilters kept for FilterPanel wiring (61-05 hero/filters); referenced to avoid dead-code.
  const setFilters = useCallback((newFilters: FilterState) => {
    const query = filtersToSearchParams(newFilters);
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [router, pathname]);
  void setFilters;

  const { data: courses, isLoading, error } = trpc.learning.getCourses.useQuery();
  const { data: recommendedPath } = trpc.learning.getRecommendedPath.useQuery();

  // Auto-expand course from URL hash (e.g. /learn/library#01_analytics)
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash && courses?.some((c) => c.id === hash)) {
      setExpandedCourses((prev) => new Set(prev).add(hash));
      setTimeout(() => {
        document.getElementById(`course-${hash}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [courses]);

  // O(1) lookup for recommended lesson IDs (diagnostic «Рекомендовано» badge)
  const recommendedLessonIds = new Set(
    recommendedPath?.lessons.map((l) => l.id) ?? []
  );

  // Favorited lessons → seed the «сердечко» filled state (Избранное, D-06).
  // Manual adds in База знаний go to Избранное via FavoriteButton, NOT to the План.
  const { data: favLessons } = trpc.favorite.list.useQuery({ itemType: 'LESSON' });
  const favoritedLessonIds = useMemo(
    () => new Set((favLessons?.items ?? []).map((i) => i.itemId)),
    [favLessons],
  );

  // Unified filter function for courses view
  const filterLesson = (lesson: LessonWithProgress) => {
    if (filters.category !== 'ALL' && lesson.skillCategory !== filters.category) return false;
    if (filters.status !== 'ALL' && lesson.status !== filters.status) return false;
    if (filters.difficulty !== 'ALL' && (((lesson as unknown) as Record<string, unknown>).skillLevel as string || 'MEDIUM') !== filters.difficulty) return false;
    if (filters.duration !== 'ALL') {
      const d = lesson.duration;
      if (filters.duration === 'short' && d > 10) return false;
      if (filters.duration === 'medium' && (d <= 10 || d > 30)) return false;
      if (filters.duration === 'long' && d <= 30) return false;
    }
    if (filters.topics.length > 0) {
      const lt = (((lesson as unknown) as Record<string, unknown>).topics as string[] | undefined) ?? [];
      if (!filters.topics.some(t => lt.includes(t))) return false;
    }
    if (filters.marketplace !== 'ALL') {
      const courseId = ((lesson as unknown) as Record<string, unknown>).courseId as string || '';
      if (filters.marketplace === 'OZON') {
        if (courseId !== '05_ozon') return false;
      } else {
        if (courseId === '05_ozon') return false;
      }
    }
    if (filters.courseId !== 'ALL' && ((lesson as unknown) as Record<string, unknown>).courseId !== filters.courseId) return false;
    return true;
  };

  const toggleCourseExpanded = (courseId: string) => {
    setExpandedCourses((prev) => {
      const next = new Set(prev);
      if (next.has(courseId)) {
        next.delete(courseId);
      } else {
        next.add(courseId);
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <LearningTabs />
        <div className="h-8 bg-mp-gray-200 rounded-lg w-48 animate-pulse" />
        <div className="grid gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-mp-gray-200 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    const isDbDown = isDatabaseUnavailable(error.message);
    return (
      <div className="space-y-6">
        <LearningTabs />
        <div className="max-w-2xl mx-auto">
          <Card className="shadow-mp-card border-red-200">
            <CardContent className="py-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-heading text-mp-gray-900 mb-2">
                {isDbDown ? 'База данных недоступна' : 'Ошибка загрузки'}
              </h2>
              <p className="text-body text-mp-gray-500">
                {isDbDown
                  ? 'Не удалось подключиться к базе данных. Попробуйте обновить страницу через несколько минут.'
                  : 'Произошла ошибка при загрузке курсов. Попробуйте обновить страницу.'}
              </p>
              <Button className="mt-4" onClick={() => window.location.reload()}>
                Обновить страницу
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <LearningTabs />

      {/* Hero search block (D-09) — gradient bg, display headline, large search + chips */}
      <LearningHero
        scope="library"
        headline="База знаний"
        subline="Все курсы, уроки и материалы платформы"
      >
        <AgentSearch scope="library" size="hero" />
        {/* Material-type filter chips (+ «Уроки» toggle back to courses accordion) */}
        <div className="mt-4 flex gap-2 flex-wrap">
          {CATALOG_CHIPS.map((chip) => (
            <button
              key={chip.value}
              onClick={() => setCatalogFilter(chip.value)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-body-sm font-medium transition-colors',
                catalogFilter === chip.value
                  ? 'bg-mp-blue-500 text-white'
                  : 'bg-white/70 border border-mp-gray-200 text-mp-gray-700 hover:bg-white',
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </LearningHero>

      {/* Material catalog (when a material type is selected) */}
      {showMaterials && (
        <div className="space-y-4">
          {materialsLoading && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 bg-mp-gray-200 rounded-xl animate-pulse" />
              ))}
            </div>
          )}
          {!materialsLoading && (materialsData?.items.length ?? 0) === 0 && (
            <Card className="shadow-mp-card">
              <CardContent className="py-12 text-center">
                <h2 className="text-heading-lg text-mp-gray-900 mb-2">Материалов этого типа пока нет</h2>
                <p className="text-body text-mp-gray-600">Снимите фильтр, чтобы увидеть все материалы.</p>
                <Button variant="outline" className="mt-4" onClick={() => setCatalogFilter('LESSONS')}>
                  Показать уроки
                </Button>
              </CardContent>
            </Card>
          )}
          {!materialsLoading && (materialsData?.items.length ?? 0) > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {materialsData!.items.map((m) => (
                <MaterialCard
                  key={m.id}
                  id={m.id}
                  type={m.type as MaterialTypeValue}
                  title={m.title}
                  description={m.description}
                  ctaText={m.ctaText}
                  externalUrl={m.externalUrl}
                  hasFile={m.hasFile}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Courses accordion (default «Уроки» view) */}
      {!showMaterials && (
      <div data-tour="learn-add-to-track" className="space-y-6">
        {courses?.map((course) => {
          const filteredCourseLessons = course.lessons.filter(lesson => filterLesson(lesson));
          if (filteredCourseLessons.length === 0 && (filters.category !== 'ALL' || filters.status !== 'ALL' || filters.topics.length > 0 || filters.difficulty !== 'ALL' || filters.duration !== 'ALL' || filters.marketplace !== 'ALL')) {
            return null; // Hide empty courses when filters are active
          }

          const isExpanded = expandedCourses.has(course.id);
          const visibleLessons = isExpanded
            ? filteredCourseLessons
            : filteredCourseLessons.slice(0, INITIAL_LESSONS_SHOWN);
          const hiddenCount = filteredCourseLessons.length - INITIAL_LESSONS_SHOWN;

          if (filters.courseId !== 'ALL' && course.id !== filters.courseId) return null;

          const continueLesson = course.lessons.find(
            (l) => l.status === 'IN_PROGRESS'
          ) || (course.progressPercent > 0
            ? course.lessons.find((l) => l.status === 'NOT_STARTED')
            : null);

          return (
            <Card key={course.id} id={`course-${course.id}`} className="shadow-mp-card">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-heading">{course.title}</CardTitle>
                    <CardDescription className="text-body-sm">{course.description}</CardDescription>
                  </div>
                  <div className="text-right">
                    <div className="text-display-sm font-bold text-mp-gray-900">
                      {course.completedLessons}/{course.totalLessons}
                    </div>
                    <div className="text-body-sm text-mp-gray-500">уроков</div>
                  </div>
                </div>
                {course.progressPercent > 0 && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-1.5">
                      {course.progressPercent === 100 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-caption font-medium border border-mp-green-200 bg-mp-green-50 text-mp-green-700">
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          Курс завершён
                        </span>
                      ) : (
                        <span className="text-caption text-mp-gray-500">{course.progressPercent}% завершено</span>
                      )}
                      {continueLesson && course.progressPercent < 100 && (
                        <Link href={`/learn/${continueLesson.id}`}>
                          <Button variant="ghost" size="sm" className="text-caption text-mp-blue-600 hover:text-mp-blue-700 h-auto py-0.5 px-2">
                            Продолжить просмотр
                            <svg className="w-3.5 h-3.5 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </Button>
                        </Link>
                      )}
                    </div>
                    <div className="h-1.5 bg-mp-gray-200 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-500',
                          course.progressPercent === 100 ? 'bg-mp-green-500' : 'bg-mp-blue-500'
                        )}
                        style={{ width: `${course.progressPercent}%` }}
                      />
                    </div>
                  </div>
                )}
              </CardHeader>
              <CardContent className="px-2 sm:px-6 overflow-hidden">
                <div className="grid gap-2 sm:gap-3">
                  {visibleLessons.map((lesson, idx) => (
                    <LessonCard
                      key={lesson.id}
                      lesson={{ ...lesson, title: `${idx + 1}. ${lesson.title}` }}
                      showCourse={false}
                      isRecommended={recommendedLessonIds.has(lesson.id)}
                      locked={lesson.locked}
                      favorite={{ itemId: lesson.id, initialFavorited: favoritedLessonIds.has(lesson.id) }}
                    />
                  ))}
                </div>
                <CourseLockBanner lockedCount={course.lessons.filter(l => l.locked).length} />
                {hiddenCount > 0 && (
                  <div className="mt-4 text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleCourseExpanded(course.id)}
                    >
                      {isExpanded
                        ? 'Скрыть'
                        : `Показать все ${filteredCourseLessons.length} уроков`}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      )}
    </div>
  );
}
