'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import type { JSONContent } from '@tiptap/react';
import { lessonEditorExtensions } from '@/components/admin/lesson-editor/extensions';

// Read-only render of a lesson body. Same extensions as the editor → one source of truth.
// Phase B adds interactive node views here without changing the call site.
export function LessonBodyRenderer({ doc }: { doc: JSONContent | null }) {
  // Serialize the doc so we can detect *real* content changes cheaply.
  const json = useMemo(() => JSON.stringify(doc ?? { type: 'doc', content: [] }), [doc]);

  // Create the editor ONCE — no `[doc]` dependency. Previously the editor was
  // rebuilt on every render because the caller passes a fresh `doc` object each
  // time (e.g. every interactive reveal re-renders the whole lesson). Rebuilding
  // tears down and recreates the ProseMirror DOM; with immediatelyRender:false
  // the content re-appears a frame later, so the page height collapses and
  // snaps back — which yanked the scroll position on every reveal. Keeping one
  // instance and pushing content only when it truly changes keeps layout stable.
  const editor = useEditor({
    extensions: lessonEditorExtensions,
    content: doc ?? { type: 'doc', content: [] },
    editable: false,
    immediatelyRender: false,
    editorProps: { attributes: { class: 'lesson-content max-w-none' } },
  });

  const lastJson = useRef(json);
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (lastJson.current === json) return;
    lastJson.current = json;
    editor.commands.setContent(doc ?? { type: 'doc', content: [] }, { emitUpdate: false });
  }, [editor, json, doc]);

  if (!doc || !editor) return null;
  return <EditorContent editor={editor} />;
}
