'use client';

import Link from 'next/link';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FavoriteButton } from './FavoriteButton';

export type LessonResultCardData = {
  id: string;
  title: string;
  courseTitle: string;
  snippet?: string | null;
  watchedPercent: number;
  locked: boolean;
  initialFavorited?: boolean;
};

/**
 * Lesson search-result card («База знаний» search, scope='library').
 * Mirrors JobCard layout language: title → /learn/[id], course name, snippet,
 * progress %, lock icon if gated.
 *
 * Reserve a top-right slot for FavoriteButton (LESSON) — mounted in 61-07.
 * Heart NOT added here.
 */
export function LessonResultCard({ lesson }: { lesson: LessonResultCardData }) {
  const pct = Math.max(0, Math.min(100, Math.round(lesson.watchedPercent)));
  const done = pct === 100;

  return (
    <Link
      href={`/learn/${lesson.id}`}
      className="flex flex-col bg-white border border-mp-gray-200 rounded-xl p-4 shadow-mp-card hover:shadow-mp-card-hover transition-shadow"
    >
      <div className="flex items-start gap-1">
        <h3 className="text-body font-semibold text-mp-gray-900 leading-snug flex-1">
          {lesson.title}
        </h3>
        {lesson.locked && <Lock className="w-4 h-4 text-mp-gray-400 shrink-0 mt-0.5" />}
        <FavoriteButton
          itemType="LESSON"
          itemId={lesson.id}
          initialFavorited={lesson.initialFavorited}
          className="-mt-2 -mr-2 shrink-0"
        />
      </div>
      <p className="text-caption text-mp-gray-500 mt-1">{lesson.courseTitle}</p>
      {/* Сниппет vision-RAG («[ЭКРАН @ …]») намеренно НЕ показываем — только заголовок + курс (UAT 03.06) */}
      <div className="h-1.5 bg-mp-gray-200 rounded-full mt-3 overflow-hidden">
        <div
          className={cn('h-full rounded-full', done ? 'bg-mp-green-500' : 'bg-mp-blue-500')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </Link>
  );
}
