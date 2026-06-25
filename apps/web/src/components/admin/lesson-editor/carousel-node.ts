import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ImageCarouselNodeView } from './ImageCarouselNodeView';
import { interactiveUid, idAttr } from './interactive-nodes';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    imageCarousel: {
      insertImageCarousel: () => ReturnType;
    };
  }
}

// Atom block node holding an ordered list of images. The images live in the body
// Json (round-tripped via a `data-images` JSON attribute) — no backend storage.
// The React node-view renders authoring chrome in the editor and a student
// carousel in the read-only renderer (branch on editor.isEditable).
export const ImageCarousel = Node.create({
  name: 'imageCarousel',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      id: idAttr,
      images: {
        default: [] as { src: string; alt: string }[],
        parseHTML: (el: HTMLElement) => {
          try {
            const parsed = JSON.parse(el.getAttribute('data-images') ?? '[]');
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        },
        renderHTML: (attrs: { images?: unknown }) => ({
          'data-images': JSON.stringify(Array.isArray(attrs.images) ? attrs.images : []),
        }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="image-carousel"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'image-carousel' })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageCarouselNodeView);
  },
  addCommands() {
    return {
      insertImageCarousel:
        () =>
        ({ commands }) =>
          commands.insertContent({
            type: 'imageCarousel',
            attrs: { id: interactiveUid(), images: [] },
          }),
    };
  },
});
