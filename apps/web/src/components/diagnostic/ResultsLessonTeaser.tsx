'use client';

import Link from 'next/link';

export const RESULTS_LESSON_TEASER_CAP = 5; // never a wall (spec §6.5)
const TEASER_AXES = 2;

interface TeaserLesson { id: string; title: string; courseName?: string }
interface TeaserSection { axis: string; label: string; score: number; lessons: TeaserLesson[] }

/** Short "start with a single lesson" list — two weakest axes, hard-capped total, grouped by axis label. */
export function ResultsLessonTeaser({ sections }: { sections: TeaserSection[] }) {
  const weakSections = sections.slice(0, TEASER_AXES);
  let budget = RESULTS_LESSON_TEASER_CAP;
  const grouped: Array<{ label: string; lessons: TeaserLesson[] }> = [];
  for (const section of weakSections) {
    if (budget <= 0) break;
    const take = section.lessons.slice(0, budget);
    if (take.length === 0) continue;
    grouped.push({ label: section.label, lessons: take });
    budget -= take.length;
  }
  const total = grouped.reduce((n, g) => n + g.lessons.length, 0);
  if (total === 0) return null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-heading text-mp-gray-900">Или начните с отдельного урока</h2>
        <p className="text-body-sm text-mp-gray-500 mt-1">Несколько уроков по вашим слабым зонам</p>
      </div>
      {grouped.map((group) => (
        <div key={group.label} className="space-y-2">
          <p className="text-body-sm font-semibold text-mp-gray-700">{group.label}</p>
          {group.lessons.map((lesson) => (
            <Link key={lesson.id} href={`/learn/${lesson.id}`} className="flex items-center gap-3 bg-white border border-mp-gray-200 rounded-xl px-4 py-3 shadow-mp-card hover:shadow-mp-card-hover transition-shadow">
              <div className="min-w-0">
                <div className="text-body font-medium text-mp-gray-900 leading-snug line-clamp-1">{lesson.title}</div>
                {lesson.courseName && <div className="text-caption text-mp-gray-400 mt-0.5">{lesson.courseName}</div>}
              </div>
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}
