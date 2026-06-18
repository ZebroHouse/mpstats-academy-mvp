'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { IntentResult } from '@mpstats/ai';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';
import { LessonResultCard, type LessonResultCardData } from './LessonResultCard';
import { MaterialCard, type MaterialCardProps } from './MaterialCard';
import { FavoriteButton } from './FavoriteButton';

type Scope = 'solutions' | 'library';

const PLACEHOLDER: Record<Scope, string> = {
  solutions: 'Опишите задачу — подберём решение',
  library: 'Найдите урок или материал по теме',
};

type LibraryResult = {
  lessons: LessonResultCardData[];
  materials: MaterialCardProps[];
};

export function AgentSearch({ scope, size = 'default' }: { scope: Scope; size?: 'default' | 'hero' }) {
  const isHero = size === 'hero';
  const [query, setQuery] = useState('');
  const [conversationState, setConversationState] = useState<string | undefined>();
  const [result, setResult] = useState<IntentResult | null>(null);
  const [libResult, setLibResult] = useState<LibraryResult | null>(null);
  const [pending, setPending] = useState(false);

  const utils = trpc.useUtils();
  const resolveMutation = trpc.intent.resolve.useMutation();

  // Seed «сердечка» для recommend-задач: один batch-запрос по jobId результата.
  const recommendJobIds = useMemo(
    () => (result?.mode === 'recommend' ? result.jobs.map((j) => j.jobId) : []),
    [result],
  );
  const { data: favData } = trpc.favorite.isFavorited.useQuery(
    { items: recommendJobIds.map((itemId) => ({ itemType: 'JOB' as const, itemId })) },
    { enabled: recommendJobIds.length > 0 },
  );
  const favoritedSet = useMemo(
    () => new Set(favData?.favorited ?? []),
    [favData],
  );

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
      isPartner: r.isPartner,
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
    <div className="space-y-3 text-mp-gray-900">
      <form
        onSubmit={(e) => { e.preventDefault(); submit(query); }}
        className={cn(
          'flex items-center bg-white',
          isHero
            // Opaque white outline on focus — a translucent white over the navy
            // island blends to a cool blue-grey (reads as "blue"), so use solid white.
            ? 'h-14 rounded-2xl border border-mp-gray-200 shadow-mp-card pr-1.5 transition-all focus-within:border-white focus-within:ring-2 focus-within:ring-white'
            : 'h-12 rounded-lg border border-mp-gray-200 transition-all focus-within:ring-2 focus-within:ring-mp-blue-500/20',
        )}
      >
        <input
          // data-no-ring suppresses the global *:focus-visible blue ring
          // (globals.css) — the form's focus-within white ring is the indicator.
          data-no-ring
          className={cn(
            'flex-1 h-full bg-transparent px-4 text-mp-gray-900 placeholder:text-mp-gray-400 focus:outline-none',
            isHero && 'text-body',
          )}
          placeholder={PLACEHOLDER[scope]}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={isPending}
        />
        <button
          type="submit"
          className={cn(
            'disabled:opacity-50',
            isHero
              ? 'h-11 px-5 rounded-lg bg-mp-blue-500 text-white text-body-sm font-semibold disabled:bg-mp-gray-300'
              : 'px-4 text-mp-blue-500',
          )}
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
        <div className="rounded-xl border border-mp-gray-200 bg-white p-4 space-y-3">
          <p className="font-medium">{result.question}</p>
          <div className="flex flex-wrap gap-2">
            {result.options.map((o) => (
              <button
                key={o.label}
                onClick={() => pickOption(o.intent)}
                className="px-3 py-1.5 rounded-full bg-mp-gray-100 hover:bg-mp-gray-200 text-mp-gray-700 text-sm"
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {scope === 'solutions' && !isPending && result?.mode === 'recommend' && (
        <div className="space-y-3 rounded-xl border border-mp-gray-200 bg-white p-4">
          <p className="text-mp-gray-800">{result.answer}</p>
          {result.jobs.map((j) => (
            <div key={j.jobId} className="rounded-lg border p-4 flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <a href={`/learn/job/${j.slug}`} className="font-medium hover:underline">
                  {j.title}
                </a>
                <p className="text-sm text-mp-gray-600 mt-1">{j.reason}</p>
                <p className="text-xs text-mp-gray-500 mt-1">{j.lessonCount} уроков</p>
              </div>
              <FavoriteButton
                itemType="JOB"
                itemId={j.jobId}
                initialFavorited={favoritedSet.has(`JOB:${j.jobId}`)}
                className="-mt-2 -mr-2 shrink-0"
              />
            </div>
          ))}
        </div>
      )}

      {scope === 'solutions' && !isPending && result?.mode === 'fallback' && (
        <div className="rounded-xl border border-mp-gray-200 bg-white p-4 space-y-2">
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
        <p className="text-white/70 text-sm">Ничего не нашли</p>
      )}

      {/* ── Library scope render (ai.searchLessons + material.listForUser) ── */}
      {scope === 'library' && !isPending && libResult && (
        libResult.lessons.length === 0 && libResult.materials.length === 0 ? (
          <p className="text-white/70 text-sm">Ничего не нашли</p>
        ) : (
          <div className="space-y-6">
            {libResult.lessons.length > 0 && (
              <section className="space-y-3">
                <h3 className="text-body-sm font-semibold text-white/80">Уроки</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {libResult.lessons.map((l) => (
                    <LessonResultCard key={l.id} lesson={l} />
                  ))}
                </div>
              </section>
            )}
            {libResult.materials.length > 0 && (
              <section className="space-y-3">
                <h3 className="text-body-sm font-semibold text-white/80">Материалы</h3>
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
