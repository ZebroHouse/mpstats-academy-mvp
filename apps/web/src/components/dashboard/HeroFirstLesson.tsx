'use client';

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Play } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';

/**
 * Cold-user hero: one big directive card → the mapped first lesson.
 * Renders nothing when the query returns null (returning users / no lesson),
 * so it can sit unconditionally in the dashboard layout.
 *
 * TEMP (UAT): `?hero=navy|gradient|blue` toggles the card treatment for a
 * side-by-side colour pick. Collapses to a single style before prod.
 */
const HERO_BG: Record<string, CSSProperties> = {
  blue: { backgroundColor: '#2C4FF8' },
  navy: { backgroundColor: '#0F172A' },
  gradient: { backgroundImage: 'linear-gradient(120deg, #0F172A 0%, #1E3A8A 55%, #2C4FF8 100%)' },
};

export function HeroFirstLesson() {
  const { data: hero } = trpc.dashboard.getFirstLesson.useQuery();
  const searchParams = useSearchParams();
  const bg = HERO_BG[searchParams.get('hero') ?? 'blue'] ?? HERO_BG.blue;

  if (!hero) return null;

  return (
    <Link
      href={`/learn/${hero.id}`}
      data-tour="dashboard-first-lesson"
      className="group flex items-center justify-between gap-4 rounded-2xl p-5 sm:p-6 text-white transition-all hover:-translate-y-0.5 hover:shadow-lg animate-slide-up"
      style={bg}
    >
      <div className="min-w-0">
        <p className="text-body-sm font-medium text-white/70">Твой первый урок</p>
        <p className="mt-1 truncate text-heading-sm font-bold sm:text-heading-xl">{hero.title}</p>
        {hero.duration > 0 && (
          <p className="mt-1 text-body-sm text-white/70">{hero.duration} мин · начни прямо сейчас</p>
        )}
      </div>
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/20 transition-transform group-hover:scale-105">
        <Play className="h-6 w-6 translate-x-0.5 fill-current" />
      </span>
    </Link>
  );
}
