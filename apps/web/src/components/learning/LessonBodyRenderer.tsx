'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import type { JSONContent } from '@tiptap/react';
import { lessonEditorExtensions } from '@/components/admin/lesson-editor/extensions';

// Read-only render of a lesson body. Same extensions as the editor → one source of truth.
// Phase B adds interactive node views here without changing the call site.
export function LessonBodyRenderer({ doc }: { doc: JSONContent | null }) {
  const editor = useEditor(
    {
      extensions: lessonEditorExtensions,
      content: doc ?? { type: 'doc', content: [] },
      editable: false,
      immediatelyRender: false,
      editorProps: { attributes: { class: 'prose prose-sm max-w-none' } },
    },
    [doc],
  );

  if (!doc || !editor) return null;
  return <EditorContent editor={editor} />;
}
