import { describe, it, expect } from 'vitest';
import { generateJSON } from '@tiptap/html';
import { lessonEditorExtensions } from '@/components/admin/lesson-editor/extensions';

// Round-trip: serialize a doc containing interactive nodes to HTML and back,
// confirming the schema accepts revealGate / checkpoint / checkpointOption.
describe('interactive node schema', () => {
  it('parses a doc with a revealGate and a checkpoint', () => {
    const html =
      '<p>intro</p>' +
      '<div data-type="reveal-gate" data-id="g1" data-label="Дальше"></div>' +
      '<div data-type="checkpoint" data-id="cp1">' +
        '<div data-type="checkpoint-option" data-id="o1" data-label="A"><p>branch a</p></div>' +
        '<div data-type="checkpoint-option" data-id="o2" data-label="B"><p>branch b</p></div>' +
      '</div>';
    const json = generateJSON(html, lessonEditorExtensions);
    const types = (json.content ?? []).map((n: { type: string }) => n.type);
    expect(types).toContain('revealGate');
    expect(types).toContain('checkpoint');
    const gate = (json.content ?? []).find((n: { type: string }) => n.type === 'revealGate');
    expect(gate.attrs.id).toBe('g1');
    expect(gate.attrs.buttonLabel).toBe('Дальше');
  });
});
