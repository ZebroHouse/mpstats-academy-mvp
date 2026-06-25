'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  ChevronDown,
  ChevronUp,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Plus,
  Trash2,
  Search,
  AlertTriangle,
} from 'lucide-react';
import { CreateJobDialog } from './CreateJobDialog';

type Marketplace = 'WB' | 'OZON' | 'BOTH';

interface JobSummary {
  id: string;
  slug: string;
  title: string;
  marketplace: Marketplace;
  displayOrder: number;
  isPublished: boolean;
  lessonCount: number;
  hasEmbedding: boolean;
}

const MARKETPLACE_LABEL: Record<Marketplace, string> = {
  WB: 'WB',
  OZON: 'OZON',
  BOTH: 'WB + OZON',
};

export function JobManager() {
  const jobs = trpc.admin.job.getJobs.useQuery();
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-end pb-1">
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> Создать задачу
        </Button>
      </div>

      {jobs.isLoading ? (
        <div className="p-4 text-center text-body-sm text-mp-gray-400">Загрузка задач…</div>
      ) : jobs.error ? (
        <div className="p-4 text-center text-body-sm text-red-600">
          Ошибка загрузки: {jobs.error.message}
        </div>
      ) : jobs.data && jobs.data.length > 0 ? (
        <div className="space-y-3">
          {jobs.data.map((job) => (
            <JobAccordion
              key={job.id}
              job={job}
              isExpanded={expandedJob === job.id}
              onToggle={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
            />
          ))}
        </div>
      ) : (
        <div className="p-4 text-center text-body-sm text-mp-gray-400">Задач пока нет</div>
      )}

      {createOpen && <CreateJobDialog onClose={() => setCreateOpen(false)} />}
    </>
  );
}

