'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SkillRadarChart } from '@/components/charts/RadarChart';
import { trpc } from '@/lib/trpc/client';
import type { SkillProfile } from '@mpstats/shared';

const SKILL_ROWS: Array<{
  key: keyof SkillProfile;
  label: string;
}> = [
  { key: 'analytics', label: 'Аналитика' },
  { key: 'marketing', label: 'Маркетинг' },
  { key: 'content', label: 'Контент' },
  { key: 'operations', label: 'Операции' },
  { key: 'finance', label: 'Финансы' },
];

function levelLabel(score: number): { label: string; color: string } {
  if (score >= 80) return { label: 'Эксперт', color: 'text-mp-green-600 bg-mp-green-50' };
  if (score >= 60) return { label: 'Уверенный', color: 'text-mp-blue-600 bg-mp-blue-50' };
  if (score >= 40) return { label: 'Базовый', color: 'text-yellow-700 bg-yellow-50' };
  return { label: 'Начальный', color: 'text-orange-700 bg-orange-50' };
}

function barColor(score: number): string {
  if (score >= 80) return 'bg-mp-green-500';
  if (score >= 60) return 'bg-mp-blue-500';
  if (score >= 40) return 'bg-yellow-500';
  return 'bg-orange-500';
}

interface Props {
  skillProfile: SkillProfile;
  onRetake: () => void;
  isRetaking: boolean;
}

export function DiagnosticSummary({ skillProfile, onRetake, isRetaking }: Props) {
  const { data: recommendedPath } = trpc.learning.getRecommendedPath.useQuery();

  // Top-3 lessons to "подтянуть". v3 sections are axis-based and already sorted
  // weakest-first — take the first section that has any lessons (error lessons first).
  const weakLessons = (() => {
    if (!recommendedPath || !('isAxis' in recommendedPath) || !recommendedPath.isAxis) return null;
    for (const section of recommendedPath.sections) {
      const items = [...(section.errorLessons ?? []), ...section.lessons];
      if (items.length > 0) {
        return { sectionTitle: section.label, items: items.slice(0, 3) };
      }
    }
    return null;
  })();

  const overall = Math.round(
    SKILL_ROWS.reduce((sum, r) => sum + skillProfile[r.key], 0) / SKILL_ROWS.length,
  );
  const overallLevel = levelLabel(overall);

  return (
    <Card className="shadow-mp-card animate-fade-in">
      <CardContent className="p-6 sm:p-8">
        <div className="flex items-start justify-between flex-wrap gap-3 mb-6">
          <div>
            <Badge variant="analytics" className="mb-2">Ваш текущий уровень</Badge>
            <h2 className="text-heading-xl text-mp-gray-900">Результаты диагностики</h2>
            <p className="text-body-sm text-mp-gray-500 mt-1">
              Общий уровень: <span className={`inline-block px-2 py-0.5 rounded font-medium ${overallLevel.color}`}>{overallLevel.label}</span>
              <span className="ml-2 text-mp-gray-400">{overall}%</span>
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link href="/learn">
              <Button variant="outline" size="sm">Открыть план обучения</Button>
            </Link>
            <Button onClick={onRetake} disabled={isRetaking} size="sm">
              {isRetaking ? 'Запуск...' : 'Перепройти'}
            </Button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6 items-center">
          {/* Radar */}
          <div className="min-w-0">
            <SkillRadarChart data={skillProfile} showLabels={false} />
          </div>

          {/* Axes list */}
          <div className="space-y-3">
            {SKILL_ROWS.map((row) => {
              const score = skillProfile[row.key];
              const lvl = levelLabel(score);
              return (
                <div key={row.key}>
                  <div className="flex items-center justify-between text-body-sm mb-1">
                    <span className="font-medium text-mp-gray-700">{row.label}</span>
                    <span className="flex items-center gap-2">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-caption font-medium ${lvl.color}`}>
                        {lvl.label}
                      </span>
                      <span className="font-semibold text-mp-gray-900 tabular-nums">{score}%</span>
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-mp-gray-100 overflow-hidden">
                    <div
                      className={`h-full ${barColor(score)} transition-all`}
                      style={{ width: `${Math.max(score, 2)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Weakest blocks — top-3 lessons */}
        {weakLessons && weakLessons.items.length > 0 && (
          <div className="mt-8 pt-6 border-t border-mp-gray-100">
            <h3 className="text-heading text-mp-gray-900 mb-1">Где подтянуть</h3>
            <p className="text-body-sm text-mp-gray-500 mb-4">
              Уроки из вашего плана обучения по самым слабым темам
            </p>
            <div className="grid sm:grid-cols-3 gap-3">
              {weakLessons.items.map((lesson: { id: string; title: string; courseName: string; duration: number; locked?: boolean }) => (
                <Link
                  key={lesson.id}
                  href={`/learn/${lesson.id}`}
                  className="block p-4 rounded-lg border border-mp-gray-200 hover:border-mp-blue-300 hover:bg-mp-blue-50/30 transition-colors group"
                >
                  <p className="text-body-sm font-medium text-mp-gray-900 line-clamp-2 group-hover:text-mp-blue-700">
                    {lesson.title}
                  </p>
                  <p className="text-caption text-mp-gray-500 mt-1.5 line-clamp-1">
                    {lesson.courseName}
                  </p>
                  {lesson.duration > 0 && (
                    <p className="text-caption text-mp-gray-400 mt-1">{lesson.duration} мин</p>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
