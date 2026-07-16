'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { ActivityChart } from '@/components/admin/ActivityChart';
import { StatCard } from '@/components/admin/StatCard';
import { AnalyticsDateRange, presetRange, rangeToBounds } from '@/components/admin/AnalyticsDateRange';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageSquare, Users, MessagesSquare, Gauge } from 'lucide-react';

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export default function AssistantAnalyticsPage() {
  const [range, setRange] = useState(presetRange(30));
  const { from, to } = rangeToBounds(range);

  const pulse = trpc.admin.analytics.assistant.getPulse.useQuery({ from, to });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-heading-lg font-bold text-mp-gray-900">Ассистент</h2>
          <p className="text-body-sm text-mp-gray-500 mt-1">
            Adoption, качество ответов, спрос и давление квоты (без тестовых)
          </p>
        </div>
        <AnalyticsDateRange value={range} onChange={setRange} />
      </div>

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
    </div>
  );
}
