'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatTimecode } from '@mpstats/shared';
import type { SearchLessonResult } from '@mpstats/shared';

interface SearchResultCardProps {
  result: SearchLessonResult;
}

const DIFFICULTY_LABELS: Record<string, { label: string; color: string }> = {
  EASY: { label: 'Легкий', color: 'bg-mp-green-100 text-mp-green-700' },
  MEDIUM: { label: 'Средний', color: 'bg-yellow-100 text-yellow-700' },
  HARD: { label: 'Сложный', color: 'bg-red-100 text-red-700' },
};

export function SearchResultCard({ result }: SearchResultCardProps) {
  const difficulty = DIFFICULTY_LABELS[result.lesson.skillLevel] || DIFFICULTY_LABELS.MEDIUM;

  return (
    <Card className={cn(
      'shadow-mp-card hover:shadow-mp-card-hover transition-shadow',
      result.locked && 'opacity-75'
    )}>
      <CardContent className="p-4">
        {/* Row 1: Course name + badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-body-sm text-mp-gray-500">{result.course.title}</span>
          <span className={cn('text-caption font-semibold px-2 py-0.5 rounded-full', difficulty.color)}>
            {difficulty.label}
          </span>
          {result.inRecommendedPath && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-caption font-semibold border border-mp-blue-200 bg-mp-blue-50 text-mp-blue-700">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              В вашем плане
            </span>
          )}
        </div>

        {/* Row 2: Lesson title */}
        <div className="flex items-center gap-2 mt-2">
          <Link
            href={`/learn/${result.lesson.id}`}
            className="text-heading text-mp-gray-900 hover:text-mp-blue-600 transition-colors"
          >
            {result.lesson.title}
          </Link>
          {result.locked && (
            <svg className="w-4 h-4 text-mp-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          )}
        </div>

        {/* Row 3: Topics + duration + progress */}
        <div className="flex items-center gap-2 flex-wrap mt-1">
          {result.lesson.topics.slice(0, 3).map(topic => (
            <span key={topic} className="text-caption bg-mp-gray-100 text-mp-gray-700 px-2 py-0.5 rounded-full">
              {topic}
            </span>
          ))}
          {result.lesson.duration > 0 && (
            <span className="text-body-sm text-mp-gray-500">{result.lesson.duration} мин</span>
          )}
          {result.watchedPercent > 0 && (
            <span className="text-body-sm text-mp-gray-500">{result.watchedPercent}%</span>
          )}
        </div>

        {/* Snippets section */}
        {result.snippets.length > 0 && (
          <div className="mt-3 space-y-2 border-t border-mp-gray-100 pt-3">
            {result.snippets.map((snippet, idx) => (
              <div key={idx} className="flex gap-2">
                <span className="text-mp-gray-300 text-lg leading-none">&ldquo;</span>
                <div>
                  {result.locked ? (
                    <span className="text-body-sm text-mp-gray-400">Доступно по подписке</span>
                  ) : (
                    <Link href={`/learn/${result.lesson.id}?t=${snippet.timecodeStart}`}>
                      <span className="text-body-sm font-semibold text-mp-blue-600 hover:text-mp-blue-700 whitespace-nowrap">
                        {formatTimecode(snippet.timecodeStart)} - {formatTimecode(snippet.timecodeEnd)}
                      </span>
                    </Link>
                  )}
                  <span className="text-body-sm text-mp-gray-600 line-clamp-2"> {snippet.content}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
