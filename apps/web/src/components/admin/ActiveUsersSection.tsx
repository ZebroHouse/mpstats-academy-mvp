'use client';

import { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Activity, CalendarDays, CalendarRange, Repeat } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { StatCard } from '@/components/admin/StatCard';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const PERIODS = [
  { label: '7d', days: 7 },
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
] as const;

// Brand palette per task spec.
const COLOR_DAU = '#2C4FF8'; // mp-blue
const COLOR_WAU = '#6CC40C'; // mp-green
const COLOR_MAU = '#F97316'; // amber/pink accent
const COLOR_STICKINESS = '#EC4899'; // mp-pink

function formatDateTick(d: string): string {
  const parts = d.split('-');
  return `${parts[2]}.${parts[1]}`;
}

function formatDateLabel(d: string): string {
  const parts = d.split('-');
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

/** Build a +N / −N trend caption comparing current vs previous (start of window). */
function trendCaption(current: number, previous: number): string | undefined {
  const delta = current - previous;
  if (delta === 0) return undefined;
  const sign = delta > 0 ? '+' : '−';
  return `${sign}${Math.abs(delta)} за период`;
}

export function ActiveUsersSection() {
  const [days, setDays] = useState(30);
  const stats = trpc.admin.analytics.getActiveUserStats.useQuery({ days });

  const data = stats.data;

  // Series for the combined DAU/WAU/MAU chart (uses raw fields).
  const activeSeries = data?.series ?? [];

  // Series for the stickiness chart (ratio 0..1 → percent).
  const stickinessSeries = useMemo(
    () =>
      activeSeries.map((p) => ({
        date: p.date,
        stickiness: Math.round(p.stickiness * 1000) / 10, // % with 1 decimal
      })),
    [activeSeries],
  );

  const allZero = useMemo(
    () => activeSeries.every((p) => p.dau === 0 && p.wau === 0 && p.mau === 0),
    [activeSeries],
  );

  // ── Hooks complete; safe to early-return below ──────────────────────────

  if (stats.isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="p-5">
              <Skeleton className="h-4 w-24 mb-3" />
              <Skeleton className="h-8 w-16" />
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-5">
            <Skeleton className="h-5 w-32 mb-4" />
            <Skeleton className="h-[280px] w-full" />
          </Card>
          <Card className="p-5">
            <Skeleton className="h-5 w-32 mb-4" />
            <Skeleton className="h-[280px] w-full" />
          </Card>
        </div>
      </div>
    );
  }

  if (stats.error) {
    return (
      <Card className="p-6 text-center">
        <p className="text-red-600 font-medium">Не удалось загрузить данные об активности</p>
        <p className="text-body-sm text-mp-gray-500 mt-1">{stats.error.message}</p>
      </Card>
    );
  }

  const current = data?.current ?? { dau: 0, wau: 0, mau: 0, stickiness: 0 };
  const previous = data?.previous ?? { dau: 0, wau: 0, mau: 0 };
  const stickinessPercent = Math.round(current.stickiness * 1000) / 10;

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex justify-end">
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

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Активные сегодня (DAU)"
          value={current.dau}
          icon={Activity}
          color="blue"
          trend={trendCaption(current.dau, previous.dau)}
        />
        <StatCard
          title="За 7 дней (WAU)"
          value={current.wau}
          icon={CalendarDays}
          color="green"
          trend={trendCaption(current.wau, previous.wau)}
        />
        <StatCard
          title="За 30 дней (MAU)"
          value={current.mau}
          icon={CalendarRange}
          color="pink"
          trend={trendCaption(current.mau, previous.mau)}
        />
        <StatCard
          title="Липкость (DAU/MAU)"
          value={`${stickinessPercent}%`}
          icon={Repeat}
          color="gray"
        />
      </div>

      {allZero && (
        <Card className="p-4">
          <p className="text-body-sm text-mp-gray-500 text-center">
            Данные копятся с момента запуска — точные значения появятся в ближайшие дни.
          </p>
        </Card>
      )}

      {/* DAU/WAU/MAU combined chart + stickiness chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <h3 className="text-body-md font-semibold text-mp-gray-900 mb-4">
            Активные пользователи (DAU / WAU / MAU)
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={activeSeries}>
              <XAxis
                dataKey="date"
                tickFormatter={formatDateTick}
                tick={{ fontSize: 11, fill: '#6b7280' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: '#6b7280' }}
                axisLine={false}
                tickLine={false}
                width={30}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                labelFormatter={formatDateLabel}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Line
                type="monotone"
                dataKey="dau"
                name="DAU"
                stroke={COLOR_DAU}
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="wau"
                name="WAU"
                stroke={COLOR_WAU}
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="mau"
                name="MAU"
                stroke={COLOR_MAU}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <h3 className="text-body-md font-semibold text-mp-gray-900 mb-4">Липкость (DAU/MAU)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={stickinessSeries}>
              <defs>
                <linearGradient id="gradient-stickiness" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLOR_STICKINESS} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={COLOR_STICKINESS} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tickFormatter={formatDateTick}
                tick={{ fontSize: 11, fill: '#6b7280' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#6b7280' }}
                axisLine={false}
                tickLine={false}
                width={36}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                labelFormatter={formatDateLabel}
                formatter={(v: number) => [`${v}%`, 'Липкость']}
              />
              <Area
                type="monotone"
                dataKey="stickiness"
                stroke={COLOR_STICKINESS}
                fill="url(#gradient-stickiness)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Honest caption */}
      <p className="text-xs text-mp-gray-400 leading-relaxed">
        DAU/WAU/MAU считается по факту захода в приложение (heartbeat); история до запуска —
        приблизительная (бэкафилл по диагностике, чату и комментариям).
      </p>
    </div>
  );
}
