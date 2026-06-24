'use client';

import type { Editor } from '@tiptap/react';
import { Button } from '@/components/ui/button';
import { AlignLeft, AlignCenter, AlignRight } from 'lucide-react';

type Props = { editor: Editor };

const PRESETS = ['25%', '50%', '75%', '100%'] as const;

const ALIGNMENTS = [
  { value: 'left', label: 'Выровнять по левому краю', Icon: AlignLeft },
  { value: 'center', label: 'Выровнять по центру', Icon: AlignCenter },
  { value: 'right', label: 'Выровнять по правому краю', Icon: AlignRight },
] as const;

export function ImageToolbar({ editor }: Props) {
  if (!editor.isActive('image')) return null;

  const attrs = editor.getAttributes('image');
  const currentWidth = attrs.width as string | null;
  const currentAlign = attrs.align as string | null;

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
      <span className="mx-1 w-px h-5 bg-mp-gray-200" />
      {ALIGNMENTS.map(({ value, label, Icon }) => (
        <Button
          key={value}
          type="button"
          size="sm"
          variant={currentAlign === value ? 'secondary' : 'ghost'}
          aria-label={label}
          title={label}
          onClick={() => editor.chain().focus().updateAttributes('image', { align: value }).run()}
        >
          <Icon className="w-4 h-4" />
        </Button>
      ))}
    </div>
  );
}
