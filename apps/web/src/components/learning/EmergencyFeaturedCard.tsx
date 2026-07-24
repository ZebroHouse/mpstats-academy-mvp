'use client';

import Link from 'next/link';

interface Props {
  job: { slug: string; title: string; description: string; lessonCount: number };
}

/** Закреплённая ЧП-карточка над осями каталога решений (spec §C2). */
export function EmergencyFeaturedCard({ job }: Props) {
  return (
    <Link
      href={`/learn/job/${job.slug}`}
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
