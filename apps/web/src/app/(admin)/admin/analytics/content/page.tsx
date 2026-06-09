'use client';

import { trpc } from '@/lib/trpc/client';
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

export default function AnalyticsContentPage() {
  const watchStats = trpc.admin.analytics.getWatchStats.useQuery();

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-heading-lg font-bold text-mp-gray-900">Контент</h2>
        <p className="text-body-sm text-mp-gray-500 mt-1">Вовлечённость в видеоуроки</p>
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
          <div className="grid grid-cols-3 gap-4">
            <Card className="p-4"><SummaryStat label="Средний % просмотра" value={`${watchStats.data.avgWatchPercent}%`} /></Card>
            <Card className="p-4"><SummaryStat label="Всего просмотров" value={watchStats.data.totalWatchSessions} /></Card>
            <Card className="p-4"><SummaryStat label="Доля завершений" value={`${watchStats.data.completionRate}%`} /></Card>
          </div>

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
  );
}
