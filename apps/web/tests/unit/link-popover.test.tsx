import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { LinkPopoverButton } from '@/components/admin/lesson-editor/LinkPopoverButton';

afterEach(cleanup);

function makeEditor() {
  const chain: any = {};
  ['focus', 'extendMarkRange', 'setLink', 'unsetLink', 'insertContent'].forEach((m) => {
    chain[m] = () => chain;
  });
  chain.run = vi.fn();
  return {
    chain: () => chain,
    isActive: vi.fn().mockReturnValue(false),
    getAttributes: vi.fn().mockReturnValue({}),
    state: { selection: { empty: true } },
    _chain: chain,
  } as any;
}

describe('link popover', () => {
  it('opens, applies a URL, and runs the chain', () => {
    const editor = makeEditor();
    const { getByLabelText, getByPlaceholderText, getByRole } = render(
      <LinkPopoverButton editor={editor} />,
    );
    fireEvent.click(getByLabelText('Ссылка'));
    fireEvent.change(getByPlaceholderText(/https/i), {
      target: { value: 'https://mpstats.io' },
    });
    fireEvent.click(getByRole('button', { name: 'Применить' }));
    expect(editor._chain.run).toHaveBeenCalled();
  });

  it('removes a link via «Убрать» and runs the chain', () => {
    const editor = makeEditor();
    const { getByLabelText, getByRole } = render(<LinkPopoverButton editor={editor} />);
    fireEvent.click(getByLabelText('Ссылка'));
    fireEvent.click(getByRole('button', { name: 'Убрать' }));
    expect(editor._chain.run).toHaveBeenCalled();
  });

  it('does not run the chain when applying an empty URL', () => {
    const editor = makeEditor();
    const { getByLabelText, getByRole } = render(<LinkPopoverButton editor={editor} />);
    fireEvent.click(getByLabelText('Ссылка'));
    fireEvent.click(getByRole('button', { name: 'Применить' }));
    expect(editor._chain.run).not.toHaveBeenCalled();
  });
});
