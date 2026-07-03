'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { ActivityChart } from '@/components/admin/ActivityChart';
import { StatCard } from '@/components/admin/StatCard';
import { AnalyticsDateRange, presetRange, rangeToBounds, daySpan } from '@/components/admin/AnalyticsDateRange';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, CreditCard, TrendingUp, Wallet, FlaskConical, Banknote } from 'lucide-react';

const rub = (n: number) => `${n.toLocaleString('ru-RU')} ₽`;
const fmtDate = (d: string) => { const p = d.split('-'); return `${p[2]}.${p[1]}.${p[0]}`; };

export default function AnalyticsRevenuePage() {
  // Default 90d: payments are sparse, a 30d window can land entirely after the
  // last payment and read as "broken". 90d surfaces recent-but->30d-old cash-in.
  const [range, setRange] = useState(presetRange(90));
  const { from, to } = rangeToBounds(range);
  // Renewals are a FORWARD window; use the selected range's length as its horizon
  // (clamped to the procedure's 90-day max so a wide custom range stays valid).
  const renewalDays = Math.min(daySpan(range), 90);
  const overview = trpc.admin.analytics.getRevenueOverview.useQuery();
  const renewals = trpc.admin.analytics.getUpcomingRenewals.useQuery({ days: renewalDays });
  const actual = trpc.admin.analytics.getActualRevenue.useQuery({ from, to });

  const o = overview.data;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-heading-lg font-bold text-mp-gray-900">Выручка</h2>
          <p className="text-body-sm text-mp-gray-500 mt-1">MRR (только авто-продления), продления, приход, ARPU (без тестовых)</p>
        </div>
        <AnalyticsDateRange value={range} onChange={setRange} />
      </div>

      {/* KPI cards */}
      {overview.isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => <Card key={i} className="p-5"><Skeleton className="h-4 w-24 mb-3" /><Skeleton className="h-8 w-16" /></Card>)}
        </div>
      ) : o ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard title="Выручка за период" value={actual.data ? rub(actual.data.total) : '…'} icon={Banknote} color="green" trend="разовые + рекуррент" />
          <StatCard title="MRR" value={rub(o.mrr)} icon={Wallet} color="green" trend={`${o.recurringPayers} на авто-продлении`} />
          <StatCard title="Платящих (ACTIVE)" value={o.activePaying} icon={CreditCard} color="blue" />
          <StatCard title="Триалы (пайплайн)" value={o.trialPipeline} icon={FlaskConical} color="pink" />
          <StatCard title="Активная база" value={o.payingUsers} icon={Users} color="gray" />
          <StatCard title="ARPU" value={rub(o.arpu)} icon={TrendingUp} color="blue" />
        </div>
      ) : null}

      {/* Plan split */}
      {o && (
        <Card className="p-5">
          <h4 className="text-body font-semibold text-mp-gray-900 mb-3">Сплит планов</h4>
          <table className="w-full text-body-sm">
            <thead><tr className="border-b border-mp-gray-200">
              <th className="text-left py-2 pr-4 text-mp-gray-500 font-medium">План</th>
              <th className="text-right py-2 px-4 text-mp-gray-500 font-medium">Подписок</th>
              <th className="text-right py-2 pl-4 text-mp-gray-500 font-medium">MRR</th>
            </tr></thead>
            <tbody>
              {o.planSplit.map((p) => (
                <tr key={p.type} className="border-b border-mp-gray-100 last:border-0">
                  <td className="py-2 pr-4 text-mp-gray-900">{p.type === 'PLATFORM' ? 'Полный доступ' : 'Курс'}</td>
                  <td className="py-2 px-4 text-right text-mp-gray-700">{p.count}</td>
                  <td className="py-2 pl-4 text-right text-mp-gray-700">{rub(p.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Actual revenue chart */}
      <Card className="p-5">
        <div className="flex items-baseline justify-between mb-2">
          <h4 className="text-body font-semibold text-mp-gray-900">Фактический приход</h4>
          {actual.data && <span className="text-body-sm text-mp-gray-500">Итого: {rub(actual.data.total)}</span>}
        </div>
        {actual.isLoading ? <Skeleton className="h-[250px] w-full" /> :
          <ActivityChart
            data={(actual.data?.byDay ?? []).map((d) => ({ date: d.date, count: d.amount }))}
            title=""
            color="#16a34a"
          />}
      </Card>

      {/* Upcoming renewals */}
      <Card className="p-5">
        <div className="flex items-baseline justify-between mb-3">
          <h4 className="text-body font-semibold text-mp-gray-900">Ближайшие продления ({renewalDays}д)</h4>
          {renewals.data && <span className="text-body-sm text-mp-gray-500">Ожидаем: {rub(renewals.data.totalExpected)}</span>}
        </div>
        {renewals.isLoading ? <Skeleton className="h-24 w-full" /> :
          renewals.data && renewals.data.rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-body-sm">
                <thead><tr className="border-b border-mp-gray-200">
                  <th className="text-left py-2 pr-4 text-mp-gray-500 font-medium">Пользователь</th>
                  <th className="text-left py-2 px-4 text-mp-gray-500 font-medium">Email</th>
                  <th className="text-left py-2 px-4 text-mp-gray-500 font-medium">План</th>
                  <th className="text-right py-2 px-4 text-mp-gray-500 font-medium">Сумма</th>
                  <th className="text-right py-2 pl-4 text-mp-gray-500 font-medium">Дата</th>
                </tr></thead>
                <tbody>
                  {renewals.data.rows.map((r, i) => (
                    <tr key={`${r.userId}-${i}`} className="border-b border-mp-gray-100 last:border-0">
                      <td className="py-2 pr-4 text-mp-gray-900">{r.name}</td>
                      <td className="py-2 px-4 text-mp-gray-600">{r.email || '—'}</td>
                      <td className="py-2 px-4 text-mp-gray-700">{r.planType === 'PLATFORM' ? 'Полный доступ' : 'Курс'}</td>
                      <td className="py-2 px-4 text-right text-mp-gray-700">{rub(r.amount)}</td>
                      <td className="py-2 pl-4 text-right text-mp-gray-700">{fmtDate(new Date(r.renewalDate).toISOString().split('T')[0])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-body-sm text-mp-gray-500">Нет рекуррентных продлений в окне.</p>}
      </Card>
    </div>
  );
}
