'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { IntentResult } from '@mpstats/ai';
import { trpc } from '@/lib/trpc/client';

export function AgentSearch() {
  const [query, setQuery] = useState('');
  const [conversationState, setConversationState] = useState<string | undefined>();
  const [result, setResult] = useState<IntentResult | null>(null);

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
      toast.success('Плейбук в треке');
      utils.learning.getRecommendedPath.invalidate();
      utils.job.getCatalog.invalidate();
    },
    onError: (e) => {
      toast.error(e.message || 'Не удалось добавить');
    },
  });

  async function submit(q: string) {
    if (!q.trim()) return;
    const res = await resolveMutation.mutateAsync({ query: q.trim(), surface: 'learn', conversationState });
    setResult(res);
    setConversationState(res.mode === 'clarify' ? res.conversationState : undefined);
  }

  async function pickOption(intent: string) {
    setQuery(intent);
    await submit(intent);
  }

  const isPending = resolveMutation.isPending;

  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => { e.preventDefault(); submit(query); }}
        className="flex items-center h-12 border border-mp-gray-200 rounded-lg bg-white"
      >
        <input
          className="flex-1 h-full bg-transparent px-4 placeholder:text-mp-gray-400 focus:outline-none"
          placeholder="Напишите тему, которая вас интересует"
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
          Ищем лучший ответ среди плейбуков…
        </div>
      )}

      {!isPending && result?.mode === 'clarify' && (
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

      {!isPending && result?.mode === 'recommend' && (
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
                  {isAdded ? 'В треке ✓' : (j.actions[0]?.label ?? 'В трек')}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {!isPending && result?.mode === 'fallback' && (
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
            Точного плейбука не нашли. Попробуй переформулировать запрос или открой каталог ниже.
          </p>
        </div>
      )}

      {!isPending && result?.mode === 'empty' && (
        <p className="text-mp-gray-600 text-sm">{result.message}</p>
      )}
    </div>
  );
}
