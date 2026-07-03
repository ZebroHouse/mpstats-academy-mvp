'use client';

import { useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { AnalyticsDateRange, presetRange, rangeToBounds } from '@/components/admin/AnalyticsDateRange';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Download } from 'lucide-react';

const STATUS_STYLES: Record<string, string> = {
  paid: 'bg-green-50 text-green-700',
  failed: 'bg-red-50 text-red-700',
  checkout: 'bg-amber-50 text-amber-700',
  none: 'bg-mp-gray-100 text-mp-gray-600',
};

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function AnalyticsClientsPage() {
  const [range, setRange] = useState(presetRange(30));
  // Which date the window filters on. 'payment' surfaces clients who paid in the
  // window even if they registered earlier (e.g. an SBP one-off from an old signup).
  const [dateField, setDateField] = useState<'registration' | 'payment'>('registration');

  // Inclusive Date bounds in UTC.
  const bounds = useMemo(() => rangeToBounds(range), [range]);

  const q = trpc.admin.analytics.getClientRegistry.useQuery({ ...bounds, dateField });
  const rows = q.data?.rows ?? [];

  const csvHref = `/api/admin/client-registry?from=${encodeURIComponent(bounds.from.toISOString())}&to=${encodeURIComponent(bounds.to.toISOString())}&dateField=${dateField}`;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-heading-lg font-bold text-mp-gray-900">Клиенты</h2>
          <p className="text-body-sm text-mp-gray-500 mt-1">
            {dateField === 'payment'
              ? 'Реестр оплативших за период: источник, контакты, оплата. Без тестовых.'
              : 'Реестр зарегистрированных: источник, контакты, статус оплаты. Без тестовых.'}
          </p>
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="text-xs text-mp-gray-500 block mb-1">Период по</label>
            <div className="flex items-center gap-1 bg-mp-gray-100 rounded-lg p-1">
              {([['registration', 'Регистрации'], ['payment', 'Оплате']] as const).map(([val, label]) => (
                <button key={val} type="button" onClick={() => setDateField(val)}
                  className={cn('px-3 py-1 text-body-sm font-medium rounded-md transition-all duration-200',
                    dateField === val ? 'bg-white text-mp-blue-600 shadow-sm' : 'text-mp-gray-600 hover:text-mp-gray-900')}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <AnalyticsDateRange value={range} onChange={setRange} />
          <Button asChild variant="outline">
            <a href={csvHref} download>
              <Download className="w-4 h-4 mr-1" />
              CSV
            </a>
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="px-5 pt-5 flex items-center justify-between">
          <h4 className="text-body font-semibold text-mp-gray-900">
            Реестр {q.data ? `(${q.data.total})` : ''}
          </h4>
        </div>
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-body-sm">
            <thead className="bg-mp-gray-50 border-y border-mp-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-mp-gray-700">Email</th>
                <th className="text-left px-4 py-3 font-medium text-mp-gray-700">Имя</th>
                <th className="text-left px-4 py-3 font-medium text-mp-gray-700">Телефон</th>
                <th className="text-left px-4 py-3 font-medium text-mp-gray-700">Регистрация</th>
                <th className="text-left px-4 py-3 font-medium text-mp-gray-700">Триал до</th>
                <th className="text-left px-4 py-3 font-medium text-mp-gray-700">Источник</th>
                <th className="text-left px-4 py-3 font-medium text-mp-gray-700">Статус оплаты</th>
                <th className="text-left px-4 py-3 font-medium text-mp-gray-700">Дата оплаты</th>
                <th className="text-right px-4 py-3 font-medium text-mp-gray-700">Сумма</th>
                <th className="text-left px-4 py-3 font-medium text-mp-gray-700">Тариф</th>
              </tr>
            </thead>
            <tbody>
              {q.isLoading && (
                <tr><td colSpan={10} className="p-6"><Skeleton className="h-40 w-full" /></td></tr>
              )}
              {!q.isLoading && q.error && (
                <tr><td colSpan={10} className="p-8 text-center text-red-600">
                  Ошибка загрузки: {q.error.message}
                </td></tr>
              )}
              {!q.isLoading && !q.error && rows.length === 0 && (
                <tr><td colSpan={10} className="p-8 text-center text-mp-gray-500">Нет клиентов за период.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.userId} className="border-b border-mp-gray-100 hover:bg-mp-gray-50/50">
                  <td className="px-4 py-3 text-mp-gray-900">{r.email || '—'}</td>
                  <td className="px-4 py-3 text-mp-gray-900">{r.name || '—'}</td>
                  <td className="px-4 py-3 text-mp-gray-700 whitespace-nowrap">{r.phone || '—'}</td>
                  <td className="px-4 py-3 text-mp-gray-600 whitespace-nowrap">{fmtDateTime(r.registeredAt)}</td>
                  <td className="px-4 py-3 text-mp-gray-600 whitespace-nowrap">{fmtDateTime(r.trialEndsAt)}</td>
                  <td className="px-4 py-3 text-mp-gray-700">{r.source}</td>
                  <td className="px-4 py-3">
                    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap', STATUS_STYLES[r.paymentStatus])}>
                      {r.paymentStatusLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-mp-gray-600 whitespace-nowrap">{fmtDateTime(r.lastPaidAt)}</td>
                  <td className="px-4 py-3 text-right text-mp-gray-900">
                    {r.lastPaidAmount != null ? `${r.lastPaidAmount.toLocaleString('ru-RU')} ₽` : '—'}
                  </td>
                  <td className="px-4 py-3 text-mp-gray-700">{r.plan || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
