'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';

interface Props {
  job: { slug: string; title: string; lessonCount: number };
}

/**
 * ЧП-баннер витрины. Занимает слот HeroFirstLesson (вариант B — замещение).
 * Виден всем юзерам, снимается только kill-switch'ем (EMERGENCY_BANNER_ENABLED).
 */
export function EmergencyBanner({ job }: Props) {
  const track = trpc.job.recordEmergencyEvent.useMutation();
  const impressionFired = useRef(false);
  useEffect(() => {
    if (impressionFired.current) return; // guard от double-invoke (React 18 StrictMode)
    impressionFired.current = true;
    track.mutate({ surface: 'BANNER', kind: 'IMPRESSION' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Link
      href={`/learn/job/${job.slug}`}
      onClick={() => track.mutate({ surface: 'BANNER', kind: 'CLICK' })}
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
