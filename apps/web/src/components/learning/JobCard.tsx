'use client';

import Link from 'next/link';
import { Layers } from 'lucide-react';
import type { JobSummary } from '@mpstats/shared';
import { FavoriteButton } from './FavoriteButton';
import { deriveBadgePills, BADGE_TONE_CLASS } from './badge-utils';

function fmtDuration(min: number): string {
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h} ч ${m} мин` : `${h} ч`;
}

export function JobCard({
  job,
  onAddToTrack,
  isAddPending,
  initialFavorited,
}: {
  job: JobSummary;
  onAddToTrack?: (jobId: string) => void;
  isAddPending?: boolean;
  initialFavorited?: boolean;
}) {
  const pct = job.lessonCount > 0
    ? Math.round((job.completedLessons / job.lessonCount) * 100)
    : 0;
  const done = pct === 100;
  const badgePills = deriveBadgePills(job.badges);

  return (
    <Link
      href={`/learn/job/${job.slug}`}
      className="flex flex-col bg-[#f5f6ff] border border-mp-gray-200 border-l-4 border-l-[#4338ca] rounded-xl py-4 pr-4 pl-5 shadow-mp-card hover:shadow-mp-card-hover transition-shadow"
    >
      {/* Top row: type pill (left) + editorial badges (right) — never collapses */}
      <div className="flex items-center justify-between gap-1.5 mb-2 min-h-[22px]">
        <span className="inline-flex items-center gap-1 text-[11px] font-bold rounded-full px-2.5 py-0.5 bg-[#eef0ff] text-[#4338ca]">
          <Layers className="w-3 h-3" />
          Задача
        </span>
        <div className="flex gap-1.5">
          {badgePills.map((p) => (
            <span key={p.key} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${BADGE_TONE_CLASS[p.tone]}`}>{p.label}</span>
          ))}
        </div>
      </div>
      <div className="flex items-start gap-1">
        <h3 className="text-body font-semibold text-mp-gray-900 leading-snug flex-1">{job.title}</h3>
        <FavoriteButton itemType="JOB" itemId={job.id} initialFavorited={initialFavorited} className="-mt-2 -mr-2 shrink-0" />
      </div>
      <p className="text-body-sm text-mp-gray-500 mt-1 flex-1 line-clamp-2">{job.description}</p>
      <div className="text-caption text-mp-gray-400 mt-2.5">
        {job.lessonCount} уроков · ~{fmtDuration(job.totalDurationMin)}
        {job.marketplace === 'BOTH' && ' · WB + Ozon'}
      </div>
      {job.isRecommended && !job.isInTrack && (
        <div className="mt-2">
          <span className="text-caption font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-700">Рекомендовано диагностикой</span>
        </div>
      )}
      <div className="h-1.5 bg-mp-gray-200 rounded-full mt-2 overflow-hidden">
        <div
          className={done ? 'h-full rounded-full bg-mp-green-500' : 'h-full rounded-full bg-mp-blue-500'}
          style={{ width: `${pct}%` }}
        />
      </div>
      {onAddToTrack && !job.isInTrack && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onAddToTrack(job.id);
          }}
          disabled={isAddPending}
          className="mt-3 h-9 rounded-lg bg-mp-blue-500 text-white text-body-sm font-medium hover:bg-mp-blue-600 transition-colors disabled:opacity-50"
        >
          {isAddPending ? 'Добавляем…' : '+ В план'}
        </button>
      )}
    </Link>
  );
}
