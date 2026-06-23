import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
// TipTap v3 ships the table extensions as named exports (no default on the main package).
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import type { Extensions } from '@tiptap/react';

// Single source of truth for block set — used by both editor and read-only renderer.
// Note: TipTap v3 bundles Link inside StarterKit, so it's configured there (not a
// separate extension) to avoid a duplicate-extension conflict. Image is not bundled.
export const lessonEditorExtensions: Extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: { openOnClick: false, autolink: true },
  }),
  Image.configure({ inline: false, allowBase64: false }),
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
];

export const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };
