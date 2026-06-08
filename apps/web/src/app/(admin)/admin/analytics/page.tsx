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

export default function AnalyticsOverviewPage() {
  const [days, setDays] = useState(7);
  const analytics = trpc.admin.analytics.getAnalytics.useQuery({ days });

  const userTotal = analytics.data?.userGrowth.reduce((s, d) => s + d.count, 0) ?? 0;
  const activityTotal = analytics.data?.activity.reduce((s, d) => s + d.count, 0) ?? 0;
  const userAvg = days > 0 ? (userTotal / days).toFixed(1) : '0';
  const activityAvg = days > 0 ? (activityTotal / days).toFixed(1) : '0';
  const userPeak = analytics.data?.userGrowth.reduce((max, d) => Math.max(max, d.count), 0) ?? 0;
  const activityPeak = analytics.data?.activity.reduce((max, d) => Math.max(max, d.count), 0) ?? 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Growth header + its OWN period selector */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-heading-lg font-bold text-mp-gray-900">Обзор</h2>
          <p className="text-body-sm text-mp-gray-500 mt-1">Рост пользователей и активность</p>
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

      {/* Summary stats — controlled by the selector directly above */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card className="p-4"><SummaryStat label="New users" value={userTotal} /></Card>
        <Card className="p-4"><SummaryStat label="Avg/day" value={userAvg} /></Card>
        <Card className="p-4"><SummaryStat label="Peak day" value={userPeak} /></Card>
        <Card className="p-4"><SummaryStat label="Diagnostics" value={activityTotal} /></Card>
        <Card className="p-4"><SummaryStat label="Avg/day" value={activityAvg} /></Card>
        <Card className="p-4"><SummaryStat label="Peak day" value={activityPeak} /></Card>
      </div>

      {/* Growth charts */}
      {analytics.isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-5"><Skeleton className="h-5 w-32 mb-4" /><Skeleton className="h-[250px] w-full" /></Card>
          <Card className="p-5"><Skeleton className="h-5 w-32 mb-4" /><Skeleton className="h-[250px] w-full" /></Card>
        </div>
      ) : analytics.error ? (
        <Card className="p-6 text-center">
          <p className="text-red-600 font-medium">Failed to load analytics</p>
          <p className="text-body-sm text-mp-gray-500 mt-1">{analytics.error.message}</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-5">
            <ActivityChart data={analytics.data?.userGrowth ?? []} title="User Growth" color="#2563eb" />
          </Card>
          <Card className="p-5">
            <ActivityChart data={analytics.data?.activity ?? []} title="Diagnostic Activity" color="#16a34a" />
          </Card>
        </div>
      )}

      {/* Active users — DAU/WAU/MAU with its own internal selector */}
      <div className="space-y-6 pt-4">
        <div>
          <h3 className="text-heading font-bold text-mp-gray-900">Активные пользователи</h3>
          <p className="text-body-sm text-mp-gray-500 mt-1">DAU / WAU / MAU и липкость аудитории</p>
        </div>
        <ActiveUsersSection />
      </div>
    </div>
  );
}
