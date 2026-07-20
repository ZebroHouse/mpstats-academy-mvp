'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { StatCard } from '@/components/admin/StatCard';
import {
  AnalyticsDateRange,
  DEFAULT_RANGE_DAYS,
  presetRange,
  rangeToBounds,
} from '@/components/admin/AnalyticsDateRange';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { MousePointerClick, Users, Eye, Info } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const DASH = '—';

/** Периоды, за которые Метрика отдаёт честных уников. Совпадают с пресетными
 *  чипами: METRIKA_UNIQUE_WINDOWS на бэкенде заведены под те же окна. */
const UNIQUE_PRESETS = `${DEFAULT_RANGE_DAYS.slice(0, -1).join(', ')} или ${DEFAULT_RANGE_DAYS.at(-1)} дней`;

const SOURCE_LABEL: Record<'metrika' | 'db', string> = {
  metrika: 'Метрика',
  db: 'база',
};

const num = (n: number) => n.toLocaleString('ru-RU');

/** yyyy-mm-dd → «19 июля». Подписывает границу, по которую посчитаны уники. */
const formatDay = (day: string) =>
  new Date(`${day}T00:00:00.000Z`).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
const pct = (n: number | null) => (n === null ? DASH : `${n.toFixed(1).replace('.', ',')}%`);

const dayTick = (d: string) => {
  const p = d.split('-');
  return `${p[2]}.${p[1]}`;
};

function TrafficChart({
  data,
}: {
  data: Array<{ day: string; visits: number; users: number }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data}>
        <XAxis
          dataKey="day"
          tickFormatter={dayTick}
          tick={{ fontSize: 11, fill: '#6b7280' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#6b7280' }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
          width={40}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            fontSize: '12px',
          }}
          labelFormatter={(d: string) => {
            const p = d.split('-');
            return `${p[2]}.${p[1]}.${p[0]}`;
          }}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="visits"
          name="Визиты"
          stroke="#2563eb"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="users"
          name="Посетители за день"
          stroke="#16a34a"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Пояснительная сноска — серый текст с иконкой, одинаковый на всей странице. */
function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-body-sm text-mp-gray-500">
      <Info className="w-4 h-4 mt-0.5 shrink-0 text-mp-gray-400" />
      <span>{children}</span>
    </p>
  );
}

