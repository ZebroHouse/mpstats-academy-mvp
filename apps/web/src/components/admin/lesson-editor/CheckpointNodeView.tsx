import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { interactiveUid } from './interactive-nodes';

export function CheckpointNodeView({ node, editor, getPos }: NodeViewProps) {
  const addOption = () => {
    const pos = typeof getPos === 'function' ? getPos() : null;
    if (typeof pos !== 'number') return;
    // Insert a new option just before the checkpoint's closing token.
    const insertAt = pos + node.nodeSize - 1;
    editor
      .chain()
      .focus()
      .insertContentAt(insertAt, {
        type: 'checkpointOption',
        attrs: { id: interactiveUid(), label: 'Новый вариант' },
        content: [{ type: 'paragraph' }],
      })
      .run();
  };

  return (
    <NodeViewWrapper className="checkpoint-editor my-4 rounded-xl border-2 border-mp-blue-200 bg-mp-blue-50/40 p-4">
      <div className="mb-2 flex items-center justify-between" contentEditable={false}>
        <span className="text-sm font-semibold text-mp-blue-700">🔀 Развилка</span>
        <button type="button" className="text-sm text-mp-blue-600" onClick={addOption}>
          + Вариант
        </button>
      </div>
      <NodeViewContent className="checkpoint-options" />
    </NodeViewWrapper>
  );
}
