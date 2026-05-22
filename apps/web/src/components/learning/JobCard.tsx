'use client';

import Link from 'next/link';
import type { JobSummary } from '@mpstats/shared';

function fmtDuration(min: number): string {
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h} ч ${m} мин` : `${h} ч`;
}

export function JobCard({ job }: { job: JobSummary }) {
  const pct = job.lessonCount > 0
    ? Math.round((job.completedLessons / job.lessonCount) * 100)
    : 0;
  const done = pct === 100;

  return (
    <Link
      href={`/learn/job/${job.slug}`}
      className="flex flex-col bg-white border border-mp-gray-200 rounded-xl p-4 shadow-mp-card hover:shadow-mp-card-hover transition-shadow"
    >
      <div className="flex gap-1.5 mb-2 min-h-[18px]">
        {job.marketplace === 'BOTH' && (
          <span className="text-caption font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-700">WB + Ozon</span>
        )}
        {job.isRecommended && (
          <span className="text-caption font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-700">Рекомендовано диагностикой</span>
        )}
      </div>
      <h3 className="text-body font-semibold text-mp-gray-900 leading-snug">{job.title}</h3>
      <p className="text-body-sm text-mp-gray-500 mt-1 flex-1 line-clamp-2">{job.description}</p>
      <div className="text-caption text-mp-gray-400 mt-2.5">
        {job.lessonCount} уроков · ~{fmtDuration(job.totalDurationMin)}
      </div>
      <div className="h-1.5 bg-mp-gray-200 rounded-full mt-2 overflow-hidden">
        <div
          className={done ? 'h-full rounded-full bg-mp-green-500' : 'h-full rounded-full bg-mp-blue-500'}
          style={{ width: `${pct}%` }}
        />
      </div>
    </Link>
  );
}
