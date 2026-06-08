'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { ActivityChart } from '@/components/admin/ActivityChart';
import { ActiveUsersSection } from '@/components/admin/ActiveUsersSection';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const PERIODS = [
  { label: '7d', days: 7 },
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
] as const;

function SummaryStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-bold text-mp-gray-900">{value}</p>
      <p className="text-xs text-mp-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

export default function AnalyticsPage() {
  const [days, setDays] = useState(7);
  const analytics = trpc.admin.analytics.getAnalytics.useQuery({ days });
  const watchStats = trpc.admin.analytics.getWatchStats.useQuery();

  // Calculate summary stats
  const userTotal = analytics.data?.userGrowth.reduce((s, d) => s + d.count, 0) ?? 0;
  const activityTotal = analytics.data?.activity.reduce((s, d) => s + d.count, 0) ?? 0;
  const userAvg = days > 0 ? (userTotal / days).toFixed(1) : '0';
  const activityAvg = days > 0 ? (activityTotal / days).toFixed(1) : '0';
  const userPeak = analytics.data?.userGrowth.reduce((max, d) => Math.max(max, d.count), 0) ?? 0;
  const activityPeak = analytics.data?.activity.reduce((max, d) => Math.max(max, d.count), 0) ?? 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header + Period selector */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-heading-lg font-bold text-mp-gray-900">Analytics</h2>
          <p className="text-body-sm text-mp-gray-500 mt-1">User growth and platform activity</p>
        </div>
        <div className="flex items-center gap-1 bg-mp-gray-100 rounded-lg p-1">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              onClick={() => setDays(p.days)}
              className={cn(
                'px-3 py-1.5 text-body-sm font-medium rounded-md transition-all duration-200',
                days === p.days
                  ? 'bg-white text-mp-blue-600 shadow-sm'
                  : 'text-mp-gray-600 hover:text-mp-gray-900',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Active Users Section (DAU/WAU/MAU) */}
      <div className="space-y-6">
        <div>
          <h3 className="text-heading font-bold text-mp-gray-900">Активные пользователи</h3>
          <p className="text-body-sm text-mp-gray-500 mt-1">
            DAU / WAU / MAU и липкость аудитории
          </p>
        </div>
        <ActiveUsersSection />
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card className="p-4 col-span-1">
          <SummaryStat label="New users" value={userTotal} />
        </Card>
        <Card className="p-4 col-span-1">
          <SummaryStat label="Avg/day" value={userAvg} />
        </Card>
        <Card className="p-4 col-span-1">
          <SummaryStat label="Peak day" value={userPeak} />
        </Card>
        <Card className="p-4 col-span-1">
          <SummaryStat label="Diagnostics" value={activityTotal} />
        </Card>
        <Card className="p-4 col-span-1">
          <SummaryStat label="Avg/day" value={activityAvg} />
        </Card>
        <Card className="p-4 col-span-1">
          <SummaryStat label="Peak day" value={activityPeak} />
        </Card>
      </div>

      {/* Charts */}
      {analytics.isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-5">
            <Skeleton className="h-5 w-32 mb-4" />
            <Skeleton className="h-[250px] w-full" />
          </Card>
          <Card className="p-5">
            <Skeleton className="h-5 w-32 mb-4" />
            <Skeleton className="h-[250px] w-full" />
          </Card>
        </div>
      ) : analytics.error ? (
        <Card className="p-6 text-center">
          <p className="text-red-600 font-medium">Failed to load analytics</p>
          <p className="text-body-sm text-mp-gray-500 mt-1">{analytics.error.message}</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-5">
            <ActivityChart
              data={analytics.data?.userGrowth ?? []}
              title="User Growth"
              color="#2563eb"
            />
          </Card>
          <Card className="p-5">
            <ActivityChart
              data={analytics.data?.activity ?? []}
              title="Diagnostic Activity"
              color="#16a34a"
            />
          </Card>
        </div>
      )}

      {/* Watch Engagement Section */}
      <div className="mt-10 space-y-6">
        <div>
          <h3 className="text-heading font-bold text-mp-gray-900">Вовлечённость в видео</h3>
          <p className="text-body-sm text-mp-gray-500 mt-1">Статистика просмотра видеоуроков</p>
        </div>

        {watchStats.isLoading ? (
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-4">
                <Skeleton className="h-8 w-16 mx-auto mb-2" />
                <Skeleton className="h-4 w-24 mx-auto" />
              </Card>
            ))}
          </div>
        ) : watchStats.error ? (
          <Card className="p-6 text-center">
            <p className="text-red-600 font-medium">Failed to load watch stats</p>
            <p className="text-body-sm text-mp-gray-500 mt-1">{watchStats.error.message}</p>
          </Card>
        ) : watchStats.data ? (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-3 gap-4">
              <Card className="p-4">
                <SummaryStat label="Средний % просмотра" value={`${watchStats.data.avgWatchPercent}%`} />
              </Card>
              <Card className="p-4">
                <SummaryStat label="Всего просмотров" value={watchStats.data.totalWatchSessions} />
              </Card>
              <Card className="p-4">
                <SummaryStat label="Доля завершений" value={`${watchStats.data.completionRate}%`} />
              </Card>
            </div>

            {/* Course engagement table */}
            {watchStats.data.courseEngagement.length > 0 && (
              <Card className="p-5">
                <h4 className="text-body font-semibold text-mp-gray-900 mb-3">По курсам</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-body-sm">
                    <thead>
                      <tr className="border-b border-mp-gray-200">
                        <th className="text-left py-2 pr-4 text-mp-gray-500 font-medium">Курс</th>
                        <th className="text-right py-2 px-4 text-mp-gray-500 font-medium">Средний %</th>
                        <th className="text-right py-2 px-4 text-mp-gray-500 font-medium">Начато</th>
                        <th className="text-right py-2 pl-4 text-mp-gray-500 font-medium">Завершено</th>
                      </tr>
                    </thead>
                    <tbody>
                      {watchStats.data.courseEngagement.map((c) => (
                        <tr key={c.courseId} className="border-b border-mp-gray-100 last:border-0">
                          <td className="py-2 pr-4 text-mp-gray-900">{c.courseTitle}</td>
                          <td className="py-2 px-4 text-right text-mp-gray-700">{c.avgPercent}%</td>
                          <td className="py-2 px-4 text-right text-mp-gray-700">{c.startedCount}</td>
                          <td className="py-2 pl-4 text-right text-mp-gray-700">{c.completedCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Top active users table */}
            {watchStats.data.topActiveUsers.length > 0 && (
              <Card className="p-5">
                <h4 className="text-body font-semibold text-mp-gray-900 mb-3">Топ-5 активных пользователей</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-body-sm">
                    <thead>
                      <tr className="border-b border-mp-gray-200">
                        <th className="text-left py-2 pr-4 text-mp-gray-500 font-medium">Пользователь</th>
                        <th className="text-left py-2 px-4 text-mp-gray-500 font-medium">Email</th>
                        <th className="text-right py-2 px-4 text-mp-gray-500 font-medium">Открыто уроков</th>
                        <th className="text-right py-2 px-4 text-mp-gray-500 font-medium">Завершено</th>
                        <th className="text-right py-2 pl-4 text-mp-gray-500 font-medium">Средний %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {watchStats.data.topActiveUsers.map((u) => (
                        <tr key={u.userId} className="border-b border-mp-gray-100 last:border-0">
                          <td className="py-2 pr-4 text-mp-gray-900">{u.name}</td>
                          <td className="py-2 px-4 text-mp-gray-600">{u.email || '—'}</td>
                          <td className="py-2 px-4 text-right text-mp-gray-700">{u.lessonsWatched}</td>
                          <td className="py-2 px-4 text-right text-mp-gray-700">{u.lessonsCompleted}</td>
                          <td className="py-2 pl-4 text-right text-mp-gray-700">{u.avgPercent}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
