'use client';

import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { Link as LinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Props = { editor: Editor };

export function LinkPopoverButton({ editor }: Props) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click-outside / Escape while open.
  useEffect(() => {
    if (!open) return;

    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const toggleOpen = () => {
    setOpen((prev) => {
      const next = !prev;
      // Pre-fill with the current link href when opening inside a link.
      if (next) setUrl(editor.getAttributes('link').href ?? '');
      return next;
    });
  };

  const apply = () => {
    const href = url.trim();
    if (!href) {
      setOpen(false);
      return;
    }

    const noSelection = editor.state.selection.empty;
    const insideLink = editor.isActive('link');

    if (noSelection && !insideLink) {
      // Nothing to mark — insert the URL as linked text.
      editor
        .chain()
        .focus()
        .insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] })
        .run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    }

    setOpen(false);
  };

  const remove = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setOpen(false);
  };

  const active = editor.isActive('link');

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        size="sm"
        variant={active ? 'secondary' : 'ghost'}
        aria-label="Ссылка"
        title="Ссылка"
        onClick={toggleOpen}
      >
        <LinkIcon className="w-4 h-4" />
      </Button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 flex w-72 flex-col gap-2 rounded-md border border-mp-gray-200 bg-white p-2 shadow-md">
          <Input
            type="url"
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                apply();
              }
            }}
            autoFocus
          />
          <div className="flex items-center justify-between gap-2">
            <Button type="button" size="sm" onClick={apply}>
              Применить
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={remove}>
              Убрать
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
