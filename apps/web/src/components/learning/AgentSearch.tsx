'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { IntentResult } from '@mpstats/ai';
import { trpc } from '@/lib/trpc/client';
import { LessonResultCard, type LessonResultCardData } from './LessonResultCard';
import { MaterialCard, type MaterialCardProps } from './MaterialCard';

type Scope = 'solutions' | 'library';

const PLACEHOLDER: Record<Scope, string> = {
  solutions: 'Опишите задачу — подберём решение',
  library: 'Найдите урок или материал по теме',
};

type LibraryResult = {
  lessons: LessonResultCardData[];
  materials: MaterialCardProps[];
};

export function AgentSearch({ scope }: { scope: Scope }) {
  const [query, setQuery] = useState('');
  const [conversationState, setConversationState] = useState<string | undefined>();
  const [result, setResult] = useState<IntentResult | null>(null);
  const [libResult, setLibResult] = useState<LibraryResult | null>(null);
  const [pending, setPending] = useState(false);

  const utils = trpc.useUtils();
  // Reactive set of jobIds already in the user's track. Source of truth — backend.
  const recommendedPath = trpc.learning.getRecommendedPath.useQuery();
  const trackedJobIds = useMemo(() => {
    const added = (recommendedPath.data as { addedJobs?: Array<{ id: string }> } | undefined)?.addedJobs;
    return new Set((added ?? []).map((pb) => pb.id));
  }, [recommendedPath.data]);

  const resolveMutation = trpc.intent.resolve.useMutation();
  const addJobMutation = trpc.learning.addJobToTrack.useMutation({
    onSuccess: () => {
      toast.success('Решение в плане');
      utils.learning.getRecommendedPath.invalidate();
      utils.job.getCatalog.invalidate();
    },
    onError: (e) => {
      toast.error(e.message || 'Не удалось добавить');
    },
  });

  async function submitSolutions(q: string) {
    const res = await resolveMutation.mutateAsync({ query: q, surface: 'learn', conversationState });
    setResult(res);
    setConversationState(res.mode === 'clarify' ? res.conversationState : undefined);
  }

  async function submitLibrary(q: string) {
    // Two parallel queries against the isHidden-filtered read endpoints.
    const [lessonsRes, materialsRes] = await Promise.all([
      utils.ai.searchLessons.fetch({ query: q }),
      utils.material.listForUser.fetch({ search: q }),
    ]);

    const lessons: LessonResultCardData[] = (lessonsRes?.results ?? []).map((r) => ({
      id: r.lesson.id,
      title: r.lesson.title,
      courseTitle: r.course.title,
      snippet: r.snippets[0]?.content ?? null,
      watchedPercent: r.watchedPercent,
      locked: r.locked,
    }));

    const materials: MaterialCardProps[] = (materialsRes?.items ?? []).map((m) => ({
      id: m.id,
      type: m.type as MaterialCardProps['type'],
      title: m.title,
      description: m.description,
      ctaText: m.ctaText,
      externalUrl: m.externalUrl,
      hasFile: m.hasFile,
    }));

    setLibResult({ lessons, materials });
  }

  async function submit(raw: string) {
    const q = raw.trim();
    if (!q) return;
    setPending(true);
    try {
      if (scope === 'solutions') {
        await submitSolutions(q);
      } else {
        await submitLibrary(q);
      }
    } catch {
      toast.error('Не удалось выполнить поиск. Попробуйте ещё раз.');
    } finally {
      setPending(false);
    }
  }

  async function pickOption(intent: string) {
    setQuery(intent);
    await submit(intent);
  }

  const isPending = pending || (scope === 'solutions' && resolveMutation.isPending);

  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => { e.preventDefault(); submit(query); }}
        className="flex items-center h-12 border border-mp-gray-200 rounded-lg bg-white"
      >
        <input
          className="flex-1 h-full bg-transparent px-4 placeholder:text-mp-gray-400 focus:outline-none"
          placeholder={PLACEHOLDER[scope]}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={isPending}
        />
        <button
          type="submit"
          className="px-4 text-mp-blue-500 disabled:opacity-50"
          disabled={isPending || !query.trim()}
        >
          {isPending ? 'Ищем…' : 'Найти'}
        </button>
      </form>

      {isPending && (
        <div className="rounded-lg border p-4 bg-mp-gray-50 text-mp-gray-600 text-sm flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-mp-blue-500 animate-pulse" />
          {scope === 'solutions' ? 'Ищем лучший ответ среди решений…' : 'Ищем по урокам и материалам…'}
        </div>
      )}

      {/* ── Solutions scope render (intent.resolve) ─────────────────────── */}
      {scope === 'solutions' && !isPending && result?.mode === 'clarify' && (
        <div className="rounded-lg border p-4 space-y-3">
          <p className="font-medium">{result.question}</p>
          <div className="flex flex-wrap gap-2">
            {result.options.map((o) => (
              <button
                key={o.label}
                onClick={() => pickOption(o.intent)}
                className="px-3 py-1.5 rounded-full bg-mp-gray-100 hover:bg-mp-gray-200 text-sm"
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {scope === 'solutions' && !isPending && result?.mode === 'recommend' && (
        <div className="space-y-3">
          <p className="text-mp-gray-800">{result.answer}</p>
          {result.jobs.map((j) => {
            const isAdded = trackedJobIds.has(j.jobId);
            return (
              <div key={j.jobId} className="rounded-lg border p-4 flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <a href={`/learn/job/${j.slug}`} className="font-medium hover:underline">
                    {j.title}
                  </a>
                  <p className="text-sm text-mp-gray-600 mt-1">{j.reason}</p>
                  <p className="text-xs text-mp-gray-500 mt-1">{j.lessonCount} уроков</p>
                </div>
                <button
                  onClick={() => addJobMutation.mutate({ jobId: j.jobId })}
                  disabled={isAdded || addJobMutation.isPending}
                  className="px-3 py-2 rounded-md bg-mp-blue-500 text-white text-sm disabled:bg-mp-gray-300 whitespace-nowrap"
                >
                  {isAdded ? 'В плане ✓' : (j.actions[0]?.label ?? 'В план')}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {scope === 'solutions' && !isPending && result?.mode === 'fallback' && (
        <div className="rounded-lg border p-4 space-y-2">
          <p>{result.answer}</p>
          {result.lessons.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-mp-gray-700 list-disc pl-5">
              {result.lessons.map((l) => (
                <li key={l.lessonId}>{l.reason}</li>
              ))}
            </ul>
          )}
          <p className="text-xs text-mp-gray-500">
            Попробуйте переформулировать запрос или откройте каталог ниже.
          </p>
        </div>
      )}

      {scope === 'solutions' && !isPending && result?.mode === 'empty' && (
        <p className="text-mp-gray-600 text-sm">Ничего не нашли</p>
      )}

      {/* ── Library scope render (ai.searchLessons + material.listForUser) ── */}
      {scope === 'library' && !isPending && libResult && (
        libResult.lessons.length === 0 && libResult.materials.length === 0 ? (
          <p className="text-mp-gray-600 text-sm">Ничего не нашли</p>
        ) : (
          <div className="space-y-6">
            {libResult.lessons.length > 0 && (
              <section className="space-y-3">
                <h3 className="text-body-sm font-semibold text-mp-gray-700">Уроки</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {libResult.lessons.map((l) => (
                    <LessonResultCard key={l.id} lesson={l} />
                  ))}
                </div>
              </section>
            )}
            {libResult.materials.length > 0 && (
              <section className="space-y-3">
                <h3 className="text-body-sm font-semibold text-mp-gray-700">Материалы</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {libResult.materials.map((m) => (
                    <MaterialCard key={m.id} {...m} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )
      )}
    </div>
  );
}
