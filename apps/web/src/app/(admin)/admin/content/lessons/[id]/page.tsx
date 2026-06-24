'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { JSONContent } from '@tiptap/react';
import { trpc } from '@/lib/trpc/client';
import { LessonEditor } from '@/components/admin/lesson-editor/LessonEditor';
import { LessonBodyRenderer } from '@/components/learning/LessonBodyRenderer';
import { DeleteLessonDialog } from '@/components/admin/DeleteLessonDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, Trash2, Pencil, Eye } from 'lucide-react';

export default function AdminLessonEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const utils = trpc.useUtils();

  const lessonQuery = trpc.admin.getLessonForEdit.useQuery({ lessonId: id });
  const [title, setTitle] = useState<string | null>(null);
  const [body, setBody] = useState<JSONContent | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');

  const remove = trpc.admin.deleteLesson.useMutation({
    onSuccess: () => {
      toast.success('Урок удалён');
      router.push('/admin/content');
    },
    onError: (e) => toast.error('Ошибка удаления: ' + e.message),
  });

  const save = trpc.admin.updateLessonBody.useMutation({
    onSuccess: () => {
      // Refresh the cached lesson so re-entering the editor shows the saved body
      // (avoids the stale-cache "I saved but see old content" race).
      utils.admin.getLessonForEdit.invalidate({ lessonId: id });
    },
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

      {/* Edit / Preview toggle — preview shows the exact student view of the
          current (incl. unsaved) body: real clickable links + final layout. */}
      <div className="inline-flex rounded-lg border border-mp-gray-200 bg-white p-0.5">
        <button
          onClick={() => setMode('edit')}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-body-sm font-medium transition-colors ${
            mode === 'edit' ? 'bg-mp-blue-500 text-white' : 'text-mp-gray-600 hover:bg-mp-gray-50'
          }`}
        >
          <Pencil className="w-3.5 h-3.5" /> Редактор
        </button>
        <button
          onClick={() => setMode('preview')}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-body-sm font-medium transition-colors ${
            mode === 'preview' ? 'bg-mp-blue-500 text-white' : 'text-mp-gray-600 hover:bg-mp-gray-50'
          }`}
        >
          <Eye className="w-3.5 h-3.5" /> Предпросмотр
        </button>
      </div>

      {mode === 'edit' ? (
        <LessonEditor initialBody={currentBody} onChange={setBody} />
      ) : (
        <div className="rounded-xl border border-mp-gray-200 bg-white p-6">
          <LessonBodyRenderer doc={currentBody} />
        </div>
      )}

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

        <Button
          variant="ghost"
          onClick={() => setDeleteOpen(true)}
          disabled={remove.isPending}
          className="ml-auto text-red-600 hover:bg-red-50 hover:text-red-700"
        >
          <Trash2 className="w-4 h-4 mr-1" /> Удалить урок
        </Button>
      </div>

      {deleteOpen && (
        <DeleteLessonDialog
          lessonTitle={currentTitle}
          isDeleting={remove.isPending}
          onConfirm={() => remove.mutate({ lessonId: id })}
          onClose={() => setDeleteOpen(false)}
        />
      )}
    </div>
  );
}