export default function ProductFunnelPage() {
  const [range, setRange] = useState(presetRange(30));
  const { from, to } = rangeToBounds(range);

  const traffic = trpc.admin.analytics.funnel.getTrafficOverview.useQuery({ from, to });
  const funnel = trpc.admin.analytics.funnel.getProductFunnel.useQuery({ from, to });

  const snapshotAt = traffic.data?.snapshotAt ?? funnel.data?.snapshotAt ?? null;
  // Именно isSuccess, а не «не грузится»: на упавшем запросе snapshotAt тоже
  // null, и сообщение «крон ещё не отработал» соврало бы про причину пустоты.
  const snapshotLoaded = traffic.isSuccess && funnel.isSuccess;
  const periodUsers = traffic.data?.totals.periodUsers ?? null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-heading-lg font-bold text-mp-gray-900">Продуктовая воронка</h2>
          <p className="text-body-sm text-mp-gray-500 mt-1">
            Путь от визита на сайт до оплаты: поведение из Яндекс.Метрики, деньги из базы
          </p>
        </div>
        <AnalyticsDateRange value={range} onChange={setRange} />
      </div>

      {/* Свежесть данных */}
      {snapshotLoaded &&
        (snapshotAt ? (
          <p className="text-body-sm text-mp-gray-500">
            Данные Метрики на{' '}
            <span className="text-mp-gray-700 font-medium">
              {new Date(snapshotAt).toLocaleString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            . Обновляются раз в несколько часов, поэтому сегодняшний день может быть неполным.
          </p>
        ) : (
          <Card className="p-4 bg-mp-blue-50 border-mp-blue-100">
            <Note>
              Данных Метрики пока нет — фоновая выгрузка ещё не отработала. Числа появятся после
              первого удачного прогона; шаги «Триал» и «Оплата» считаются из базы и видны уже
              сейчас.
            </Note>
          </Card>
        ))}

      {/* Трафик */}
      <section className="space-y-4">
        <h3 className="text-body font-semibold text-mp-gray-900">Трафик</h3>

        {traffic.isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-5">
                <Skeleton className="h-4 w-24 mb-3" />
                <Skeleton className="h-8 w-16" />
              </Card>
            ))}
          </div>
        ) : traffic.data ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard
                title="Визиты"
                value={num(traffic.data.totals.visits)}
                icon={MousePointerClick}
                color="blue"
              />
              <StatCard
                title="Уникальные посетители"
                value={periodUsers === null ? DASH : num(periodUsers.value)}
                icon={Users}
                color="green"
                trend={
                  periodUsers === null
                    ? `Считается только за ${UNIQUE_PRESETS}`
                    : `За ${periodUsers.windowDays} полных суток по ${formatDay(periodUsers.throughDay)}`
                }
              />
              <StatCard
                title="Просмотры страниц"
                value={num(traffic.data.totals.pageviews)}
                icon={Eye}
                color="gray"
              />
            </div>

            {periodUsers === null && (
              <Note>
                Уникальных посетителей за этот период мы не показываем. Их нельзя сложить по дням:
                человек, заходивший в понедельник и во вторник, посчитался бы дважды. Честное число
                Метрика отдаёт только за готовые периоды ({UNIQUE_PRESETS}) — выберите такой период
                сверху. За прошлые месяцы уников тоже не будет: срез снимается раз в несколько
                часов и хранит только последнее окно, а не историю.
              </Note>
            )}
          </>
        ) : null}

        <Card className="p-5">
          <h4 className="text-body font-semibold text-mp-gray-900 mb-1">Трафик по дням</h4>
          <p className="text-body-sm text-mp-gray-500 mb-4">
            Зелёная линия — посетители внутри одного дня. Складывать её по дням нельзя: за неделю
            получится больше людей, чем пришло на самом деле.
          </p>
          {traffic.isLoading ? (
            <Skeleton className="h-[260px] w-full" />
          ) : traffic.data && traffic.data.series.length > 0 ? (
            <TrafficChart data={traffic.data.series} />
          ) : (
            <p className="text-body-sm text-mp-gray-500">Нет данных за период.</p>
          )}
        </Card>
      </section>

      {/* Воронка */}
      <section className="space-y-4">
        <div>
          <h3 className="text-body font-semibold text-mp-gray-900">Шаги воронки</h3>
          <p className="text-body-sm text-mp-gray-500 mt-0.5">
            Основная колонка для сравнения шагов — доля от визитов
          </p>
        </div>

        <Card className="p-5">
          {funnel.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : funnel.data && funnel.data.steps.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-body-sm">
                <thead>
                  <tr className="border-b border-mp-gray-200">
                    <th className="text-left py-2 pr-4 text-mp-gray-500 font-medium">Шаг</th>
                    <th className="text-right py-2 px-4 text-mp-gray-500 font-medium">Значение</th>
                    <th className="text-right py-2 px-4 text-mp-gray-500 font-medium">
                      От предыдущего
                    </th>
                    <th className="text-right py-2 px-4 text-mp-gray-500 font-medium">
                      От визитов
                    </th>
                    <th className="text-left py-2 pl-4 text-mp-gray-500 font-medium">Источник</th>
                  </tr>
                </thead>
                <tbody>
                  {funnel.data.steps.map((step) => (
                    <tr key={step.key} className="border-b border-mp-gray-100 last:border-0">
                      <td className="py-2.5 pr-4 text-mp-gray-900 whitespace-nowrap">
                        {step.label}
                      </td>
                      <td className="py-2.5 px-4 text-right text-mp-gray-900 tabular-nums font-medium">
                        {num(step.value)}
                      </td>
                      <td className="py-2.5 px-4 text-right text-mp-gray-700 tabular-nums">
                        {pct(step.fromPrev)}
                      </td>
                      <td className="py-2.5 px-4 text-right text-mp-gray-700 tabular-nums">
                        {pct(step.fromTop)}
                      </td>
                      <td className="py-2.5 pl-4 text-mp-gray-500 whitespace-nowrap">
                        {SOURCE_LABEL[step.source]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-body-sm text-mp-gray-500">Нет данных за период.</p>
          )}
        </Card>

        <div className="space-y-2">
          <Note>
            Прочерк в колонке «от предыдущего» — не пропущенные данные. Шаги воронки это отдельные
            цели Метрики, а не вложенные друг в друга группы людей: чтобы открыть урок, не нужно
            проходить диагностику. Доля от предыдущего шага осмысленна только там, где второй шаг
            целиком внутри первого — диагностика (начал → завершил) и оплата (триал → оплата).
          </Note>
          <Note>
            Даже у вложенной пары доля может немного превысить 100%: человек начал триал в конце
            прошлого периода, а оплатил уже в этом.
          </Note>
          <Note>
            Колонка «Источник» показывает, кто дал число. Шаги из Метрики считают поведение и
            занижены на тех, у кого блокировщик рекламы. Триал и оплата берутся из базы — это те же
            цифры, что в табе «Выручка».
          </Note>
        </div>
      </section>
    </div>
  );
}
