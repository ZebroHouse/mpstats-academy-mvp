'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';

interface Props {
  job: { slug: string; title: string; description: string; lessonCount: number };
}

/** Закреплённая ЧП-карточка над осями каталога решений (spec §C2). */
export function EmergencyFeaturedCard({ job }: Props) {
  const track = trpc.job.recordEmergencyEvent.useMutation();
  const impressionFired = useRef(false);
  useEffect(() => {
    if (impressionFired.current) return; // guard от double-invoke (React 18 StrictMode)
    impressionFired.current = true;
    track.mutate({ surface: 'PIN', kind: 'IMPRESSION' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Link
      href={`/learn/job/${job.slug}`}
      onClick={() => track.mutate({ surface: 'PIN', kind: 'CLICK' })}
      className="block rounded-2xl border border-red-300 bg-gradient-to-r from-red-50 to-orange-50 p-5 shadow-mp-card transition-shadow hover:shadow-mp-card-hover"
    >
      <p className="text-body-sm font-semibold uppercase tracking-wide text-red-600">
        🔥 Экстренно · склады WB
      </p>
      <h3 className="mt-1 text-heading text-mp-gray-900">{job.title}</h3>
      <p className="mt-1 text-body-sm text-mp-gray-600 line-clamp-2">{job.description}</p>
      <span className="mt-2 inline-block text-body-sm font-medium text-red-600">
        Открыть разбор ({job.lessonCount}) →
      </span>
    </Link>
  );
}
