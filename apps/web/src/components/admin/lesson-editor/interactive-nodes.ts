import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { RevealGateNodeView } from './RevealGateNodeView';
import { CheckpointNodeView } from './CheckpointNodeView';
import { CheckpointOptionNodeView } from './CheckpointOptionNodeView';

export function interactiveUid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}`;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    interactiveLessons: {
      insertRevealGate: () => ReturnType;
      insertCheckpoint: () => ReturnType;
    };
  }
}

const idAttr = {
  default: null as string | null,
  parseHTML: (el: HTMLElement) => el.getAttribute('data-id'),
  renderHTML: (attrs: { id?: string | null }) => (attrs.id ? { 'data-id': attrs.id } : {}),
};

export const RevealGate = Node.create({
  name: 'revealGate',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      id: idAttr,
      buttonLabel: {
        default: 'Читать дальше',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-label') ?? 'Читать дальше',
        renderHTML: (attrs: { buttonLabel?: string }) => ({ 'data-label': attrs.buttonLabel ?? 'Читать дальше' }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="reveal-gate"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'reveal-gate' })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(RevealGateNodeView);
  },
  addCommands() {
    return {
      insertRevealGate:
        () =>
        ({ commands, editor }) => {
          void editor;
          return commands.insertContent({
            type: 'revealGate',
            attrs: { id: interactiveUid(), buttonLabel: 'Читать дальше' },
          });
        },
    };
  },
});

export const CheckpointOption = Node.create({
  name: 'checkpointOption',
  content: 'block+',
  defining: true,
  isolating: true,
  addAttributes() {
    return {
      id: idAttr,
      label: {
        default: 'Вариант',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-label') ?? 'Вариант',
        renderHTML: (attrs: { label?: string }) => ({ 'data-label': attrs.label ?? 'Вариант' }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="checkpoint-option"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'checkpoint-option' }), 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(CheckpointOptionNodeView);
  },
});

export const Checkpoint = Node.create({
  name: 'checkpoint',
  group: 'block',
  content: 'checkpointOption+',
  defining: true,
  isolating: true,
  addAttributes() {
    return { id: idAttr };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="checkpoint"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'checkpoint' }), 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(CheckpointNodeView);
  },
  addCommands() {
    return {
      insertCheckpoint:
        () =>
        ({ commands, state }) => {
          const { $from } = state.selection;
          for (let d = $from.depth; d > 0; d--) {
            if ($from.node(d).type.name === 'checkpoint') return false;
          }
          return commands.insertContent({
            type: 'checkpoint',
            attrs: { id: interactiveUid() },
            content: [
              { type: 'checkpointOption', attrs: { id: interactiveUid(), label: 'Вариант 1' }, content: [{ type: 'paragraph' }] },
              { type: 'checkpointOption', attrs: { id: interactiveUid(), label: 'Вариант 2' }, content: [{ type: 'paragraph' }] },
            ],
          });
        },
    };
  },
});
