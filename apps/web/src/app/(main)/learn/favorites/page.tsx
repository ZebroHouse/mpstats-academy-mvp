'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FileText, GraduationCap, Wrench } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LearningTabs } from '@/components/learning/LearningTabs';
import { FavoriteButton } from '@/components/learning/FavoriteButton';
import { DarkIsland, DarkIslandStat } from '@/components/ui/dark-island';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@mpstats/api';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';

/**
 * «Избранное» page (61-07, D-03).
 *
 * Lists saved items via `favorite.list` with a type-filter chip row
 * (Все / Уроки / Решения / Материалы). The «custom»-section lessons и добавленные
 * решения, мигрированные из трека (migrate-track-to-favorites), живут именно тут —
 * «Персональный план» остаётся чисто диагностическим.
 *
 * Cards are purpose-built for the resolved `favorite.list` shape ({id,title,...})
 * with an inline un-favorite heart. Empty state «В избранном пусто» retained.
 */

type FavoriteListData = inferRouterOutputs<AppRouter>['favorite']['list'];
type FavItem = FavoriteListData['items'][number];

type FilterKey = 'ALL' | 'LESSON' | 'JOB' | 'MATERIAL';

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'ALL', label: 'Все' },
  { key: 'LESSON', label: 'Уроки' },
  { key: 'JOB', label: 'Решения' },
  { key: 'MATERIAL', label: 'Материалы' },
];

export default function FavoritesPage() {
  const [filter, setFilter] = useState<FilterKey>('ALL');

  const { data, isLoading } = trpc.favorite.list.useQuery(
    filter === 'ALL' ? undefined : { itemType: filter },
  );

  const items: FavItem[] = (data as FavoriteListData | undefined)?.items ?? [];

  return (
    <div className="space-y-6 animate-fade-in">
      <LearningTabs />

      <DarkIsland
        className="animate-slide-up"
        title="Избранное"
        subtitle="Сохранённые уроки, решения и материалы"
        aside={
          items.length > 0 ? (
            <DarkIslandStat value={items.length} label="в избранном" />
          ) : undefined
        }
      />

      {/* ── Type-filter chip row ─────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={cn(
              'px-3.5 h-9 rounded-lg text-body-sm font-medium transition-colors',
              filter === f.key
                ? 'bg-mp-blue-500 text-white'
                : 'bg-mp-gray-100 text-mp-gray-600 hover:bg-mp-gray-200',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Loading ──────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-mp-gray-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        /* ── Empty state ──────────────────────────────────────────────── */
        <Card className="shadow-mp-card border-mp-gray-200">
          <CardContent className="py-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-mp-gray-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-mp-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <h2 className="text-heading-lg text-mp-gray-900 mb-2">В избранном пусто</h2>
            <p className="text-body text-mp-gray-600 mb-6 max-w-md mx-auto">
              Нажимайте на сердечко у уроков, решений и материалов — они появятся здесь.
            </p>
            <Link href="/learn/library">
              <Button variant="outline" size="lg">Перейти в Базу знаний</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        /* ── Listing ──────────────────────────────────────────────────── */
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <FavoriteRow key={`${item.itemType}:${item.itemId}`} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── A single resolved-favorite card ─────────────────────────────────────────

function FavoriteRow({ item }: { item: FavItem }) {
  const { href, label, title, Icon } = describe(item);

  return (
    <div className="relative flex items-start gap-2 bg-white border border-mp-gray-200 rounded-xl p-4 shadow-mp-card hover:shadow-mp-card-hover transition-shadow">
      <Link href={href} className="flex items-start gap-3 flex-1 min-w-0">
        <div className="p-2 rounded-md bg-mp-gray-50 text-mp-gray-500 shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-mp-gray-500 mb-0.5">{label}</div>
          <div className="text-body font-semibold text-mp-gray-900 leading-snug line-clamp-2">
            {title}
          </div>
        </div>
      </Link>
      <FavoriteButton
        itemType={item.itemType}
        itemId={item.itemId}
        initialFavorited
        className="-mt-2 -mr-2 shrink-0"
      />
    </div>
  );
}

function describe(item: FavItem): {
  href: string;
  label: string;
  title: string;
  Icon: typeof FileText;
} {
  if (item.itemType === 'LESSON') {
    return { href: `/learn/${item.itemId}`, label: 'Урок', title: item.entity.title, Icon: GraduationCap };
  }
  if (item.itemType === 'JOB') {
    return { href: `/learn/job/${item.entity.slug}`, label: 'Решение', title: item.entity.title, Icon: Wrench };
  }
  return { href: '/learn/library', label: 'Материал', title: item.entity.title, Icon: FileText };
}
