'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, Play, Wrench } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LogoIcon } from '@/components/shared/Logo';
import { trpc } from '@/lib/trpc/client';

// ── helpers ──────────────────────────────────────────────────────────────────

function pluralLessons(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return `${n} урок`;
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return `${n} урока`;
  return `${n} уроков`;
}

type CatalogLesson = { id: string; title: string; order: number; duration: number | null };
type CatalogGroup = { title: string; lessons: CatalogLesson[]; single: boolean };

function groupMeta(group: CatalogGroup): string {
  const totalMin = group.lessons.reduce((sum, l) => sum + (l.duration ?? 0), 0);
  const lessons = pluralLessons(group.lessons.length);
  return totalMin > 0 ? `${lessons} · ~${totalMin} мин` : lessons;
}

// ── component ────────────────────────────────────────────────────────────────

/**
 * Catalog of free «Инструменты MPSTATS» partner lessons.
 *
 * Uniform compact tool cards in a grid:
 * - single-lesson tool → the whole card links straight to the player
 * - multi-lesson tool  → card toggles an inline accordion listing its lessons
 *
 * `notFound` shows a small non-blocking notice above the grid (deep-link miss).
 */
export function ToolsCatalog({ notFound = false }: { notFound?: boolean }) {
  const { data, isLoading, error } = trpc.partner.getCatalog.useQuery();
  const [open, setOpen] = useState<Record<string, boolean>>({});

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-mp-gray-200 rounded-lg w-64 animate-pulse" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-24 bg-mp-gray-200 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card className="shadow-mp-card border-red-200">
          <CardContent className="py-12 text-center">
            <h2 className="text-heading text-mp-gray-900 mb-2">Ошибка загрузки</h2>
            <p className="text-body text-mp-gray-500">
              Не удалось загрузить каталог инструментов. Попробуйте обновить страницу.
            </p>
            <Button className="mt-4" onClick={() => window.location.reload()}>
              Обновить страницу
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const groups = (data?.groups ?? []) as CatalogGroup[];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="animate-slide-up">
        <h1 className="text-display-sm text-mp-gray-900">Инструменты MPSTATS</h1>
        <p className="text-body text-mp-gray-500 mt-1">
          Бесплатные обучающие материалы по сервисам MPSTATS — открыты всем.
        </p>
      </div>

      {/* ── Deep-link miss notice (non-blocking) ────────────────────────── */}
      {notFound && (
        <div
          role="status"
          className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-body-sm text-yellow-800"
        >
          Урок не найден — вот весь каталог.
        </div>
      )}

      {/* ── Catalog grid ────────────────────────────────────────────────── */}
      {groups.length === 0 ? (
        <Card className="shadow-mp-card border-mp-gray-200">
          <CardContent className="py-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-mp-gray-100 flex items-center justify-center mx-auto mb-4">
              <Wrench className="w-7 h-7 text-mp-gray-300" />
            </div>
            <h2 className="text-heading-lg text-mp-gray-900 mb-2">Инструментов пока нет</h2>
            <p className="text-body text-mp-gray-600 max-w-md mx-auto">
              Материалы скоро появятся. Загляните чуть позже.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 items-start">
          {groups.map((group) => {
            // ── Single-lesson tool → whole card links to the player ────────
            if (group.single) {
              const lesson = group.lessons[0];
              return (
                <Link
                  key={group.title}
                  href={`/mpstats-tools/${lesson.id}`}
                  className="group flex items-center gap-3 bg-white border border-mp-gray-200 rounded-xl p-4 shadow-mp-card hover:shadow-mp-card-hover transition-shadow"
                >
                  <LogoIcon size={20} primaryColor="#17BF50" className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-body font-semibold text-mp-gray-900 leading-snug line-clamp-2">
                      {group.title}
                    </div>
                    <div className="text-caption text-mp-gray-400 mt-0.5">{groupMeta(group)}</div>
                  </div>
                  <Play className="w-4 h-4 text-mp-gray-400 group-hover:text-mp-blue-500 shrink-0" />
                </Link>
              );
            }

            // ── Multi-lesson tool → inline accordion ───────────────────────
            const isOpen = !!open[group.title];
            return (
              <div
                key={group.title}
                className="bg-white border border-mp-gray-200 rounded-xl shadow-mp-card overflow-hidden"
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen((s) => ({ ...s, [group.title]: !s[group.title] }))}
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-mp-gray-50 transition-colors"
                >
                  <LogoIcon size={20} primaryColor="#17BF50" className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-body font-semibold text-mp-gray-900 leading-snug line-clamp-2">
                      {group.title}
                    </div>
                    <div className="text-caption text-mp-gray-400 mt-0.5">{groupMeta(group)}</div>
                  </div>
                  <ChevronDown
                    className={`w-5 h-5 text-mp-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {isOpen && (
                  <ul className="border-t border-mp-gray-100">
                    {group.lessons.map((lesson, i) => (
                      <li key={lesson.id}>
                        <Link
                          href={`/mpstats-tools/${lesson.id}`}
                          className="group flex items-center gap-3 px-4 py-2.5 hover:bg-mp-gray-50 transition-colors"
                        >
                          <span className="text-caption text-mp-gray-400 w-5 text-right shrink-0">
                            {i + 1}
                          </span>
                          <span className="text-body-sm text-mp-gray-700 flex-1 line-clamp-1 group-hover:text-mp-gray-900">
                            {lesson.title}
                          </span>
                          <ChevronRight className="w-4 h-4 text-mp-gray-300 group-hover:text-mp-blue-500 shrink-0" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
