'use client';
import { useRef, useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import type { StorefrontShelf } from '@mpstats/shared';
import { JobCard } from './JobCard';
import { LessonCard } from './LessonCard';
import { arrowVisibility, type ArrowState } from './shelf-utils';

export function Shelf({ shelf }: { shelf: StorefrontShelf }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [arrows, setArrows] = useState<ArrowState>({ left: false, right: true });

  const recompute = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setArrows(arrowVisibility(el.scrollLeft, el.scrollWidth, el.clientWidth));
  }, []);

  useEffect(() => { recompute(); }, [recompute, shelf.items.length]);

  const scrollBy = (dir: 1 | -1) => {
    const el = scroller.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  const collectionHref = `/dashboard/collection/${shelf.shelfKey}`;

  return (
    <section className="relative">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-heading font-semibold">{shelf.title}</h2>
        {shelf.totalCount > shelf.items.length && (
          <Link href={collectionHref} className="text-body-sm text-mp-blue-600 hover:underline">
            Смотреть все ({shelf.totalCount}) →
          </Link>
        )}
      </div>
      <div className="relative">
        {arrows.left && (
          <button
            aria-label="Назад"
            onClick={() => scrollBy(-1)}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white shadow-mp-card flex items-center justify-center"
          >
            ‹
          </button>
        )}
        <div
          ref={scroller}
          onScroll={recompute}
          className="flex gap-4 overflow-x-auto scroll-smooth snap-x pb-2 no-scrollbar"
        >
          {shelf.items.map((it) => (
            <div
              key={it.kind === 'job' ? `j-${it.job.id}` : `l-${it.lesson.id}`}
              className="snap-start shrink-0 w-[300px]"
            >
              {it.kind === 'job' ? (
                <JobCard job={it.job} />
              ) : (
                <LessonCard lesson={it.lesson} locked={it.lesson.locked} context="storefront" />
              )}
            </div>
          ))}
          {shelf.totalCount > shelf.items.length && (
            <Link
              href={collectionHref}
              className="snap-start shrink-0 w-[160px] flex items-center justify-center rounded-2xl border-2 border-dashed border-mp-gray-200 text-mp-blue-600 text-body-sm"
            >
              Смотреть все ({shelf.totalCount}) →
            </Link>
          )}
        </div>
        {arrows.right && (
          <button
            aria-label="Вперёд"
            onClick={() => scrollBy(1)}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white shadow-mp-card flex items-center justify-center"
          >
            ›
          </button>
        )}
      </div>
    </section>
  );
}