function JobAccordion({
  job,
  isExpanded,
  onToggle,
}: {
  job: JobSummary;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const utils = trpc.useUtils();

  const setPublished = trpc.admin.job.setJobPublished.useMutation({
    onSuccess: () => {
      utils.admin.job.getJobs.invalidate();
    },
    onError: (e) => toast.error('Не удалось изменить публикацию: ' + e.message),
  });

  const reembed = trpc.admin.job.reembedJob.useMutation({
    onSuccess: () => {
      utils.admin.job.getJobs.invalidate();
      toast.success('Эмбеддинг пересоздан');
    },
    onError: (e) => toast.error('Ошибка переиндексации: ' + e.message),
  });

  return (
    <div className="border rounded-lg overflow-hidden border-mp-gray-200 bg-white">
      {/* Job header */}
      <div className="flex items-stretch">
        <button
          onClick={onToggle}
          className="flex-1 flex items-center justify-between px-4 py-3 hover:bg-mp-gray-50 transition-colors text-left min-w-0"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-body-md font-semibold text-mp-gray-900 truncate">
              {job.title}
            </span>
            <Badge variant="default" size="sm" className="shrink-0">
              {MARKETPLACE_LABEL[job.marketplace]}
            </Badge>
            {!job.hasEmbedding && (
              <Badge variant="warning" size="sm" className="shrink-0">
                без эмбеддинга
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Badge variant="primary" size="sm">
              {job.lessonCount} уроков
            </Badge>
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-mp-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-mp-gray-400" />
            )}
          </div>
        </button>

        {/* Publish toggle */}
        <div
          className="px-3 border-l border-mp-gray-200 flex items-center gap-2"
          title={job.isPublished ? 'Опубликована' : 'Черновик'}
        >
          <Switch
            checked={job.isPublished}
            disabled={setPublished.isPending}
            onCheckedChange={(next) =>
              setPublished.mutate({ jobId: job.id, isPublished: next })
            }
          />
        </div>

        {/* Reembed */}
        <button
          onClick={() => reembed.mutate({ jobId: job.id })}
          disabled={reembed.isPending}
          className="px-3 border-l border-mp-gray-200 flex items-center justify-center text-mp-gray-400 hover:bg-mp-blue-50 hover:text-mp-blue-600 transition-colors disabled:opacity-50"
          title="Переиндексировать (пересоздать эмбеддинг)"
        >
          <RefreshCw className={`w-4 h-4 ${reembed.isPending ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {isExpanded && <JobLessonsPanel jobId={job.id} />}
    </div>
  );
}

function JobLessonsPanel({ jobId }: { jobId: string }) {
  const utils = trpc.useUtils();
  const lessons = trpc.admin.job.getJobLessons.useQuery({ jobId }, { enabled: true });

  const invalidate = useCallback(() => {
    utils.admin.job.getJobLessons.invalidate({ jobId });
    utils.admin.job.getJobs.invalidate();
  }, [utils, jobId]);

  const reorder = trpc.admin.job.reorderJobLesson.useMutation({
    onSuccess: () => utils.admin.job.getJobLessons.invalidate({ jobId }),
    onError: (e) => toast.error('Ошибка перемещения: ' + e.message),
  });

  const remove = trpc.admin.job.removeJobLesson.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success('Урок убран из задачи');
      setRemoveTarget(null);
    },
    onError: (e) => toast.error('Ошибка удаления: ' + e.message),
  });

  const [removeTarget, setRemoveTarget] = useState<{ lessonId: string; title: string } | null>(
    null,
  );
  const [showAdd, setShowAdd] = useState(false);

  const rows = lessons.data ?? [];
  const existingIds = new Set(rows.map((r) => r.lessonId));

  return (
    <div className="border-t border-mp-gray-200">
      {lessons.isLoading ? (
        <div className="p-4 text-center text-body-sm text-mp-gray-400">Загрузка уроков…</div>
      ) : rows.length > 0 ? (
        <div className="divide-y divide-mp-gray-100">
          {rows.map((lesson, index) => (
            <div
              key={lesson.lessonId}
              className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                lesson.isHidden ? 'bg-mp-gray-50/70 opacity-70' : 'hover:bg-mp-gray-50'
              }`}
            >
              <span className="w-8 text-xs font-mono text-mp-gray-400 text-right shrink-0">
                {lesson.order}
              </span>

              <div className="flex-1 min-w-0">
                <p
                  className={`text-body-sm truncate ${
                    lesson.isHidden ? 'text-mp-gray-500 line-through' : 'text-mp-gray-900'
                  }`}
                  title={lesson.title}
                >
                  {lesson.title}
                </p>
                <p className="text-caption text-mp-gray-400 truncate">{lesson.courseTitle}</p>
              </div>

              {lesson.isHidden && (
                <Badge variant="default" size="sm" className="bg-mp-gray-200 text-mp-gray-600 shrink-0">
                  скрыт
                </Badge>
              )}

              {/* Up / Down */}
              <button
                onClick={() =>
                  reorder.mutate({ jobId, lessonId: lesson.lessonId, targetOrder: index - 1 })
                }
                disabled={index === 0 || reorder.isPending}
                className="p-1 rounded transition-colors shrink-0 text-mp-gray-400 hover:bg-mp-blue-50 hover:text-mp-blue-600 disabled:opacity-30 disabled:hover:bg-transparent"
                title="Выше"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
              <button
                onClick={() =>
                  reorder.mutate({ jobId, lessonId: lesson.lessonId, targetOrder: index + 1 })
                }
                disabled={index === rows.length - 1 || reorder.isPending}
                className="p-1 rounded transition-colors shrink-0 text-mp-gray-400 hover:bg-mp-blue-50 hover:text-mp-blue-600 disabled:opacity-30 disabled:hover:bg-transparent"
                title="Ниже"
              >
                <ArrowDown className="w-4 h-4" />
              </button>

              {/* Remove */}
              <button
                onClick={() => setRemoveTarget({ lessonId: lesson.lessonId, title: lesson.title })}
                className="p-1 rounded transition-colors shrink-0 text-mp-gray-400 hover:bg-red-50 hover:text-red-600"
                title="Убрать из задачи"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-4 text-center text-body-sm text-mp-gray-400">В задаче нет уроков</div>
      )}

      <div className="border-t border-mp-gray-100 p-3 bg-mp-gray-50 space-y-3">
        {showAdd ? (
          <AddLessonSearch
            jobId={jobId}
            existingIds={existingIds}
            onAdded={invalidate}
            onClose={() => setShowAdd(false)}
          />
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setShowAdd(true)}
          >
            <Plus className="w-4 h-4 mr-1" /> Добавить урок
          </Button>
        )}
      </div>

      {removeTarget && (
        <RemoveLessonDialog
          lessonTitle={removeTarget.title}
          isRemoving={remove.isPending}
          onConfirm={() => remove.mutate({ jobId, lessonId: removeTarget.lessonId })}
          onClose={() => setRemoveTarget(null)}
        />
      )}
    </div>
  );
}

