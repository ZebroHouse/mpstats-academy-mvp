import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { ImageToolbar } from '@/components/admin/lesson-editor/ImageToolbar';

afterEach(cleanup);

function makeEditor(
  imageSelected: boolean,
  width: string | null = null,
  align: string | null = null,
) {
  const chain: any = {};
  ['focus', 'updateAttributes'].forEach((m) => {
    chain[m] = () => chain;
  });
  chain.run = vi.fn();
  return {
    chain: () => chain,
    isActive: vi.fn((n: string) => (n === 'image' ? imageSelected : false)),
    getAttributes: vi.fn(() => ({ width, align })),
    _chain: chain,
  } as any;
}

describe('ImageToolbar', () => {
  it('renders nothing when no image is selected', () => {
    const { container } = render(<ImageToolbar editor={makeEditor(false)} />);
    expect(container.textContent).toBe('');
  });
  it('applies a width preset on click', () => {
    const editor = makeEditor(true);
    const { getByLabelText } = render(<ImageToolbar editor={editor} />);
    fireEvent.click(getByLabelText('Ширина 50%'));
    expect(editor._chain.run).toHaveBeenCalled();
  });
  it('applies center alignment on click', () => {
    const editor = makeEditor(true);
    const updateSpy = vi.spyOn(editor._chain, 'updateAttributes');
    const { getByLabelText } = render(<ImageToolbar editor={editor} />);
    fireEvent.click(getByLabelText('Выровнять по центру'));
    expect(updateSpy).toHaveBeenCalledWith('image', { align: 'center' });
    expect(editor._chain.run).toHaveBeenCalled();
  });
});
