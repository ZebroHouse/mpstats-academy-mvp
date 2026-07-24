'use client';

import Link from 'next/link';

interface Props {
  job: { slug: string; title: string; lessonCount: number };
}

/**
 * ЧП-баннер витрины. Занимает слот HeroFirstLesson (вариант B — замещение).
 * Виден всем юзерам, снимается только kill-switch'ем (EMERGENCY_BANNER_ENABLED).
 */
export function EmergencyBanner({ job }: Props) {
  return (
    <Link
      href={`/learn/job/${job.slug}`}
      className="block rounded-2xl border border-red-300 bg-gradient-to-r from-red-50 to-orange-50 p-5 shadow-mp-card transition-shadow hover:shadow-mp-card-hover"
    >
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-100 text-2xl">
          🔥
        </div>
        <div className="min-w-0">
          <p className="text-body-sm font-semibold uppercase tracking-wide text-red-600">
            Экстренно · склады WB
          </p>
          <h3 className="mt-0.5 text-heading text-mp-gray-900">{job.title}</h3>
          <p className="mt-1 text-body-sm text-mp-gray-600">
            Как защитить товар и деньги, посчитать убыток и получить компенсацию — разбор из {job.lessonCount} материалов.
          </p>
        </div>
      </div>
    </Link>
  );
}
