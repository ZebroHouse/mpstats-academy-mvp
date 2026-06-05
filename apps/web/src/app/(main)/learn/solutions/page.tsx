'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AgentSearch } from '@/components/learning/AgentSearch';
import { LearningHero } from '@/components/learning/LearningHero';
import { MarketplaceSwitch } from '@/components/learning/MarketplaceSwitch';
import { JobCatalog, type ProgressFilter } from '@/components/learning/JobCatalog';
import { LearningTabs } from '@/components/learning/LearningTabs';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';

const PROGRESS_FILTER_LABELS: Record<ProgressFilter, string> = {
  ALL: 'Все',
  NOT_STARTED: 'Не начато',
  IN_PROGRESS: 'В процессе',
  COMPLETED: 'Завершено',
};

function isDatabaseUnavailable(errorMessage: string): boolean {
  return errorMessage === 'DATABASE_UNAVAILABLE' || errorMessage.includes('DATABASE_UNAVAILABLE');
}

export default function SolutionsPage() {
  const [marketplace, setMarketplace] = useState<'WB' | 'OZON'>('WB');
  const [progressFilter, setProgressFilter] = useState<ProgressFilter>('ALL');

  const { data: jobAxes, isLoading: jobsLoading, error: jobsError } =
    trpc.job.getCatalog.useQuery({ marketplace });

  // ── error card (DB unavailable / generic) ───────────────────────────────────
  if (jobsError && isDatabaseUnavailable(jobsError.message)) {
    return (
      <div className="space-y-6">
        <LearningTabs />
        <div className="max-w-2xl mx-auto">
          <Card className="shadow-mp-card border-red-200">
            <CardContent className="py-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-heading text-mp-gray-900 mb-2">База данных недоступна</h2>
              <p className="text-body text-mp-gray-500">
                Не удалось подключиться к базе данных. Попробуйте обновить страницу через несколько минут.
              </p>
              <Button className="mt-4" onClick={() => window.location.reload()}>
                Обновить страницу
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <LearningTabs />

      {/* Hero search block (D-09) — gradient bg, display headline, large search + chips */}
      <LearningHero
        scope="solutions"
        headline="Решите задачу за минуту"
        subline="Готовые инструкции под конкретную задачу маркетплейса"
      >
        <AgentSearch scope="solutions" size="hero" />
        {/* Filter chips: marketplace switch + progress filter */}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <MarketplaceSwitch value={marketplace} onChange={setMarketplace} />
          <div className="flex gap-2 flex-wrap">
            {(['ALL', 'NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'] as ProgressFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setProgressFilter(f)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-body-sm font-medium transition-colors',
                  progressFilter === f
                    ? 'bg-mp-blue-500 text-white'
                    : 'bg-white/70 border border-mp-gray-200 text-mp-gray-700 hover:bg-white',
                )}
              >
                {PROGRESS_FILTER_LABELS[f]}
              </button>
            ))}
          </div>
        </div>
      </LearningHero>

      {/* Job catalog */}
      <div className="space-y-4">
        {jobsLoading && <div className="h-32 bg-mp-gray-200 rounded-xl animate-pulse" />}
        {jobsError && !isDatabaseUnavailable(jobsError.message) && (
          <p className="text-body-sm text-red-500 py-6 text-center">Не удалось загрузить решения.</p>
        )}
        {!jobsLoading && !jobsError && (
          <JobCatalog axes={jobAxes ?? []} progressFilter={progressFilter} />
        )}
      </div>
    </div>
  );
}
