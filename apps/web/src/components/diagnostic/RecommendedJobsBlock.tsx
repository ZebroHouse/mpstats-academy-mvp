'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { JobCard } from '@/components/learning/JobCard';
import { trpc } from '@/lib/trpc/client';
import type { RecommendedJob } from '@mpstats/shared';

const RANK_LABEL: Record<1 | 2 | 3, string> = { 1: '1', 2: '2', 3: '3' };

export function RecommendedJobsBlock({ jobs }: { jobs: RecommendedJob[] }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const recommendedPath = trpc.learning.getRecommendedPath.useQuery();
  const addJobMutation = trpc.learning.addJobToTrack.useMutation();
  const [bulkPending, setBulkPending] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const trackedJobIds = useMemo(() => {
    const added = (recommendedPath.data as { addedJobs?: Array<{ id: string }> } | undefined)?.addedJobs;
    return new Set((added ?? []).map((pb) => pb.id));
  }, [recommendedPath.data]);

  function derivedIsInTrack(jobId: string, fallback: boolean): boolean {
    if (recommendedPath.data) return trackedJobIds.has(jobId);
    return fallback;
  }

  if (!jobs || jobs.length === 0) return null;

  const notInTrack = jobs.filter((j) => !derivedIsInTrack(j.id, j.isInTrack));
  const allInTrack = notInTrack.length === 0;

  async function handleSingleAdd(jobId: string) {
    setPendingId(jobId);
    try {
      await addJobMutation.mutateAsync({ jobId });
      await utils.learning.getRecommendedPath.invalidate();
      await utils.job.getCatalog.invalidate();
      toast.success('Решение в плане');
    } catch (e: any) {
      toast.error(e?.message || 'Не удалось добавить');
    } finally {
      setPendingId(null);
    }
  }

  async function handleBulkAdd() {
    if (notInTrack.length === 0) return;
    setBulkPending(true);
    let added = 0;
    try {
      for (const job of notInTrack) {
        await addJobMutation.mutateAsync({ jobId: job.id });
        added += 1;
      }
      await utils.learning.getRecommendedPath.invalidate();
      await utils.job.getCatalog.invalidate();
      toast.success(`Добавлено в план: ${added}`);
      router.push('/learn/plan');
    } catch (e: any) {
      toast.error(e?.message || 'Не удалось добавить все');
    } finally {
      setBulkPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-heading text-mp-gray-900">Рекомендованные задачи</h2>
          <p className="text-body-sm text-mp-gray-500 mt-1">
            Начни с задачи №1 — она закрывает самые слабые зоны
          </p>
        </div>
        {!allInTrack && (
          <button
            type="button"
            onClick={handleBulkAdd}
            disabled={bulkPending}
            className="h-11 px-5 rounded-lg bg-mp-blue-500 text-white text-body font-semibold hover:bg-mp-blue-600 transition-colors disabled:opacity-50"
          >
            {bulkPending ? 'Добавляем…' : `Добавить все ${notInTrack.length} в план`}
          </button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {jobs.map((job) => {
          const isInTrack = derivedIsInTrack(job.id, job.isInTrack);
          return (
            <div key={job.id} className="relative">
              <div
                aria-hidden
                className="absolute -top-2 -left-2 z-10 w-8 h-8 rounded-full bg-mp-blue-500 text-white text-body font-bold flex items-center justify-center shadow-mp-md"
              >
                {RANK_LABEL[job.rank]}
              </div>
              <JobCard
                job={{ ...job, isInTrack }}
                onAddToTrack={handleSingleAdd}
                isAddPending={pendingId === job.id || bulkPending}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
