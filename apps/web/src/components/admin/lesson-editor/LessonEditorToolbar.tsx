'use client';

import type { Editor } from '@tiptap/react';
import { Button } from '@/components/ui/button';
import {
  Bold, Italic, Heading1, Heading2, Heading3, List, ListOrdered,
  Image as ImageIcon, Table as TableIcon, Quote, Minus, Link as LinkIcon,
} from 'lucide-react';

type Props = { editor: Editor; onInsertImage: () => void };

export function LessonEditorToolbar({ editor, onInsertImage }: Props) {
  const btn = (label: string, active: boolean, onClick: () => void, Icon: React.ElementType) => (
    <Button
      type="button"
      size="sm"
      variant={active ? 'secondary' : 'ghost'}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <Icon className="w-4 h-4" />
    </Button>
  );

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-mp-gray-200 bg-white p-2 sticky top-0 z-10">
      {btn('Жирный', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), Bold)}
      {btn('Курсив', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), Italic)}
      <span className="mx-1 w-px h-5 bg-mp-gray-200" />
      {btn('Заголовок 1', editor.isActive('heading', { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run(), Heading1)}
      {btn('Заголовок 2', editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), Heading2)}
      {btn('Заголовок 3', editor.isActive('heading', { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), Heading3)}
      <span className="mx-1 w-px h-5 bg-mp-gray-200" />
      {btn('Маркированный список', editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), List)}
      {btn('Нумерованный список', editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), ListOrdered)}
      {btn('Цитата', editor.isActive('blockquote'), () => editor.chain().focus().toggleBlockquote().run(), Quote)}
      {btn('Разделитель', false, () => editor.chain().focus().setHorizontalRule().run(), Minus)}
      <span className="mx-1 w-px h-5 bg-mp-gray-200" />
      {btn('Картинка', false, onInsertImage, ImageIcon)}
      {btn('Таблица', false, () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), TableIcon)}
      {btn('Ссылка', editor.isActive('link'), () => {
        const url = window.prompt('URL ссылки:');
        if (url) editor.chain().focus().setLink({ href: url }).run();
      }, LinkIcon)}
    </div>
  );
}
