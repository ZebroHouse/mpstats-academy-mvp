'use client';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import { JobCard } from '@/components/learning/JobCard';
import { LessonCard } from '@/components/learning/LessonCard';

type ViewType = 'all' | 'jobs' | 'lessons';

export default function CollectionPage() {
  const { shelfKey } = useParams<{ shelfKey: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const type = (sp.get('type') as ViewType) ?? 'all';
  const marketplace = (sp.get('marketplace') as 'WB' | 'OZON' | null) ?? undefined;
  const badge = (sp.get('badge') as 'START' | 'NEW' | 'HOT' | 'QUICK' | null) ?? undefined;

  const { data, isLoading } = trpc.dashboard.getCollection.useQuery({ shelfKey, type, marketplace, badge });

  const setParam = (k: string, v?: string) => {
    const next = new URLSearchParams(sp.toString());
    if (v && v !== 'all') next.set(k, v); else next.delete(k);
    router.replace(`/dashboard/collection/${shelfKey}?${next.toString()}`);
  };

  const jobs = data?.jobs ?? [];
  const lessons = data?.lessons ?? [];

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <Link href="/dashboard" className="text-body-sm text-mp-blue-600">‹ Назад на главную</Link>

      <div className="flex flex-wrap gap-2">
        {(['all', 'jobs', 'lessons'] as ViewType[]).map((t) => (
          <button key={t} onClick={() => setParam('type', t)}
            className={`px-3 py-1 rounded-full text-body-sm ${type === t ? 'bg-mp-blue-600 text-white' : 'bg-mp-gray-100 text-mp-gray-600'}`}>
            {t === 'all' ? 'Всё' : t === 'jobs' ? 'Задачи' : 'Уроки'}
          </button>
        ))}
        {(['WB', 'OZON'] as const).map((mp) => (
          <button key={mp} onClick={() => setParam('marketplace', marketplace === mp ? undefined : mp)}
            className={`px-3 py-1 rounded-full text-body-sm ${marketplace === mp ? 'bg-mp-blue-600 text-white' : 'bg-mp-gray-100 text-mp-gray-600'}`}>
            {mp === 'WB' ? 'Wildberries' : 'Ozon'}
          </button>
        ))}
        {(['NEW', 'HOT', 'QUICK'] as const).map((b) => (
          <button key={b} onClick={() => setParam('badge', badge === b ? undefined : b)}
            className={`px-3 py-1 rounded-full text-body-sm ${badge === b ? 'bg-mp-blue-600 text-white' : 'bg-mp-gray-100 text-mp-gray-600'}`}>
            {b === 'QUICK' ? '5 мин' : b}
          </button>
        ))}
      </div>

      {isLoading && <div className="text-body-sm text-mp-gray-500">Загрузка…</div>}

      {type !== 'lessons' && jobs.length > 0 && (
        <section>
          <h2 className="text-heading font-semibold mb-3">Задачи ({jobs.length})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {jobs.map((j) => <JobCard key={j.id} job={j} />)}
          </div>
        </section>
      )}

      {type !== 'jobs' && lessons.length > 0 && (
        <section>
          <h2 className="text-heading font-semibold mb-3">Уроки ({lessons.length})</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {lessons.map((l) => <LessonCard key={l.id} lesson={l} locked={l.locked} context="storefront" />)}
          </div>
        </section>
      )}

      {!isLoading && jobs.length === 0 && lessons.length === 0 && (
        <div className="text-center py-10 text-body-sm text-mp-gray-500">Здесь пока пусто.</div>
      )}
    </div>
  );
}
