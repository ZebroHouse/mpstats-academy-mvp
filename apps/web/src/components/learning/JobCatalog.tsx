'use client';

import { JobCard } from './JobCard';
import type { JobCatalogAxis } from '@mpstats/shared';

const AXIS_COLOR: Record<string, string> = {
  ANALYTICS: 'bg-mp-blue-500', MARKETING: 'bg-mp-green-500', CONTENT: 'bg-pink-500',
  OPERATIONS: 'bg-orange-500', FINANCE: 'bg-amber-500',
};

export type ProgressFilter = 'ALL' | 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

function matchesProgress(completed: number, total: number, f: ProgressFilter): boolean {
  if (f === 'ALL') return true;
  if (f === 'NOT_STARTED') return completed === 0;
  if (f === 'COMPLETED') return total > 0 && completed === total;
  return completed > 0 && completed < total; // IN_PROGRESS
}

export function JobCatalog({ axes, progressFilter }: {
  axes: JobCatalogAxis[];
  progressFilter: ProgressFilter;
}) {
  const filtered = axes
    .map((a) => ({
      ...a,
      jobs: a.jobs.filter((j) => matchesProgress(j.completedLessons, j.lessonCount, progressFilter)),
    }))
    .filter((a) => a.jobs.length > 0);

  if (filtered.length === 0) {
    return <p className="text-body-sm text-mp-gray-500 py-8 text-center">Под фильтр джоб не нашлось.</p>;
  }

  return (
    <div className="space-y-7">
      {filtered.map((axis) => (
        <section key={axis.axis}>
          <div className="flex items-center gap-2 mb-3">
            <span className={`w-1 h-5 rounded ${AXIS_COLOR[axis.axis] ?? 'bg-mp-gray-400'}`} />
            <h2 className="text-heading font-bold text-mp-gray-900">{axis.title}</h2>
            <span className="text-caption text-mp-gray-400 font-semibold">· {axis.jobs.length} джоб</span>
          </div>
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {axis.jobs.map((job) => <JobCard key={job.id} job={job} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
