'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';

interface JobMeta { title: string; lessonCount: number; slug: string }
interface Props { jobsById: Record<string, JobMeta> }

export function AgentSearch({ jobsById }: Props) {
  const [query, setQuery] = useState('');
  const [conversationState, setConversationState] = useState<string | undefined>();
  const [result, setResult] = useState<any>(null);

  const resolveMutation = trpc.intent.resolve.useMutation();
  const addJobMutation = trpc.learning.addJobToTrack.useMutation();

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

  async function addJob(jobId: string) {
    await addJobMutation.mutateAsync({ jobId });
  }

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
        />
        <button type="submit" className="px-4 text-mp-blue-500" disabled={resolveMutation.isPending}>
          {resolveMutation.isPending ? '…' : 'Найти'}
        </button>
      </form>

      {result?.mode === 'clarify' && (
        <div className="rounded-lg border p-4 space-y-2">
          <p className="font-medium">{result.question}</p>
          <div className="flex flex-wrap gap-2">
            {result.options.map((o: any) => (
              <button key={o.label} onClick={() => pickOption(o.intent)} className="px-3 py-1 rounded-full bg-mp-gray-100 hover:bg-mp-gray-200">
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {result?.mode === 'recommend' && (
        <div className="space-y-3">
          <p>{result.answer}</p>
          {result.jobs.map((j: any) => {
            const meta = jobsById[j.jobId];
            const href = meta?.slug ? `/learn/job/${meta.slug}` : undefined;
            return (
              <div key={j.jobId} className="rounded-lg border p-4 flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  {href ? (
                    <a href={href} className="font-medium hover:underline">{meta?.title ?? j.jobId}</a>
                  ) : (
                    <p className="font-medium">{meta?.title ?? j.jobId}</p>
                  )}
                  <p className="text-sm text-mp-gray-600">{j.reason}</p>
                  {meta && <p className="text-xs text-mp-gray-500">{meta.lessonCount} уроков</p>}
                </div>
                <button
                  onClick={() => addJob(j.jobId)}
                  disabled={addJobMutation.isPending}
                  className="px-3 py-2 rounded-md bg-mp-blue-500 text-white text-sm"
                >
                  {j.actions[0]?.label ?? 'В трек'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {result?.mode === 'fallback' && (
        <div className="rounded-lg border p-4">
          <p>{result.answer}</p>
          <ul className="mt-2 space-y-1">
            {result.lessons.map((l: any) => (
              <li key={l.lessonId} className="text-sm">{l.reason}</li>
            ))}
          </ul>
        </div>
      )}

      {result?.mode === 'empty' && (
        <p className="text-mp-gray-600 text-sm">{result.message}</p>
      )}
    </div>
  );
}
