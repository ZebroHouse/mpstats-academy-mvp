'use client';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { useParams } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';

export default function JobPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: job, isLoading } = trpc.job.getJob.useQuery({ slug });

  const utils = trpc.useUtils();
  const addToTrack = trpc.learning.addJobToTrack.useMutation({
    onSuccess: () => {
      utils.job.getJob.invalidate({ slug });
      utils.learning.getRecommendedPath.invalidate();
      toast.success('Джоба добавлена в трек');
    },
    onError: () => toast.error('Не удалось добавить в трек'),
  });
  const removeFromTrack = trpc.learning.removeJobFromTrack.useMutation({
    onSuccess: () => {
      utils.job.getJob.invalidate({ slug });
      utils.learning.getRecommendedPath.invalidate();
      toast.success('Джоба убрана из трека');
    },
    onError: () => toast.error('Не удалось убрать из трека'),
  });

  if (isLoading) return <div className="p-8 text-center text-mp-gray-500">Загрузка...</div>;
  if (!job) notFound();

  const pct = job.lessonCount > 0 ? Math.round((job.completedLessons / job.lessonCount) * 100) : 0;
  const nextLesson = job.lessons.find((l) => l.status !== 'COMPLETED' && !l.locked);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="text-body-sm text-mp-gray-400">
        <Link href="/learn" className="hover:text-mp-gray-600">Каталог</Link> · {job.title}
      </div>

      <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
        <div>
          {job.marketplace === 'BOTH' && (
            <span className="text-caption font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-700">WB + Ozon</span>
          )}
          <h1 className="text-display-sm text-mp-gray-900 mt-2">{job.title}</h1>
          <p className="text-body text-mp-gray-500 mt-1 max-w-2xl">{job.description}</p>
          <p className="text-body-sm text-mp-gray-400 mt-2">
            {job.lessonCount} уроков · прогресс {job.completedLessons}/{job.lessonCount}
          </p>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          {nextLesson && (
            <Link href={`/learn/${nextLesson.id}`}>
              <Button className="w-full">Продолжить джобу →</Button>
            </Link>
          )}
          {job.isInTrack ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => removeFromTrack.mutate({ jobId: job.id })}
              disabled={removeFromTrack.isPending}
            >
              В треке ✓ · убрать
            </Button>
          ) : (
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => addToTrack.mutate({ jobId: job.id })}
              disabled={addToTrack.isPending}
            >
              + В трек
            </Button>
          )}
        </div>
      </div>

      <div className="h-2 bg-mp-gray-200 rounded-full overflow-hidden">
        <div className="h-full bg-mp-green-500 rounded-full" style={{ width: `${pct}%` }} />
      </div>

      {job.outcomes.length > 0 && (
        <div>
          <h2 className="text-heading font-bold text-mp-gray-900 mb-2">Что ты сможешь после</h2>
          <ul className="text-body-sm text-mp-gray-600 space-y-1">
            {job.outcomes.map((o, i) => <li key={i}>· {o}</li>)}
          </ul>
        </div>
      )}

      <div>
        <h2 className="text-heading font-bold text-mp-gray-900 mb-2">Уроки джобы — по порядку</h2>
        <div className="bg-white border border-mp-gray-200 rounded-xl overflow-hidden">
          {job.lessons.map((l, i) => (
            <Link
              key={l.id}
              href={l.locked ? '#' : `/learn/${l.id}`}
              className={`flex items-center gap-3 px-4 py-2.5 border-t border-mp-gray-100 first:border-t-0 ${l.locked ? 'opacity-50 pointer-events-none' : 'hover:bg-mp-gray-50 group'}`}
            >
              <span className="text-caption text-mp-gray-400 w-5 font-semibold">{i + 1}</span>
              <span className={`w-3.5 h-3.5 rounded-full shrink-0 ${l.status === 'COMPLETED' ? 'bg-mp-green-500' : l.status === 'IN_PROGRESS' ? 'border-2 border-mp-blue-500' : 'border-2 border-mp-gray-300'}`} />
              <span className="text-body-sm text-mp-gray-900 flex-1">{l.title}</span>
              <span className="text-caption text-mp-gray-400">{l.durationMin} мин</span>
              {!l.locked && <ChevronRight className="w-4 h-4 text-mp-gray-300 group-hover:text-mp-gray-600 transition-colors" />}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
