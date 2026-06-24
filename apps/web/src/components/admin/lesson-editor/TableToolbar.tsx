'use client';

import type { Editor } from '@tiptap/react';
import { Button } from '@/components/ui/button';
import {
  ArrowLeftToLine, ArrowRightToLine, ArrowUpToLine, ArrowDownToLine,
  Columns3, Rows3, TableCellsMerge, Heading, Trash2,
} from 'lucide-react';

type Props = { editor: Editor };

export function TableToolbar({ editor }: Props) {
  if (!editor.isActive('table')) return null;

  const btn = (label: string, onClick: () => void, Icon: React.ElementType, danger = false) => (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      aria-label={label}
      title={label}
      className={danger ? 'text-red-600 hover:text-red-700' : undefined}
      onClick={onClick}
    >
      <Icon className="w-4 h-4" />
    </Button>
  );

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-mp-gray-200 bg-mp-gray-50 p-2">
      {btn('Столбец слева', () => editor.chain().focus().addColumnBefore().run(), ArrowLeftToLine)}
      {btn('Столбец справа', () => editor.chain().focus().addColumnAfter().run(), ArrowRightToLine)}
      {btn('Удалить столбец', () => editor.chain().focus().deleteColumn().run(), Columns3)}
      <span className="mx-1 w-px h-5 bg-mp-gray-200" />
      {btn('Строка сверху', () => editor.chain().focus().addRowBefore().run(), ArrowUpToLine)}
      {btn('Строка снизу', () => editor.chain().focus().addRowAfter().run(), ArrowDownToLine)}
      {btn('Удалить строку', () => editor.chain().focus().deleteRow().run(), Rows3)}
      <span className="mx-1 w-px h-5 bg-mp-gray-200" />
      {btn('Объединить/разделить ячейки', () => editor.chain().focus().mergeOrSplit().run(), TableCellsMerge)}
      {btn('Сделать строку заголовком', () => editor.chain().focus().toggleHeaderRow().run(), Heading)}
      <span className="mx-1 w-px h-5 bg-mp-gray-200" />
      {btn('Удалить таблицу', () => editor.chain().focus().deleteTable().run(), Trash2, true)}
    </div>
  );
}
