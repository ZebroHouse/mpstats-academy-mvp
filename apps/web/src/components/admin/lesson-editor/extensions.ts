import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
// TipTap v3 ships the table extensions as named exports (no default on the main package).
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import type { Extensions } from '@tiptap/react';
import { RevealGate, Checkpoint, CheckpointOption } from './interactive-nodes';

// Custom Image node: adds a `width` attribute (rendered as inline style) so editors can
// resize images via width presets. Node name stays `image`, so setImage + updateAttributes
// keep working, and the read-only renderer (same extensions) renders the width for students.
const LessonImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).style.width || el.getAttribute('width') || null,
        renderHTML: (attrs) => (attrs.width ? { style: `width: ${attrs.width}` } : {}),
      },
      // Alignment rendered as data-align (not inline style) so it never conflicts with width.
      align: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-align') || null,
        renderHTML: (attrs) => (attrs.align ? { 'data-align': attrs.align } : {}),
      },
    };
  },
});

// Single source of truth for block set — used by both editor and read-only renderer.
// Note: TipTap v3 bundles Link inside StarterKit, so it's configured there (not a
// separate extension) to avoid a duplicate-extension conflict. Image is not bundled.
export const lessonEditorExtensions: Extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: {
      openOnClick: false,
      autolink: true,
      HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer nofollow' },
    },
  }),
  LessonImage.configure({ inline: false, allowBase64: false }),
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  RevealGate,
  Checkpoint,
  CheckpointOption,
];

export const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };
