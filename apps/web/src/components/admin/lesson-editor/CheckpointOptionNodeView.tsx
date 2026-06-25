import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';

export function CheckpointOptionNodeView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const label = (node.attrs.label as string) ?? '';
  return (
    <NodeViewWrapper className="checkpoint-option-editor mt-3 rounded-lg border border-mp-gray-200 bg-white p-3">
      <div className="mb-2 flex items-center gap-2" contentEditable={false}>
        <span className="whitespace-nowrap text-xs font-medium text-mp-gray-500">Текст кнопки варианта:</span>
        <input
          className="min-w-0 flex-1 rounded border border-mp-gray-200 px-2 py-1 text-sm"
          value={label}
          onChange={(e) => updateAttributes({ label: e.target.value })}
          placeholder="Например: Космонавт"
        />
        <button type="button" className="whitespace-nowrap text-xs text-red-500" onClick={() => deleteNode()}>
          Убрать вариант
        </button>
      </div>
      <NodeViewContent className="checkpoint-option-content" />
    </NodeViewWrapper>
  );
}
