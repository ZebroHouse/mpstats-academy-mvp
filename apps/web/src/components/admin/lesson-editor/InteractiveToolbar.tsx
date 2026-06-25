'use client';

import type { Editor } from '@tiptap/react';
import { Button } from '@/components/ui/button';

export function InteractiveToolbar({ editor }: { editor: Editor }) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-mp-gray-200 bg-mp-gray-50 p-2">
      <span className="mx-1 text-sm text-mp-gray-600">Интерактив:</span>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => editor.chain().focus().insertRevealGate().run()}
      >
        📖 Читать дальше
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => editor.chain().focus().insertCheckpoint().run()}
      >
        🔀 Развилка
      </Button>
    </div>
  );
}
