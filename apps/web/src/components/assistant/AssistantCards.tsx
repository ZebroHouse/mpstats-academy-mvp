'use client';

import Link from 'next/link';
import { FavoriteButton } from '@/components/learning/FavoriteButton';
import type { AssistantLessonRef, AssistantJobRef, AssistantNavLink } from '@mpstats/ai';

interface Props {
  lessons: AssistantLessonRef[];
  jobs: AssistantJobRef[];
  navLinks?: AssistantNavLink[];
  favoritedKeys: Set<string>; // "LESSON:<id>" / "JOB:<id>"
}

export function AssistantCards({ lessons, jobs, navLinks = [], favoritedKeys }: Props) {
  if (lessons.length === 0 && jobs.length === 0 && navLinks.length === 0) return null;

  return (
    <div className="mt-2 space-y-2">
      {jobs.map((j) => (
        <div
          key={`J:${j.jobId}`}
          className="flex items-center gap-3 rounded-lg border-l-2 border-l-[#4338ca] bg-[#f5f6ff] p-2.5"
        >
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-wide text-[#4338ca]">Задача</div>
            <Link
              href={`/learn/job/${j.slug}`}
              className="block truncate text-sm font-semibold text-mp-gray-900 hover:underline"
            >
              {j.title}
            </Link>
            <div className="text-xs text-mp-gray-500">{j.lessonCount} уроков · собери план</div>
          </div>
          <FavoriteButton itemType="JOB" itemId={j.jobId} initialFavorited={favoritedKeys.has(`JOB:${j.jobId}`)} />
        </div>
      ))}

      {lessons.map((l) => (
        <div
          key={`L:${l.lessonId}`}
          className="flex items-center gap-3 rounded-lg border border-mp-gray-200 bg-white p-2.5"
        >
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-wide text-mp-gray-400">Урок</div>
            <Link
              href={`/learn/${l.lessonId}?from=assistant`}
              className="block truncate text-sm font-semibold text-mp-gray-900 hover:underline"
            >
              {l.title}
            </Link>
            <div className="text-xs text-mp-gray-500">
              {l.durationMin ? `${l.durationMin} мин` : ''}
              {l.courseTitle ? ` · ${l.courseTitle}` : ''}
            </div>
          </div>
          <FavoriteButton
            itemType="LESSON"
            itemId={l.lessonId}
            initialFavorited={favoritedKeys.has(`LESSON:${l.lessonId}`)}
          />
        </div>
      ))}

      {navLinks.map((n) => (
        <Link
          key={`N:${n.href}`}
          href={n.href}
          className="flex items-center gap-3 rounded-lg border border-mp-blue-200 bg-mp-blue-50 p-2.5 hover:bg-mp-blue-100"
        >
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-wide text-mp-blue-500">Перейти</div>
            <div className="truncate text-sm font-semibold text-mp-blue-700">{n.label}</div>
          </div>
          <svg className="h-4 w-4 shrink-0 text-mp-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      ))}
    </div>
  );
}
