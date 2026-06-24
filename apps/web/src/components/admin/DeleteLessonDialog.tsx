'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface DeleteLessonDialogProps {
  lessonTitle: string;
  isDeleting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Very explicit, gated confirmation for permanently deleting a text/interactive
 * lesson. Unlike Kinescope video lessons, these live in our DB — deleting wipes
 * the lesson, its text/images and the AI-index. The destructive button stays
 * disabled until the user ticks the acknowledge checkbox.
 */
export function DeleteLessonDialog({
  lessonTitle,
  isDeleting,
  onConfirm,
  onClose,
}: DeleteLessonDialogProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl p-6 w-full max-w-md space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 text-red-600">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <h3 className="text-heading font-semibold">Удалить урок безвозвратно?</h3>
        </div>

        <p className="text-body-md font-semibold text-mp-gray-900 break-words">
          {lessonTitle}
        </p>

        <p className="text-body-sm text-mp-gray-600">
          Урок, его текст, изображения и AI-индекс будут удалены из базы данных
          навсегда. Это действие нельзя отменить.
        </p>

        <label className="flex items-start gap-2 text-body-sm text-mp-gray-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="w-4 h-4 mt-0.5"
          />
          Я понимаю, что удаление безвозвратно
        </label>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={isDeleting}>
            Отмена
          </Button>
          <Button
            variant="destructive"
            disabled={!acknowledged || isDeleting}
            onClick={onConfirm}
          >
            {isDeleting ? 'Удаление…' : 'Удалить навсегда'}
          </Button>
        </div>
      </div>
    </div>
  );
}
