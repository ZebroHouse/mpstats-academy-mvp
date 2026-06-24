'use client';

import type { Editor } from '@tiptap/react';
import { Button } from '@/components/ui/button';

type Props = { editor: Editor };

const PRESETS = ['25%', '50%', '75%', '100%'] as const;

export function ImageToolbar({ editor }: Props) {
  if (!editor.isActive('image')) return null;

  const currentWidth = editor.getAttributes('image').width as string | null;

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-mp-gray-200 bg-mp-gray-50 p-2">
      <span className="mx-1 text-sm text-mp-gray-600">Размер:</span>
      {PRESETS.map((pct) => (
        <Button
          key={pct}
          type="button"
          size="sm"
          variant={currentWidth === pct ? 'secondary' : 'ghost'}
          aria-label={`Ширина ${pct}`}
          title={`Ширина ${pct}`}
          onClick={() => editor.chain().focus().updateAttributes('image', { width: pct }).run()}
        >
          {pct}
        </Button>
      ))}
      <span className="mx-1 w-px h-5 bg-mp-gray-200" />
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-label="Сбросить размер"
        title="Сбросить размер"
        onClick={() => editor.chain().focus().updateAttributes('image', { width: null }).run()}
      >
        Сброс
      </Button>
    </div>
  );
}
