'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { ActivityChart } from '@/components/admin/ActivityChart';
import { StatCard } from '@/components/admin/StatCard';
import { AnalyticsDateRange, presetRange, rangeToBounds } from '@/components/admin/AnalyticsDateRange';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageSquare, Users, MessagesSquare, Gauge, Sparkles } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function ActivityChartMulti({ data }: { data: Array<{ date: string; assistant: number; lessonChat: number }> }) {
  return (
    <div>
      <h3 className="text-body-md font-semibold text-mp-gray-900 mb-4">AI-запросов в день по каналам</h3>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <XAxis dataKey="date" tickFormatter={(d: string) => { const p = d.split('-'); return `${p[2]}.${p[1]}`; }} tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="assistant" name="Ассистент" stroke="#16a34a" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="lessonChat" name="Чат в уроках" stroke="#db2777" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const CATEGORY_LABEL: Record<string, string> = {
  material: 'Материалы',
  platform_help: 'Помощь по платформе',
  complaint: 'Жалобы',
  off_domain: 'Офф-топик',
};

function TopList({ title, rows }: { title: string; rows: Array<{ id: string; title: string; count: number }> }) {
  return (
    <Card className="p-5">
      <h4 className="text-body font-semibold text-mp-gray-900 mb-3">{title}</h4>
      {rows.length === 0 ? (
        <p className="text-body-sm text-mp-gray-500">Нет данных за период.</p>
      ) : (
        <table className="w-full text-body-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-mp-gray-100 last:border-0">
                <td className="py-2 pr-4 text-mp-gray-900">{r.title}</td>
                <td className="py-2 pl-4 text-right text-mp-gray-700 tabular-nums">{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

export default function AssistantAnalyticsPage() {
  const [range, setRange] = useState(presetRange(30));
  const { from, to } = rangeToBounds(range);

  const pulse = trpc.admin.analytics.assistant.getPulse.useQuery({ from, to });
  const quality = trpc.admin.analytics.assistant.getQuality.useQuery({ from, to });
  const problems = trpc.admin.analytics.assistant.getProblemMessages.useQuery({ from, to, limit: 50 });
  const demand = trpc.admin.analytics.assistant.getDemand.useQuery({ from, to });
  const upsell = trpc.admin.analytics.assistant.getUpsell.useQuery({ from, to });
  const crossCutting = trpc.admin.analytics.assistant.getCrossCutting.useQuery({ from, to });
  const chatPulse = trpc.admin.analytics.assistant.getLessonChatPulse.useQuery({ from, to });
  const chatQuality = trpc.admin.analytics.assistant.getLessonChatQuality.useQuery({ from, to });
  const chatUnanswered = trpc.admin.analytics.assistant.getLessonChatUnanswered.useQuery({ from, to, limit: 50 });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-heading-lg font-bold text-mp-gray-900">AI-запросы</h2>
          <p className="text-body-sm text-mp-gray-500 mt-1">
            Сквозные AI-запросы: drawer-ассистент + чат в уроках (без тестовых)
          </p>
        </div>
        <AnalyticsDateRange value={range} onChange={setRange} />
      </div>

      {/* Cross-cutting top-line */}
      <section className="space-y-4">
        <h3 className="text-body font-semibold text-mp-gray-900">Сквозной срез AI-запросов</h3>
        {crossCutting.isLoading ? (
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <Card key={i} className="p-5"><Skeleton className="h-4 w-24 mb-3" /><Skeleton className="h-8 w-16" /></Card>)}
          </div>
        ) : crossCutting.data ? (
          <div className="grid grid-cols-3 gap-4">
            <StatCard title="Все AI-запросы" value={crossCutting.data.totals.all} icon={Sparkles} color="blue" />
            <StatCard title="Ассистент (drawer)" value={crossCutting.data.totals.assistant} icon={MessageSquare} color="green" />
            <StatCard title="Чат в уроках" value={crossCutting.data.totals.lessonChat} icon={MessagesSquare} color="pink" />
          </div>
        ) : null}
        <Card className="p-5">
          {crossCutting.isLoading ? <Skeleton className="h-[250px] w-full" /> : (
            <ActivityChartMulti data={crossCutting.data?.byDay ?? []} />
          )}
        </Card>
      </section>

      {/* Section 1 — Пульс */}
      <section className="space-y-4">
        <h3 className="text-body font-semibold text-mp-gray-900">Пульс</h3>
        {pulse.isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="p-5"><Skeleton className="h-4 w-24 mb-3" /><Skeleton className="h-8 w-16" /></Card>
            ))}
          </div>
        ) : pulse.data ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Сообщений" value={pulse.data.kpi.messages} icon={MessageSquare} color="blue" />
            <StatCard title="Уник. юзеров" value={pulse.data.kpi.users} icon={Users} color="green" />
            <StatCard title="Диалогов" value={pulse.data.kpi.conversations} icon={MessagesSquare} color="gray" />
            <StatCard title="Ср. на диалог" value={pulse.data.kpi.avgPerConversation.toFixed(1)} icon={Gauge} color="pink" />
          </div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-5">
            {pulse.isLoading ? <Skeleton className="h-[250px] w-full" /> :
              <ActivityChart data={pulse.data?.messagesByDay ?? []} title="Сообщений в день" color="#2563eb" />}
          </Card>
          <Card className="p-5">
            {pulse.isLoading ? <Skeleton className="h-[250px] w-full" /> :
              <ActivityChart data={pulse.data?.usersByDay ?? []} title="Уник. юзеров в день" color="#16a34a" />}
          </Card>
        </div>
      </section>

      {/* Section 2 — Качество */}
      <section className="space-y-4">
        <h3 className="text-body font-semibold text-mp-gray-900">Качество ответов</h3>
        {quality.isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <Card key={i} className="p-5"><Skeleton className="h-4 w-24 mb-3" /><Skeleton className="h-8 w-16" /></Card>)}
          </div>
        ) : quality.data ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard title="Офф-топик" value={pct(quality.data.offDomainRate)} icon={Gauge} color="gray" trend={`${quality.data.offDomain} из ${quality.data.total}`} />
            <StatCard title="Жалобы" value={pct(quality.data.complaintRate)} icon={Gauge} color="pink" trend={`${quality.data.complaint} из ${quality.data.total}`} />
            <StatCard title="Не смог помочь" value={pct(quality.data.fallbackRate)} icon={Gauge} color="gray" trend={`${quality.data.fallback} из ${quality.data.total}`} />
          </div>
        ) : null}

        <Card className="p-5">
          <h4 className="text-body font-semibold text-mp-gray-900 mb-3">Последние промахи</h4>
          {problems.isLoading ? <Skeleton className="h-24 w-full" /> :
            problems.data && problems.data.items.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-body-sm">
                  <thead><tr className="border-b border-mp-gray-200">
                    <th className="text-left py-2 pr-4 text-mp-gray-500 font-medium">Дата</th>
                    <th className="text-left py-2 px-4 text-mp-gray-500 font-medium">Тип</th>
                    <th className="text-left py-2 pl-4 text-mp-gray-500 font-medium">Запрос</th>
                  </tr></thead>
                  {/* index key: append-only read list, refetched fresh on range change; no stable id from backend */}
                  <tbody>
                    {problems.data.items.map((it, i) => (
                      <tr key={i} className="border-b border-mp-gray-100 last:border-0">
                        <td className="py-2 pr-4 text-mp-gray-600 whitespace-nowrap">{it.date}</td>
                        <td className="py-2 px-4 text-mp-gray-700 whitespace-nowrap">{it.label}</td>
                        <td className="py-2 pl-4 text-mp-gray-900">{it.query || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-body-sm text-mp-gray-500">Промахов за период нет.</p>}
        </Card>
      </section>

      {/* Section 3 — Спрос */}
      <section className="space-y-4">
        <h3 className="text-body font-semibold text-mp-gray-900">Спрос</h3>
        <Card className="p-5">
          <h4 className="text-body font-semibold text-mp-gray-900 mb-3">О чём спрашивают (категории)</h4>
          {demand.isLoading ? <Skeleton className="h-24 w-full" /> :
            demand.data && demand.data.categories.length > 0 ? (
              <table className="w-full text-body-sm">
                <tbody>
                  {demand.data.categories.map((c) => (
                    <tr key={c.category} className="border-b border-mp-gray-100 last:border-0">
                      <td className="py-2 pr-4 text-mp-gray-900">{CATEGORY_LABEL[c.category] ?? c.category}</td>
                      <td className="py-2 pl-4 text-right text-mp-gray-700 tabular-nums">{c.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="text-body-sm text-mp-gray-500">Нет данных за период.</p>}
        </Card>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <TopList title="Топ материалов" rows={demand.data?.topMaterials ?? []} />
          <TopList title="Топ уроков" rows={demand.data?.topLessons ?? []} />
          <TopList title="Топ задач" rows={demand.data?.topJobs ?? []} />
        </div>
      </section>

      {/* Section 4 — Апселл */}
      <section className="space-y-4">
        <div>
          <h3 className="text-body font-semibold text-mp-gray-900">Давление квоты (апселл)</h3>
          <p className="text-body-sm text-mp-gray-500 mt-0.5">Free-юзеры по текущему статусу подписки; «упёрся» = {upsell.data?.cap ?? 5}+ ответов в день</p>
        </div>
        {upsell.isLoading ? (
          <div className="grid grid-cols-2 gap-4">
            {[1, 2].map((i) => <Card key={i} className="p-5"><Skeleton className="h-4 w-24 mb-3" /><Skeleton className="h-8 w-16" /></Card>)}
          </div>
        ) : upsell.data ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <StatCard title="Упёрлись в лимит" value={upsell.data.cappedUsers} icon={Gauge} color="pink" />
              <StatCard title="Повторно упирались" value={upsell.data.repeatCappers} icon={Gauge} color="pink" />
            </div>

            <Card className="p-5">
              <h4 className="text-body font-semibold text-mp-gray-900 mb-3">Распределение дневной нагрузки (free)</h4>
              <table className="w-full text-body-sm">
                <thead><tr className="border-b border-mp-gray-200">
                  <th className="text-left py-2 pr-4 text-mp-gray-500 font-medium">Ответов в день</th>
                  <th className="text-right py-2 pl-4 text-mp-gray-500 font-medium">Юзеро-дней</th>
                </tr></thead>
                <tbody>
                  {upsell.data.loadHistogram.map((b) => (
                    <tr key={b.bucket} className="border-b border-mp-gray-100 last:border-0">
                      <td className="py-2 pr-4 text-mp-gray-900">{b.bucket === upsell.data.cap ? `${b.bucket}+` : b.bucket}</td>
                      <td className="py-2 pl-4 text-right text-mp-gray-700 tabular-nums">{b.userDays}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card className="p-5">
              <h4 className="text-body font-semibold text-mp-gray-900 mb-3">Кандидаты на апселл (топ free по объёму)</h4>
              {upsell.data.candidates.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-body-sm">
                    <thead><tr className="border-b border-mp-gray-200">
                      <th className="text-left py-2 pr-4 text-mp-gray-500 font-medium">Email</th>
                      <th className="text-right py-2 px-4 text-mp-gray-500 font-medium">Всего ответов</th>
                      <th className="text-right py-2 pl-4 text-mp-gray-500 font-medium">Дней упирался</th>
                    </tr></thead>
                    <tbody>
                      {upsell.data.candidates.map((c) => (
                        <tr key={c.userId} className="border-b border-mp-gray-100 last:border-0">
                          <td className="py-2 pr-4 text-mp-gray-900">{c.email || '—'}</td>
                          <td className="py-2 px-4 text-right text-mp-gray-700 tabular-nums">{c.total}</td>
                          <td className="py-2 pl-4 text-right text-mp-gray-700 tabular-nums">{c.daysCapped}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-body-sm text-mp-gray-500">Нет активных free-юзеров ассистента за период.</p>}
            </Card>
          </>
        ) : null}
      </section>

      {/* Section 5 — Чат в уроках */}
      <section className="space-y-4">
        <h3 className="text-body font-semibold text-mp-gray-900">Чат в уроках</h3>
        {chatPulse.isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <Card key={i} className="p-5"><Skeleton className="h-4 w-24 mb-3" /><Skeleton className="h-8 w-16" /></Card>)}
          </div>
        ) : chatPulse.data ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Запросов" value={chatPulse.data.kpi.queries} icon={MessageSquare} color="blue" />
            <StatCard title="Уник. юзеров" value={chatPulse.data.kpi.users} icon={Users} color="green" />
            <StatCard title="Уроков затронуто" value={chatPulse.data.kpi.lessons} icon={MessagesSquare} color="gray" />
            <StatCard title="Ср. на юзера" value={chatPulse.data.kpi.avgPerUser.toFixed(1)} icon={Gauge} color="pink" />
          </div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-5">
            {chatPulse.isLoading ? <Skeleton className="h-[250px] w-full" /> :
              <ActivityChart data={chatPulse.data?.byDay ?? []} title="Запросов в день" color="#db2777" />}
          </Card>
          <div className="grid grid-cols-2 gap-4">
            <StatCard title="«Нет ответа»" value={chatQuality.data ? pct(chatQuality.data.noAnswerRate) : '…'} icon={Gauge} color="pink" trend={chatQuality.data ? `${chatQuality.data.noAnswer} из ${chatQuality.data.total}` : undefined} />
            <StatCard title="Без источников" value={chatQuality.data ? pct(chatQuality.data.noGroundingRate) : '…'} icon={Gauge} color="gray" trend={chatQuality.data ? `${chatQuality.data.noGrounding} из ${chatQuality.data.total}` : undefined} />
          </div>
        </div>

        <TopList title="Топ уроков по вопросам" rows={chatPulse.data?.topLessons ?? []} />

        <Card className="p-5">
          <h4 className="text-body font-semibold text-mp-gray-900 mb-3">Последние «нет ответа»</h4>
          {chatUnanswered.isLoading ? <Skeleton className="h-24 w-full" /> :
            chatUnanswered.data && chatUnanswered.data.items.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-body-sm">
                  <thead><tr className="border-b border-mp-gray-200">
                    <th className="text-left py-2 pr-4 text-mp-gray-500 font-medium">Дата</th>
                    <th className="text-left py-2 px-4 text-mp-gray-500 font-medium">Урок</th>
                    <th className="text-left py-2 pl-4 text-mp-gray-500 font-medium">Вопрос</th>
                  </tr></thead>
                  <tbody>
                    {/* index key: append-only read list, refetched fresh on range change; no stable id from backend */}
                    {chatUnanswered.data.items.map((it, i) => (
                      <tr key={i} className="border-b border-mp-gray-100 last:border-0">
                        <td className="py-2 pr-4 text-mp-gray-600 whitespace-nowrap">{it.date}</td>
                        <td className="py-2 px-4 text-mp-gray-700">{it.lessonTitle}</td>
                        <td className="py-2 pl-4 text-mp-gray-900">{it.query || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-body-sm text-mp-gray-500">Вопросов без ответа за период нет.</p>}
        </Card>
      </section>
    </div>
  );
}
