'use client';

import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LessonCard } from '@/components/learning/LessonCard';
import { SearchBar } from '@/components/learning/SearchBar';
import { FilterPanel, type FilterState } from '@/components/learning/FilterPanel';
import { SearchResultCard } from '@/components/learning/SearchResultCard';
import { CourseLockBanner } from '@/components/learning/PaywallBanner';
import { MarketplaceSwitch } from '@/components/learning/MarketplaceSwitch';
import { JobCatalog, type ProgressFilter } from '@/components/learning/JobCatalog';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';
import type { LessonWithProgress } from '@mpstats/shared';

const INITIAL_LESSONS_SHOWN = 5;

const PROGRESS_FILTER_LABELS: Record<ProgressFilter, string> = {
  ALL: 'Все',
  NOT_STARTED: 'Не начато',
  IN_PROGRESS: 'В процессе',
  COMPLETED: 'Завершено',
};

function pluralLessons(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return `${n} урок`;
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return `${n} урока`;
  return `${n} уроков`;
}

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

export default function LearnPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Загрузка...</div>}>
      <LearnPageInner />
    </Suspense>
  );
}

function LearnPageInner() {
  const [lens, setLens] = useState<'jobs' | 'courses'>('jobs');
  const [marketplace, setMarketplace] = useState<'WB' | 'OZON'>('WB');
  const [progressFilter, setProgressFilter] = useState<ProgressFilter>('ALL');
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set());

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const filters = useMemo(() => filtersFromSearchParams(searchParams), [searchParams]);
  const setFilters = useCallback((newFilters: FilterState) => {
    const query = filtersToSearchParams(newFilters);
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [router, pathname]);

  const { data: courses, isLoading: coursesLoading, error: coursesError } = trpc.learning.getCourses.useQuery();
  const { data: recommendedPath } = trpc.learning.getRecommendedPath.useQuery();
  const { data: jobAxes, isLoading: jobsLoading, error: jobsError } = trpc.job.getCatalog.useQuery({ marketplace });

  // Search query
  const { data: searchResults, isLoading: searchLoading, error: searchError } = trpc.ai.searchLessons.useQuery(
    { query: searchQuery },
    { enabled: searchQuery.length > 0 }
  );

  // Auto-expand course from URL hash (e.g. /learn#01_analytics)
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash && courses?.some((c) => c.id === hash)) {
      setExpandedCourses((prev) => new Set(prev).add(hash));
      setLens('courses');
      setTimeout(() => {
        document.getElementById(`course-${hash}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [courses]);

  // O(1) lookup for recommended lesson IDs
  const recommendedLessonIds = new Set(
    recommendedPath?.lessons.map((l) => l.id) ?? []
  );

  // O(1) lookup for lessons in user's track (all sections)
  const trackLessonIds = useMemo(() => {
    if (!recommendedPath?.sections) return new Set<string>();
    return new Set(recommendedPath.sections.flatMap((s: any) => s.lessons.map((l: any) => l.id as string)));
  }, [recommendedPath]);

  // Track management mutations
  const utils = trpc.useUtils();

  const addToTrackMutation = trpc.learning.addToTrack.useMutation({
    onMutate: async ({ lessonId }) => {
      await utils.learning.getRecommendedPath.cancel();
      const prev = utils.learning.getRecommendedPath.getData();
      utils.learning.getRecommendedPath.setData(undefined, (old: typeof prev) => {
        if (!old) return old;
        const sections: any[] = old.sections ? [...old.sections.map((s: any) => ({ ...s, lessons: [...s.lessons] }))] : [];
        let customIdx = sections.findIndex((s: any) => s.id === 'custom');
        if (customIdx < 0) {
          sections.unshift({ id: 'custom', title: 'Мои уроки', description: '0', lessons: [], lessonIds: [] });
          customIdx = 0;
        }
        const lessonData = courses?.flatMap(c => c.lessons).find(l => l.id === lessonId);
        const alreadyExists = sections[customIdx].lessons.some((l: any) => l.id === lessonId);
        if (!alreadyExists && lessonData) {
          sections[customIdx] = { ...sections[customIdx], lessons: [...sections[customIdx].lessons, lessonData] };
        }
        return { ...old, sections, isSectioned: true } as any;
      });
      return { prev };
    },
    onError: (_err: unknown, _vars: unknown, ctx: any) => {
      if (ctx?.prev) utils.learning.getRecommendedPath.setData(undefined, ctx.prev);
      toast.error('Не удалось добавить урок');
    },
    onSuccess: () => toast.success('Добавлено в трек'),
    onSettled: () => utils.learning.getRecommendedPath.invalidate(),
  });

  const addLessonsToTrackMutation = trpc.learning.addLessonsToTrack.useMutation({
    onSuccess: ({ added }) => {
      toast.success(`Добавлено в трек: ${pluralLessons(added)}`);
      utils.learning.getRecommendedPath.invalidate();
    },
    onError: () => toast.error('Не удалось добавить курс в трек'),
  });

  // Extract available topics from courses data
  const availableTopics = useMemo(() => {
    if (!courses) return [];
    const topicCount = new Map<string, number>();
    courses.forEach(course => {
      course.lessons.forEach(lesson => {
        const topics = ((lesson as unknown) as Record<string, unknown>).topics as string[] | undefined;
        if (topics) {
          topics.forEach(t => topicCount.set(t, (topicCount.get(t) || 0) + 1));
        }
      });
    });
    return Array.from(topicCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([topic]) => topic);
  }, [courses]);

  // Extract available courses for dropdown
  const availableCourses = useMemo(() => {
    if (!courses) return [];
    return courses.map(c => ({ id: c.id, title: c.title }));
  }, [courses]);

  // Filter search results client-side
  const filteredSearchResults = useMemo(() => {
    if (!searchResults?.results) return [];
    return searchResults.results.filter(r => {
      if (filters.category !== 'ALL' && r.lesson.skillCategory !== filters.category) return false;
      if (filters.status !== 'ALL' && r.status !== filters.status) return false;
      if (filters.difficulty !== 'ALL' && r.lesson.skillLevel !== filters.difficulty) return false;
      if (filters.courseId !== 'ALL' && r.lesson.courseId !== filters.courseId) return false;
      if (filters.duration !== 'ALL') {
        const d = r.lesson.duration;
        if (filters.duration === 'short' && d > 10) return false;
        if (filters.duration === 'medium' && (d <= 10 || d > 30)) return false;
        if (filters.duration === 'long' && d <= 30) return false;
      }
      if (filters.topics.length > 0) {
        if (!filters.topics.some(t => r.lesson.topics.includes(t))) return false;
      }
      if (filters.marketplace !== 'ALL') {
        if (filters.marketplace === 'OZON') {
          if (r.lesson.courseId !== '05_ozon') return false;
        } else {
          if (r.lesson.courseId === '05_ozon') return false;
        }
      }
      return true;
    });
  }, [searchResults, filters]);

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

  const isLoading = coursesLoading;
  const error = coursesError;

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
    );
  }

  // Next unfinished lesson from track (for "Продолжить" button)
  const nextLesson = recommendedPath?.lessons.find(
    (l) => l.status === 'IN_PROGRESS' || l.status === 'NOT_STARTED'
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 animate-slide-up">
        <div>
          <h1 className="text-display-sm text-mp-gray-900">Обучение</h1>
          <p className="text-body text-mp-gray-500 mt-1">
            Персональный план на основе диагностики
          </p>
        </div>
        {searchQuery.length === 0 && (
          <div data-tour="learn-view-toggle" className="flex gap-2">
            <Button
              variant={lens === 'jobs' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setLens('jobs')}
            >
              По задачам
            </Button>
            <Button
              variant={lens === 'courses' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setLens('courses')}
            >
              Все курсы
            </Button>
          </div>
        )}
      </div>

      {/* MarketplaceSwitch — under header, jobs lens only, hidden during search */}
      {searchQuery.length === 0 && lens === 'jobs' && (
        <div>
          <MarketplaceSwitch value={marketplace} onChange={setMarketplace} />
        </div>
      )}

      {/* Compact track banner — shown when there's track data, outside of search mode */}
      {searchQuery.length === 0 && recommendedPath && recommendedPath.totalLessons > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl border border-mp-gray-200 bg-white shadow-mp-card animate-slide-up">
          <span className="text-body-sm font-semibold text-mp-gray-700">
            Мой трек · {recommendedPath.completedLessons}/{recommendedPath.totalLessons}
          </span>
          <div className="flex gap-2">
            <Link href="/learn/track">
              <Button variant="outline" size="sm">Открыть трек</Button>
            </Link>
            {nextLesson && (
              <Link href={`/learn/${nextLesson.id}`}>
                <Button size="sm">Продолжить</Button>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div data-tour="learn-search">
        <SearchBar
          onSearch={(q) => setSearchQuery(q)}
          onClear={() => setSearchQuery('')}
          isSearching={searchLoading}
          hasResults={searchQuery.length > 0}
        />
      </div>

      {searchQuery.length > 0 ? (
        /* Search Results View — with full FilterPanel */
        <div>
          <div data-tour="learn-filters">
            <FilterPanel
              filters={filters}
              onFiltersChange={setFilters}
              availableTopics={availableTopics}
              availableCourses={availableCourses}
            />
          </div>
          {searchLoading && (
            <p className="text-body-sm text-mp-gray-500 mt-4">Ищем релевантные уроки...</p>
          )}
          {searchError && (
            <p className="text-body-sm text-red-500 mt-4">Не удалось выполнить поиск. Попробуйте ещё раз.</p>
          )}
          {!searchLoading && searchResults && (
            <>
              <p className="text-body-sm text-mp-gray-500 mb-3 mt-4" aria-live="polite">
                {filteredSearchResults.length} уроков найдено
              </p>
              {filteredSearchResults.length > 0 ? (
                <div className="space-y-3" aria-busy={searchLoading}>
                  {filteredSearchResults.map((result, i) => (
                    <div key={result.lesson.id} className="animate-slide-up" style={{ animationDelay: `${i * 50}ms` }}>
                      <SearchResultCard result={result} />
                    </div>
                  ))}
                </div>
              ) : (
                /* Empty search state */
                <div className="py-12 text-center">
                  <svg className="w-16 h-16 text-mp-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <h3 className="text-heading text-mp-gray-900 mb-2">Ничего не найдено</h3>
                  <p className="text-body text-mp-gray-500 mb-4">
                    Попробуйте переформулировать запрос или выберите один из популярных топиков
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {availableTopics.slice(0, 5).map(topic => (
                      <button
                        key={topic}
                        onClick={() => setSearchQuery(topic)}
                        className="px-3 py-1 rounded-full bg-mp-gray-100 text-body-sm text-mp-gray-600 hover:bg-mp-gray-200 cursor-pointer transition-colors"
                      >
                        {topic}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : lens === 'jobs' ? (
        /* Jobs lens — job catalog with thin progress filter */
        <div className="space-y-4">
          {/* Thin progress filter */}
          <div className="flex gap-2 flex-wrap">
            {(['ALL', 'NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'] as ProgressFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setProgressFilter(f)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-body-sm font-medium transition-colors',
                  progressFilter === f
                    ? 'bg-mp-blue-500 text-white'
                    : 'bg-white border border-mp-gray-200 text-mp-gray-600 hover:bg-mp-gray-50',
                )}
              >
                {PROGRESS_FILTER_LABELS[f]}
              </button>
            ))}
          </div>
          {jobsLoading && <div className="h-32 bg-mp-gray-200 rounded-xl animate-pulse" />}
          {jobsError && <p className="text-body-sm text-red-500 py-6 text-center">Не удалось загрузить каталог джоб.</p>}
          {!jobsLoading && !jobsError && <JobCatalog axes={jobAxes ?? []} progressFilter={progressFilter} />}
        </div>
      ) : (
        /* Courses lens — existing courses accordion */
        <div data-tour="learn-add-to-track" className="space-y-6">
          {courses?.map((course) => {
            // Apply filters to lessons in course view
            const filteredCourseLessons = course.lessons.filter(lesson => filterLesson(lesson));
            if (filteredCourseLessons.length === 0 && (filters.category !== 'ALL' || filters.status !== 'ALL' || filters.topics.length > 0 || filters.difficulty !== 'ALL' || filters.duration !== 'ALL' || filters.marketplace !== 'ALL')) {
              return null; // Hide empty courses when filters are active
            }

            const isExpanded = expandedCourses.has(course.id);
            const visibleLessons = isExpanded
              ? filteredCourseLessons
              : filteredCourseLessons.slice(0, INITIAL_LESSONS_SHOWN);
            const hiddenCount = filteredCourseLessons.length - INITIAL_LESSONS_SHOWN;

            // Skip if courseId filter is active and doesn't match
            if (filters.courseId !== 'ALL' && course.id !== filters.courseId) return null;

            // Find first lesson to continue watching
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
                  {/* Course progress bar */}
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
                        {(() => {
                          const addable = course.lessons.filter(
                            (l) => !l.locked && !trackLessonIds.has(l.id),
                          );
                          if (addable.length === 0) return null;
                          return (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-caption text-mp-blue-600 hover:text-mp-blue-700 h-auto py-0.5 px-2"
                              disabled={addLessonsToTrackMutation.isPending}
                              onClick={() =>
                                addLessonsToTrackMutation.mutate({
                                  lessonIds: addable.map((l) => l.id),
                                })
                              }
                              title={`Добавить ${pluralLessons(addable.length)} этого курса в твой персональный трек`}
                            >
                              <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                              + В трек ({addable.length})
                            </Button>
                          );
                        })()}
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
                        inTrack={trackLessonIds.has(lesson.id)}
                        onToggleTrack={trackLessonIds.has(lesson.id) ? () => {} : () => addToTrackMutation.mutate({ lessonId: lesson.id })}
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
