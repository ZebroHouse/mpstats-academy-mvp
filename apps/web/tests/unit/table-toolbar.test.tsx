import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { TableToolbar } from '@/components/admin/lesson-editor/TableToolbar';

afterEach(cleanup);

function makeEditor(inTable: boolean) {
  const chain: any = {};
  ['focus','addColumnBefore','addColumnAfter','deleteColumn','addRowBefore','addRowAfter','deleteRow','mergeOrSplit','toggleHeaderRow','deleteTable'].forEach((m) => { chain[m] = () => chain; });
  chain.run = vi.fn();
  return { chain: () => chain, isActive: vi.fn((n: string) => n === 'table' ? inTable : false), _chain: chain } as any;
}

describe('TableToolbar', () => {
  it('renders nothing when not in a table', () => {
    const { container } = render(<TableToolbar editor={makeEditor(false)} />);
    expect(container.textContent).toBe('');
  });
  it('shows controls in a table and deletes a row on click', () => {
    const editor = makeEditor(true);
    const { getByLabelText } = render(<TableToolbar editor={editor} />);
    fireEvent.click(getByLabelText('Удалить строку'));
    expect(editor._chain.run).toHaveBeenCalled();
  });
});
