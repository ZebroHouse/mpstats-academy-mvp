'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { ActivityChart } from '@/components/admin/ActivityChart';
import { ActiveUsersSection } from '@/components/admin/ActiveUsersSection';
import { AnalyticsDateRange, presetRange, rangeToBounds, daySpan } from '@/components/admin/AnalyticsDateRange';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

function SummaryStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-bold text-mp-gray-900">{value}</p>
      <p className="text-xs text-mp-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

export default function AnalyticsOverviewPage() {
  const [range, setRange] = useState(presetRange(7));
  const { from, to } = rangeToBounds(range);
  const analytics = trpc.admin.analytics.getAnalytics.useQuery({ from, to });
  const offerDuplicates = trpc.admin.analytics.getOfferDuplicates.useQuery();

  const days = daySpan(range);
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
        <AnalyticsDateRange value={range} onChange={setRange} />
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

      {/* Active users — DAU/WAU/MAU over the same shared period */}
      <div className="space-y-6 pt-4">
        <div>
          <h3 className="text-heading font-bold text-mp-gray-900">Активные пользователи</h3>
          <p className="text-body-sm text-mp-gray-500 mt-1">DAU / WAU / MAU и липкость аудитории</p>
        </div>
        <ActiveUsersSection from={from} to={to} />
      </div>

      {/* Offer integrity monitor — duplicate active PLATFORM subscriptions */}
      <div className="pt-4">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-heading font-bold text-mp-gray-900">Дубли активных PLATFORM-подписок</h3>
              <p className="text-body-sm text-mp-gray-500 mt-1">
                В норме 0. При &gt;0 — гонка двойной оплаты, разобрать вручную.
              </p>
            </div>
            <p className={`text-3xl font-bold ${(offerDuplicates.data?.total ?? 0) > 0 ? 'text-red-600' : 'text-mp-gray-900'}`}>
              {offerDuplicates.isLoading ? '…' : offerDuplicates.data?.total ?? 0}
            </p>
          </div>
          {(offerDuplicates.data?.total ?? 0) > 0 && (
            <ul className="mt-4 space-y-1 text-body-sm text-mp-gray-700">
              {offerDuplicates.data!.rows.map((r) => (
                <li key={r.userId} className="font-mono">{r.userId} — {r.count} подписки</li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
