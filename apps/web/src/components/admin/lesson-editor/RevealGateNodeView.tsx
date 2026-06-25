import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';

export function RevealGateNodeView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const label = (node.attrs.buttonLabel as string) ?? 'Читать дальше';
  return (
    <NodeViewWrapper className="reveal-gate-editor my-4">
      <div
        className="flex items-center gap-2 rounded-lg border-2 border-dashed border-mp-blue-300 bg-mp-blue-50 px-3 py-2"
        contentEditable={false}
      >
        <span className="whitespace-nowrap text-sm text-mp-gray-500">📖 Читать дальше — текст кнопки:</span>
        <input
          className="min-w-0 flex-1 rounded border border-mp-gray-200 px-2 py-1 text-sm"
          value={label}
          onChange={(e) => updateAttributes({ buttonLabel: e.target.value })}
          placeholder="Читать дальше"
        />
        <button type="button" className="whitespace-nowrap text-sm text-red-500" onClick={() => deleteNode()}>
          Удалить
        </button>
      </div>
    </NodeViewWrapper>
  );
}
