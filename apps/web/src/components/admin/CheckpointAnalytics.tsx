'use client';

import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const REMOVED_OPTION_LABEL = '(удалённый вариант)';

interface BarRowProps {
  label: string;
  count: number;
  percent: number;
  /** Removed options (no longer in the lesson body) get a muted/red-tinted style. */
  isRemoved?: boolean;
}

function BarRow({ label, count, percent, isRemoved }: BarRowProps) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <span className={cn('text-body-sm truncate', isRemoved ? 'text-red-500' : 'text-mp-gray-900')}>
          {label}
        </span>
        <span className="text-body-sm text-mp-gray-500 whitespace-nowrap tabular-nums">
          {count} ({percent}%)
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-primary/10 overflow-hidden">
        <div
          className={cn('h-full rounded-full', isRemoved ? 'bg-red-400' : 'bg-primary')}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function CheckpointAnalytics() {
  const lessons = trpc.admin.analytics.listInteractiveLessons.useQuery();
  const [lessonId, setLessonId] = useState<string | null>(null);

  // Default-select the first lesson with responses (else the first lesson) once the
  // list loads. Guard against overriding a selection the user already made.
  useEffect(() => {
    if (lessonId !== null) return;
    const list = lessons.data;
    if (!list || list.length === 0) return;
    const withResponses = list.find((l) => l.respondentCount > 0);
    setLessonId((withResponses ?? list[0]).lessonId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once the list is loaded; the lessonId guard prevents overriding a user selection
  }, [lessons.data?.length, lessonId]);

  const analytics = trpc.admin.analytics.getCheckpointAnalytics.useQuery(
    { lessonId: lessonId! },
    { enabled: !!lessonId },
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-heading-lg font-bold text-mp-gray-900">Чекпоинты</h2>
        <p className="text-body-sm text-mp-gray-500 mt-1">
          Как ученики проходят развилки в интерактивных уроках
        </p>
      </div>

      {lessons.isLoading ? (
        <Card className="p-6 text-center text-body-sm text-mp-gray-500">Загрузка…</Card>
      ) : lessons.error ? (
        <Card className="p-6 text-center">
          <p className="text-red-600 font-medium">Не удалось загрузить список уроков</p>
          <p className="text-body-sm text-mp-gray-500 mt-1">{lessons.error.message}</p>
        </Card>
      ) : !lessons.data || lessons.data.length === 0 ? (
        <Card className="p-6 text-center text-body-sm text-mp-gray-500">
          Пока нет интерактивных уроков с чекпоинтами
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT — lesson list */}
          <Card className="p-2 lg:col-span-1 h-max">
            <ul className="space-y-1">
              {lessons.data.map((lesson) => {
                const isSelected = lesson.lessonId === lessonId;
                return (
                  <li key={lesson.lessonId}>
                    <button
                      type="button"
                      onClick={() => setLessonId(lesson.lessonId)}
                      className={cn(
                        'w-full text-left rounded-xl px-3 py-2.5 border-l-2 transition-colors',
                        isSelected
                          ? 'bg-primary/10 border-primary'
                          : 'border-transparent hover:bg-mp-gray-50',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-body-sm font-medium text-mp-gray-900 truncate">
                            {lesson.title}
                            {lesson.isHidden && (
                              <span className="ml-2 text-xs font-normal text-mp-gray-400">скрыт</span>
                            )}
                          </p>
                          <p className="text-xs text-mp-gray-500 truncate mt-0.5">{lesson.courseTitle}</p>
                        </div>
                        <span className="text-xs text-mp-gray-500 whitespace-nowrap shrink-0 mt-0.5">
                          {lesson.respondentCount} ответов
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* RIGHT — selected lesson distributions */}
          <div className="lg:col-span-2 space-y-6">
            {analytics.isLoading ? (
              <Card className="p-6 text-center text-body-sm text-mp-gray-500">Загрузка…</Card>
            ) : analytics.error ? (
              <Card className="p-6 text-center">
                <p className="text-red-600 font-medium">Не удалось загрузить аналитику</p>
                <p className="text-body-sm text-mp-gray-500 mt-1">{analytics.error.message}</p>
              </Card>
            ) : analytics.data ? (
              <>
                <div>
                  <h3 className="text-body font-semibold text-mp-gray-900">{analytics.data.lessonTitle}</h3>
                  <p className="text-body-sm text-mp-gray-500 mt-0.5">{analytics.data.courseTitle}</p>
                  <p className="text-body-sm text-mp-gray-500 mt-1">
                    Всего учеников: {analytics.data.totalRespondents}
                  </p>
                  {analytics.data.totalRespondents === 0 && (
                    <p className="text-body-sm text-amber-600 mt-2">Пока нет ответов учеников</p>
                  )}
                </div>

                {analytics.data.checkpoints.map((checkpoint) => (
                  <Card key={checkpoint.checkpointId} className="p-5 space-y-4">
                    <div>
                      <h4 className="text-body font-semibold text-mp-gray-900">{checkpoint.contextLabel}</h4>
                      <p className="text-body-sm text-mp-gray-500 mt-0.5">
                        Ответили: {checkpoint.totalAnswered}
                      </p>
                    </div>

                    {checkpoint.totalAnswered === 0 ? (
                      <div className="space-y-3">
                        {checkpoint.options.map((option) => (
                          <div key={option.optionId} className="flex items-baseline justify-between gap-3">
                            <span className="text-body-sm text-mp-gray-900 truncate">{option.label}</span>
                            <span className="text-body-sm text-mp-gray-400">—</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {checkpoint.options.map((option) => (
                          <BarRow
                            key={option.optionId}
                            label={option.label}
                            count={option.count}
                            percent={option.percent}
                            isRemoved={option.label === REMOVED_OPTION_LABEL}
                          />
                        ))}
                      </div>
                    )}
                  </Card>
                ))}
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
