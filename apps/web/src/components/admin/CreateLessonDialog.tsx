'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function CreateLessonDialog({ courseId, onClose }: { courseId: string; onClose: () => void }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [title, setTitle] = useState('');

  const create = trpc.admin.createLesson.useMutation({
    onSuccess: (r) => {
      utils.admin.getCourseLessons.invalidate({ courseId });
      utils.admin.getCourses.invalidate();
      router.push(`/admin/content/lessons/${r.id}`);
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-heading font-semibold">Создать урок</h3>
        <Input placeholder="Название урока" value={title} onChange={(e) => setTitle(e.target.value)} />
        <p className="text-sm text-mp-gray-500">Текст и интерактивные блоки добавляются в редакторе урока.</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button disabled={!title.trim() || create.isPending} onClick={() => create.mutate({ courseId, title: title.trim(), contentType: 'TEXT' })}>
            Создать
          </Button>
        </div>
      </div>
    </div>
  );
}
