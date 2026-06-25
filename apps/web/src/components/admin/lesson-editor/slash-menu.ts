import { Extension } from '@tiptap/core';
import Suggestion, {
  type SuggestionProps,
  type SuggestionKeyDownProps,
} from '@tiptap/suggestion';
import { ReactRenderer } from '@tiptap/react';
import type { Editor, Range } from '@tiptap/core';
import { SlashMenuList, type SlashItem, type SlashMenuRef } from './SlashMenuList';

// Minimal slash menu: only the two interactive blocks (the novel inserts).
// Typing "/" opens it; arrows + Enter or click insert.
// Uses TipTap v3's managed `mount` API (props.mount) — the plugin appends the
// element to document.body, anchors it to the cursor, and repositions on
// scroll/resize via Floating UI. We return the unmount fn from onExit.
export const SlashCommands = Extension.create({
  name: 'slashCommands',
  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        char: '/',
        startOfLine: false,
        command: ({ editor, range, props }: { editor: Editor; range: Range; props: SlashItem }) => {
          editor.chain().focus().deleteRange(range).run();
          props.run();
        },
        items: ({ editor, query }): SlashItem[] => {
          const all: SlashItem[] = [
            {
              title: '📖 Читать дальше (гейт)',
              run: () => editor.chain().focus().insertRevealGate().run(),
            },
            {
              title: '🔀 Развилка (чекпоинт)',
              run: () => editor.chain().focus().insertCheckpoint().run(),
            },
          ];
          const q = query.toLowerCase();
          return all.filter((i) => i.title.toLowerCase().includes(q));
        },
        render: () => {
          let component: ReactRenderer<SlashMenuRef, { items: SlashItem[] }> | null = null;
          let unmount: (() => void) | null = null;

          return {
            onStart: (props: SuggestionProps<SlashItem, SlashItem>) => {
              component = new ReactRenderer(SlashMenuList, {
                props,
                editor: props.editor,
              });
              unmount = props.mount(component.element);
            },
            onUpdate: (props: SuggestionProps<SlashItem, SlashItem>) => {
              component?.updateProps(props);
            },
            onKeyDown: (props: SuggestionKeyDownProps) => {
              if (props.event.key === 'Escape') return true;
              return component?.ref?.onKeyDown(props) ?? false;
            },
            onExit: () => {
              unmount?.();
              component?.destroy();
              unmount = null;
              component = null;
            },
          };
        },
      }),
    ];
  },
});
