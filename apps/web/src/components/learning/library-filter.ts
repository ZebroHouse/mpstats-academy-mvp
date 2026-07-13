import type { FilterState } from './FilterPanel';
import { isOzonCourse, type LessonWithProgress } from '@mpstats/shared';

// Pure per-lesson predicate for the Knowledge Base (/learn/library) filter panel.
// Extracted from library/page.tsx so the branches can be unit-tested in isolation.
export function filterLessonByState(lesson: LessonWithProgress, filters: FilterState): boolean {
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
    const ozon = isOzonCourse(courseId);
    if (filters.marketplace === 'OZON') {
      if (!ozon) return false;
    } else {
      if (ozon) return false;
    }
  }
  if (filters.courseId !== 'ALL' && ((lesson as unknown) as Record<string, unknown>).courseId !== filters.courseId) return false;
  if (filters.badge !== 'ALL') {
    const badges = (((lesson as unknown) as Record<string, unknown>).badges as string[] | undefined) ?? [];
    if (!badges.includes(filters.badge)) return false;
  }
  return true;
}