function AddLessonSearch({
  jobId,
  existingIds,
  onAdded,
  onClose,
}: {
  jobId: string;
  existingIds: Set<string>;
  onAdded: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  // Debounce the search input (~300ms) so we don't fire a query per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const results = trpc.admin.job.searchLessons.useQuery(
    { query: debounced },
    { enabled: debounced.length > 0 },
  );

  const add = trpc.admin.job.addJobLesson.useMutation({
    onSuccess: () => {
      onAdded();
      toast.success('Урок добавлен в задачу');
    },
    onError: (e) => {
      if (e.data?.code === 'CONFLICT') {
        toast.error('Урок уже в задаче');
      } else {
        toast.error('Ошибка добавления: ' + e.message);
      }
    },
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-mp-gray-400" />
          <Input
            inputSize="sm"
            className="pl-9"
            placeholder="Поиск урока по названию…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Закрыть
        </Button>
      </div>

      {debounced.length > 0 && (
        <div className="max-h-64 overflow-y-auto rounded-lg border border-mp-gray-200 bg-white divide-y divide-mp-gray-100">
          {results.isLoading ? (
            <div className="p-3 text-center text-body-sm text-mp-gray-400">Поиск…</div>
          ) : results.data && results.data.length > 0 ? (
            results.data.map((lesson) => {
              const inJob = existingIds.has(lesson.lessonId);
              return (
                <button
                  key={lesson.lessonId}
                  disabled={inJob || add.isPending}
                  onClick={() => add.mutate({ jobId, lessonId: lesson.lessonId })}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-mp-blue-50 transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-body-sm text-mp-gray-900 truncate">{lesson.title}</p>
                    <p className="text-caption text-mp-gray-400 truncate">{lesson.courseTitle}</p>
                  </div>
                  {lesson.isHidden && (
                    <Badge variant="default" size="sm" className="bg-mp-gray-200 text-mp-gray-600 shrink-0">
                      скрыт
                    </Badge>
                  )}
                  {inJob && (
                    <span className="text-caption text-mp-gray-400 shrink-0">уже в задаче</span>
                  )}
                </button>
              );
            })
          ) : (
            <div className="p-3 text-center text-body-sm text-mp-gray-400">Ничего не найдено</div>
          )}
        </div>
      )}
    </div>
  );
}

function RemoveLessonDialog({
  lessonTitle,
  isRemoving,
  onConfirm,
  onClose,
}: {
  lessonTitle: string;
  isRemoving: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl p-6 w-full max-w-md space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 text-red-600">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <h3 className="text-heading font-semibold">Убрать урок из задачи?</h3>
        </div>
        <p className="text-body-md font-semibold text-mp-gray-900 break-words">{lessonTitle}</p>
        <p className="text-body-sm text-mp-gray-600">
          Урок будет убран из этой задачи. Сам урок и его контент не удаляются.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={isRemoving}>
            Отмена
          </Button>
          <Button variant="destructive" disabled={isRemoving} onClick={onConfirm}>
            {isRemoving ? 'Удаление…' : 'Убрать'}
          </Button>
        </div>
      </div>
    </div>
  );
}
