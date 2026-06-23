'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { JSONContent } from '@tiptap/react';
import { trpc } from '@/lib/trpc/client';
import { LessonEditor } from '@/components/admin/lesson-editor/LessonEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Loader2, ArrowLeft } from 'lucide-react';

export default function AdminLessonEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const utils = trpc.useUtils();

  const lessonQuery = trpc.admin.getLessonForEdit.useQuery({ lessonId: id });
  const [title, setTitle] = useState<string | null>(null);
  const [body, setBody] = useState<JSONContent | null>(null);

  const save = trpc.admin.updateLessonBody.useMutation({
    onError: (e) => toast.error('Ошибка сохранения: ' + e.message),
  });
  const publish = trpc.admin.publishLesson.useMutation({
    onSuccess: (r) => {
      toast.success(`Опубликовано (${r.chunks} фрагментов в индексе)`);
      utils.admin.getLessonForEdit.invalidate({ lessonId: id });
    },
    onError: (e) => toast.error('Ошибка публикации: ' + e.message),
  });

  if (lessonQuery.isLoading)
    return (
      <div className="p-8">
        <Loader2 className="animate-spin" />
      </div>
    );
  if (!lessonQuery.data) return <div className="p-8">Урок не найден</div>;

  const lesson = lessonQuery.data;
  const currentTitle = title ?? lesson.title;
  const currentBody = body ?? (lesson.body as JSONContent | null) ?? { type: 'doc', content: [] };

  const doSave = () =>
    save.mutateAsync({ lessonId: id, title: currentTitle, body: currentBody });

  const handleSaveDraft = async () => {
    await doSave();
    toast.success('Черновик сохранён');
  };

  const handlePublish = async () => {
    // Persist the latest body BEFORE publishing — publishLesson indexes the DB body.
    await doSave();
    await publish.mutateAsync({ lessonId: id });
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1 text-mp-gray-500 text-body-sm"
      >
        <ArrowLeft className="w-4 h-4" /> Назад
      </button>

      <div className="flex items-center justify-between gap-3">
        <Input
          value={currentTitle}
          onChange={(e) => setTitle(e.target.value)}
          className="text-heading font-semibold"
        />
        <span className="text-caption text-mp-gray-500 whitespace-nowrap">
          {lesson.contentStatus === 'PUBLISHED' ? 'Опубликован' : 'Черновик'}
        </span>
      </div>

      <LessonEditor initialBody={lesson.body as JSONContent | null} onChange={setBody} />

      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={handleSaveDraft} disabled={save.isPending}>
          {save.isPending ? 'Сохранение…' : 'Сохранить черновик'}
        </Button>
        <Button
          onClick={handlePublish}
          disabled={publish.isPending || save.isPending}
        >
          {publish.isPending
            ? 'Публикация…'
            : lesson.contentStatus === 'PUBLISHED'
              ? 'Опубликовать изменения'
              : 'Опубликовать'}
        </Button>
      </div>
    </div>
  );
}
