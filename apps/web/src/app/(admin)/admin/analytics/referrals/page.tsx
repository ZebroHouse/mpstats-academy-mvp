'use client';

import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { trpc } from '@/lib/trpc/client';
import { StatCard } from '@/components/admin/StatCard';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { MousePointerClick, UserPlus, ClipboardCheck, CreditCard } from 'lucide-react';

const PERIODS = [
  { label: '7d', days: 7 },
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
] as const;

const pct = (v: number | null) => (v === null ? '—' : `${v}%`);

export default function AnalyticsReferralsPage() {
  const [days, setDays] = useState(30);
  const q = trpc.admin.analytics.getReferralFunnel.useQuery({ days });
  const d = q.data;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-heading-lg font-bold text-mp-gray-900">Рефералы</h2>
          <p className="text-body-sm text-mp-gray-500 mt-1">
            Воронка по амбассадорским кодам: переходы → регистрации → продажи (без тестовых)
          </p>
        </div>
        <div className="flex items-center gap-1 bg-mp-gray-100 rounded-lg p-1">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              onClick={() => setDays(p.days)}
              className={cn(
                'px-3 py-1.5 text-body-sm font-medium rounded-md transition-all duration-200',
                days === p.days ? 'bg-white text-mp-blue-600 shadow-sm' : 'text-mp-gray-600 hover:text-mp-gray-900',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Totals */}
      {q.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : d ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Переходы" value={d.totals.clicks} icon={MousePointerClick} color="blue" />
          <StatCard title="Регистрации" value={d.totals.registrations} icon={UserPlus} color="green" />
          <StatCard title="Завершили онбординг" value={d.totals.onboarded} icon={ClipboardCheck} color="gray" />
          <StatCard title="Продажи" value={d.totals.sales} icon={CreditCard} color="pink" />
        </div>
      ) : null}

      {/* Per-day series */}
      <Card className="p-5">
        <h4 className="text-body font-semibold text-mp-gray-900 mb-1">Динамика по дням ({days}д)</h4>
        <p className="text-xs text-mp-gray-400 mb-4">
          Переходы считаются с момента запуска фичи — историю до этого восстановить нельзя.
        </p>
        {q.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : d && d.series.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={d.series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="day"
                tickFormatter={(s: string) => {
                  const p = s.split('-');
                  return `${p[2]}.${p[1]}`;
                }}
                tick={{ fontSize: 11, fill: '#6b7280' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={30} />
              <Tooltip
                contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }}
                labelFormatter={(s: string) => {
                  const p = s.split('-');
                  return `${p[2]}.${p[1]}.${p[0]}`;
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Line type="monotone" dataKey="clicks" name="Переходы" stroke="#2563eb" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="registrations" name="Регистрации" stroke="#16a34a" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="sales" name="Продажи" stroke="#db2777" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-body-sm text-mp-gray-400 py-8 text-center">Нет данных за период.</p>
        )}
      </Card>

      {/* Per-code funnel table */}
      <Card className="overflow-hidden">
        <div className="px-5 pt-5">
          <h4 className="text-body font-semibold text-mp-gray-900">Воронка по кодам</h4>
        </div>
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-body-sm">
            <thead className="bg-mp-gray-50 border-y border-mp-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-mp-gray-700">Код</th>
                <th className="text-left px-4 py-3 font-medium text-mp-gray-700">Метка</th>
                <th className="text-left px-4 py-3 font-medium text-mp-gray-700">Ведёт</th>
                <th className="text-right px-4 py-3 font-medium text-mp-gray-700">Переходы</th>
                <th className="text-right px-4 py-3 font-medium text-mp-gray-700">Регистрации</th>
                <th className="text-right px-4 py-3 font-medium text-mp-gray-700">Рег/Переход</th>
                <th className="text-right px-4 py-3 font-medium text-mp-gray-700">Онбординг</th>
                <th className="text-right px-4 py-3 font-medium text-mp-gray-700">Продажи</th>
                <th className="text-right px-4 py-3 font-medium text-mp-gray-700">Прод/Рег</th>
              </tr>
            </thead>
            <tbody>
              {q.isLoading && (
                <tr>
                  <td colSpan={9} className="p-6">
                    <Skeleton className="h-24 w-full" />
                  </td>
                </tr>
              )}
              {!q.isLoading && d && d.perCode.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-mp-gray-500">
                    Нет амбассадорских кодов.
                  </td>
                </tr>
              )}
              {d?.perCode.map((row) => (
                <tr key={row.codeId} className="border-b border-mp-gray-100 hover:bg-mp-gray-50/50">
                  <td className="px-4 py-3 font-mono text-mp-gray-900">{row.code}</td>
                  <td className="px-4 py-3 text-mp-gray-900">{row.label}</td>
                  <td className="px-4 py-3 text-mp-gray-600 whitespace-nowrap">
                    {row.landingTarget === 'HOME' ? 'Главная' : 'Регистрация'}
                  </td>
                  <td className="px-4 py-3 text-right text-mp-gray-700">{row.clicks}</td>
                  <td className="px-4 py-3 text-right text-mp-gray-700">{row.registrations}</td>
                  <td className="px-4 py-3 text-right text-mp-gray-500">{pct(row.regPerClick)}</td>
                  <td className="px-4 py-3 text-right text-mp-gray-700">{row.onboarded}</td>
                  <td className="px-4 py-3 text-right font-medium text-mp-gray-900">{row.sales}</td>
                  <td className="px-4 py-3 text-right text-mp-gray-500">{pct(row.salePerReg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
