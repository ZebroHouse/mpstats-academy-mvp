'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import type { JSONContent } from '@tiptap/react';
import { useRef, useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { toast } from 'sonner';
import { lessonEditorExtensions, EMPTY_DOC } from './extensions';
import { LessonEditorToolbar } from './LessonEditorToolbar';
import { TableToolbar } from './TableToolbar';
import { ImageToolbar } from './ImageToolbar';

type Props = {
  initialBody: JSONContent | null;
  onChange: (doc: JSONContent) => void;
};

export function LessonEditor({ initialBody, onChange }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showMarks, setShowMarks] = useState(false);
  const requestUpload = trpc.admin.requestLessonImageUploadUrl.useMutation();

  const editor = useEditor({
    extensions: lessonEditorExtensions,
    content: initialBody ?? EMPTY_DOC,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getJSON()),
    editorProps: {
      attributes: { class: 'lesson-content max-w-none focus:outline-none min-h-[400px] p-4' },
    },
  });

  const handleFile = async (file: File) => {
    try {
      const { uploadUrl, publicUrl } = await requestUpload.mutateAsync({
        filename: file.name,
        mimeType: file.type as never,
        fileSize: file.size,
      });
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error(`HTTP ${xhr.status}`));
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
      });
      editor?.chain().focus().setImage({ src: publicUrl }).run();
      toast.success('Картинка загружена');
    } catch (e) {
      toast.error('Ошибка загрузки картинки: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  if (!editor) return null;

  return (
    <div
      className={`border border-mp-gray-200 rounded-xl overflow-hidden bg-white ${
        showMarks ? 'lesson-marks-on' : ''
      }`}
    >
      <LessonEditorToolbar
        editor={editor}
        onInsertImage={() => fileInputRef.current?.click()}
        showMarks={showMarks}
        onToggleMarks={() => setShowMarks((v) => !v)}
      />
      <TableToolbar editor={editor} />
      <ImageToolbar editor={editor} />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = '';
        }}
      />
      <EditorContent editor={editor} />
    </div>
  );
}
