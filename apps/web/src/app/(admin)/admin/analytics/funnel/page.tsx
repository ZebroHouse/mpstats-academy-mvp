'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { StatCard } from '@/components/admin/StatCard';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { UserPlus, ClipboardCheck, CreditCard, FlaskConical, TrendingDown, Share2 } from 'lucide-react';

const PERIODS = [
  { label: '7d', days: 7 },
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
] as const;

const rub = (n: number) => `${n.toLocaleString('ru-RU')} ₽`;

export default function AnalyticsFunnelPage() {
  const [days, setDays] = useState(30);
  const funnel = trpc.admin.analytics.getConversionFunnel.useQuery({ days });
  const trial = trpc.admin.analytics.getTrialConversion.useQuery({ days: 90 });
  const churn = trpc.admin.analytics.getChurn.useQuery({ days });
  const attr = trpc.admin.analytics.getAttribution.useQuery({ days });

  const f = funnel.data;
  const t = trial.data;
  const c = churn.data;
  const a = attr.data;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-heading-lg font-bold text-mp-gray-900">Воронка</h2>
          <p className="text-body-sm text-mp-gray-500 mt-1">Конверсия, trial→paid, отток, источники (без тестовых)</p>
        </div>
        <div className="flex items-center gap-1 bg-mp-gray-100 rounded-lg p-1">
          {PERIODS.map((p) => (
            <button key={p.days} onClick={() => setDays(p.days)}
              className={cn('px-3 py-1.5 text-body-sm font-medium rounded-md transition-all duration-200',
                days === p.days ? 'bg-white text-mp-blue-600 shadow-sm' : 'text-mp-gray-600 hover:text-mp-gray-900')}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Conversion funnel */}
      <Card className="p-5">
        <h4 className="text-body font-semibold text-mp-gray-900 mb-4">Регистрация → диагностика → оплата ({days}д)</h4>
        {funnel.isLoading ? <Skeleton className="h-20 w-full" /> : f ? (
          <div className="grid grid-cols-3 gap-4">
            <StatCard title="Регистрации" value={f.registered} icon={UserPlus} color="blue" />
            <StatCard title="Прошли диагностику" value={f.completedDiagnostic} icon={ClipboardCheck} color="green"
              trend={`${f.diagRate}% от регистраций`} />
            <StatCard title="Оплатили" value={f.paid} icon={CreditCard} color="pink"
              trend={`${f.paidRate}% от прошедших`} />
          </div>
        ) : null}
      </Card>

      {/* Trial → paid */}
      <Card className="p-5">
        <h4 className="text-body font-semibold text-mp-gray-900 mb-1">Trial → Paid (когорта за 90д)</h4>
        <p className="text-xs text-mp-gray-400 mb-4">Конверсия считается по «дозревшим» триалам (триал уже закончился).</p>
        {trial.isLoading ? <Skeleton className="h-20 w-full" /> : t ? (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard title="Триалов начато" value={t.trialsStarted} icon={FlaskConical} color="gray" />
            <StatCard title="Сконвертилось" value={t.converted} icon={CreditCard} color="green"
              trend={`${t.conversionRate}% конверсия`} />
            <StatCard title="Активных триалов" value={t.activeTrials} icon={FlaskConical} color="blue" />
            <StatCard title="Ушло без оплаты" value={t.churnedTrials} icon={TrendingDown} color="pink" />
            <StatCard title="Дней до оплаты" value={t.avgDaysToConvert} icon={ClipboardCheck} color="gray" />
          </div>
        ) : null}
      </Card>

      {/* Churn */}
      <Card className="p-5">
        <h4 className="text-body font-semibold text-mp-gray-900 mb-1">Отток ({days}д)</h4>
        <p className="text-xs text-mp-gray-400 mb-4">Приблизительно: churn rate = отмены / текущая активная база.</p>
        {churn.isLoading ? <Skeleton className="h-20 w-full" /> : c ? (
          <div className="grid grid-cols-3 gap-4">
            <StatCard title="Отмен за период" value={c.cancelled} icon={TrendingDown} color="pink" trend={`${c.churnRate}% churn`} />
            <StatCard title="PAST_DUE сейчас" value={c.pastDue} icon={CreditCard} color="gray" />
            <StatCard title="Активная база" value={c.activeBase} icon={UserPlus} color="blue" />
          </div>
        ) : null}
      </Card>

      {/* Attribution */}
      <Card className="p-5">
        <h4 className="text-body font-semibold text-mp-gray-900 mb-4">Источник выручки ({days}д)</h4>
        {attr.isLoading ? <Skeleton className="h-16 w-full" /> : a ? (
          <table className="w-full text-body-sm">
            <thead><tr className="border-b border-mp-gray-200">
              <th className="text-left py-2 pr-4 text-mp-gray-500 font-medium">Источник</th>
              <th className="text-right py-2 px-4 text-mp-gray-500 font-medium">Платящих</th>
              <th className="text-right py-2 pl-4 text-mp-gray-500 font-medium">Выручка</th>
            </tr></thead>
            <tbody>
              <tr className="border-b border-mp-gray-100">
                <td className="py-2 pr-4 text-mp-gray-900 flex items-center gap-2"><Share2 className="w-4 h-4 text-mp-gray-400" />По приглашению (реферал)</td>
                <td className="py-2 px-4 text-right text-mp-gray-700">{a.referred.users}</td>
                <td className="py-2 pl-4 text-right text-mp-gray-700">{rub(a.referred.revenue)}</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 text-mp-gray-900">Органика</td>
                <td className="py-2 px-4 text-right text-mp-gray-700">{a.organic.users}</td>
                <td className="py-2 pl-4 text-right text-mp-gray-700">{rub(a.organic.revenue)}</td>
              </tr>
            </tbody>
          </table>
        ) : null}
      </Card>
    </div>
  );
}
