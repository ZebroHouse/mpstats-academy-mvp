'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import type { LessonWithProgress } from '@mpstats/shared';
import { FavoriteButton } from './FavoriteButton';

interface LessonCardProps {
  lesson: LessonWithProgress;
  showCourse?: boolean;
  courseName?: string;
  isRecommended?: boolean;
  locked?: boolean;
  inTrack?: boolean;
  onToggleTrack?: () => void;
  onRemoveFromTrack?: () => void;
  /**
   * When provided, renders the «сердечко» (Избранное, D-06) in the action slot.
   * Used in the База знаний catalog so manual adds go to Избранное, not the План.
   */
  favorite?: { itemId: string; initialFavorited?: boolean };
}

const CATEGORY_COLORS: Record<string, string> = {
  ANALYTICS: 'bg-mp-blue-100 text-mp-blue-700',
  MARKETING: 'bg-mp-green-100 text-mp-green-700',
  CONTENT: 'bg-mp-pink-100 text-mp-pink-700',
  OPERATIONS: 'bg-orange-100 text-orange-700',
  FINANCE: 'bg-yellow-100 text-yellow-700',
};

const CATEGORY_LABELS: Record<string, string> = {
  ANALYTICS: 'Аналитика',
  MARKETING: 'Маркетинг',
  CONTENT: 'Контент',
  OPERATIONS: 'Операции',
  FINANCE: 'Финансы',
};

const STATUS_CONFIG = {
  NOT_STARTED: {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    color: 'text-mp-gray-400',
    label: 'Не начат',
  },
  IN_PROGRESS: {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    color: 'text-mp-blue-500',
    label: 'В процессе',
  },
  COMPLETED: {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    color: 'text-mp-green-500',
    label: 'Завершён',
  },
};

const LOCK_ICON = (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
  </svg>
);

export function LessonCard({ lesson, showCourse, courseName, isRecommended, locked, inTrack, onToggleTrack, onRemoveFromTrack, favorite }: LessonCardProps) {
  const isLocked = locked ?? lesson.locked;
  const status = STATUS_CONFIG[lesson.status];

  return (
    <Link href={`/learn/${lesson.id}`}>
      <Card className="shadow-mp-card hover:shadow-mp-card-hover transition-all duration-300 cursor-pointer h-full hover:-translate-y-0.5">
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-start gap-3 sm:gap-4">
            {/* Status icon or lock icon — title attribute disambiguates "not started" vs "paywalled" on hover */}
            <div
              className={cn('flex-shrink-0 mt-1', isLocked ? 'text-mp-gray-400' : status.color)}
              title={isLocked ? 'Доступен по подписке' : status.label}
            >
              {isLocked ? LOCK_ICON : status.icon}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              {/* Course name */}
              {showCourse && courseName && (
                <div className="text-caption text-mp-gray-500 mb-1">{courseName}</div>
              )}

              {/* Title */}
              <h3 className="font-medium text-mp-gray-900 line-clamp-2">
                {lesson.title}
              </h3>

              {/* Description */}
              {lesson.description && (
                <p className="text-body-sm text-mp-gray-500 mt-1 line-clamp-2">
                  {lesson.description}
                </p>
              )}

              {/* Meta */}
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-2 sm:mt-3">
                <span className={cn('px-2 py-0.5 rounded-md text-caption font-medium', CATEGORY_COLORS[lesson.skillCategory])}>
                  {CATEGORY_LABELS[lesson.skillCategory]}
                </span>
                {!isLocked && isRecommended && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-caption font-medium bg-mp-green-100 text-mp-green-700">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Рекомендовано
                  </span>
                )}
                {lesson.duration > 0 && (
                  <span className="text-caption text-mp-gray-500 flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {lesson.duration} мин
                  </span>
                )}
              </div>

              {/* Progress bar for any lesson with watch progress (hidden when locked) */}
              {!isLocked && lesson.watchedPercent > 0 && (
                <div className="mt-3">
                  <div className="flex justify-between items-center text-caption text-mp-gray-500 mb-1">
                    <span className="flex items-center gap-1">
                      Прогресс
                      {lesson.status === 'COMPLETED' && (
                        <svg className="w-3.5 h-3.5 text-mp-green-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      )}
                    </span>
                    <span>{lesson.watchedPercent}%</span>
                  </div>
                  <div className="h-1.5 bg-mp-gray-200 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-500',
                        lesson.status === 'COMPLETED' ? 'bg-mp-green-500' : 'bg-mp-blue-500'
                      )}
                      style={{ width: `${lesson.watchedPercent}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Избранное «сердечко» (D-06) — manual add lands in Избранное, not the План */}
            {favorite && (
              <FavoriteButton
                itemType="LESSON"
                itemId={favorite.itemId}
                initialFavorited={favorite.initialFavorited}
                className="flex-shrink-0 -mr-1"
              />
            )}

            {/* Track toggle button — labeled so users actually find it */}
            {onToggleTrack && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleTrack();
                }}
                className={cn(
                  'flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 h-8 rounded-full text-xs font-medium transition-all',
                  inTrack
                    ? 'bg-mp-green-100 text-mp-green-700 hover:bg-mp-green-200 cursor-default'
                    : 'bg-mp-blue-50 text-mp-blue-700 border border-mp-blue-200 hover:bg-mp-blue-100'
                )}
                title={inTrack ? 'Уже в твоём плане' : 'Добавить в твой план обучения'}
              >
                {inTrack ? (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="hidden sm:inline">В плане</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="hidden sm:inline">В план</span>
                  </>
                )}
              </button>
            )}

            {/* Remove from track button */}
            {onRemoveFromTrack && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRemoveFromTrack();
                }}
                className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 transition-all"
                title="Убрать из плана"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}

            {/* Arrow */}
            <svg className="w-5 h-5 text-mp-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
