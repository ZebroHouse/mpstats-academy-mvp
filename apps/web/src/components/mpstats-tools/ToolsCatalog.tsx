'use client';

import Link from 'next/link';
import { Wrench, ChevronRight, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc/client';

// ── helpers ──────────────────────────────────────────────────────────────────

function pluralLessons(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return `${n} урок`;
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return `${n} урока`;
  return `${n} уроков`;
}

function formatDuration(min: number): string {
  if (min <= 0) return '';
  return `${min} мин`;
}

// ── component ────────────────────────────────────────────────────────────────

/**
 * Catalog of free «Инструменты MPSTATS» partner lessons.
 *
 * Each `group` from `partner.getCatalog` renders as a tool card:
 * - single-lesson group → the whole card links to /mpstats-tools/<lessonId>
 * - multi-lesson group  → card shows the group title + a list of lesson links
 *
 * `notFound` shows a small non-blocking notice above the grid (deep-link miss).
 */
export function ToolsCatalog({ notFound = false }: { notFound?: boolean }) {
  const { data, isLoading, error } = trpc.partner.getCatalog.useQuery();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-mp-gray-200 rounded-lg w-64 animate-pulse" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-40 bg-mp-gray-200 rounded-xl animate-pulse" />
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

  const groups = data?.groups ?? [];

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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => {
            // ── Single-lesson tool → whole card is a link ──────────────────
            if (group.single) {
              const lesson = group.lessons[0];
              const dur = formatDuration(lesson.duration ?? 0);
              return (
                <Link
                  key={lesson.id}
                  href={`/mpstats-tools/${lesson.id}`}
                  className="group flex flex-col bg-white border border-mp-gray-200 rounded-xl p-5 shadow-mp-card hover:shadow-mp-card-hover transition-shadow"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-md bg-mp-blue-50 text-mp-blue-600 shrink-0">
                      <Wrench className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-body font-semibold text-mp-gray-900 leading-snug line-clamp-2">
                        {group.title}
                      </div>
                      {dur && (
                        <div className="mt-1 flex items-center gap-1 text-body-sm text-mp-gray-500">
                          <Clock className="w-3.5 h-3.5" />
                          {dur}
                        </div>
                      )}
                    </div>
                    <ChevronRight className="w-5 h-5 text-mp-gray-300 group-hover:text-mp-blue-500 transition-colors shrink-0" />
                  </div>
                </Link>
              );
            }

            // ── Multi-lesson tool → card with a list of lesson links ───────
            return (
              <Card key={group.title} className="shadow-mp-card flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-md bg-mp-blue-50 text-mp-blue-600 shrink-0">
                      <Wrench className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-heading leading-snug">{group.title}</CardTitle>
                      <p className="text-body-sm text-mp-gray-500 mt-0.5">
                        {pluralLessons(group.lessons.length)}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <ul className="divide-y divide-mp-gray-100">
                    {group.lessons.map((lesson, idx) => {
                      const dur = formatDuration(lesson.duration ?? 0);
                      return (
                        <li key={lesson.id}>
                          <Link
                            href={`/mpstats-tools/${lesson.id}`}
                            className="group flex items-center gap-2 py-2.5 hover:text-mp-blue-600 transition-colors"
                          >
                            <span className="text-body-sm text-mp-gray-400 tabular-nums shrink-0">
                              {idx + 1}.
                            </span>
                            <span className="text-body-sm font-medium text-mp-gray-800 group-hover:text-mp-blue-600 line-clamp-1 flex-1">
                              {lesson.title}
                            </span>
                            {dur && (
                              <span className="text-caption text-mp-gray-400 shrink-0">{dur}</span>
                            )}
                            <ChevronRight className="w-4 h-4 text-mp-gray-300 group-hover:text-mp-blue-500 transition-colors shrink-0" />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
