import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { LessonEditorToolbar } from '@/components/admin/lesson-editor/LessonEditorToolbar';

afterEach(cleanup);

function makeEditor() {
  const chain = {
    focus: () => chain,
    toggleBold: () => chain,
    toggleHeading: () => chain,
    toggleBulletList: () => chain,
    run: vi.fn(),
  };
  return {
    chain: () => chain,
    isActive: vi.fn().mockReturnValue(false),
    _chain: chain,
  } as any;
}

describe('LessonEditorToolbar', () => {
  it('toggles bold on click', () => {
    const editor = makeEditor();
    const { getByLabelText } = render(<LessonEditorToolbar editor={editor} onInsertImage={vi.fn()} />);
    fireEvent.click(getByLabelText('Жирный'));
    expect(editor._chain.run).toHaveBeenCalled();
  });

  it('calls onInsertImage when image button clicked', () => {
    const editor = makeEditor();
    const onInsertImage = vi.fn();
    const { getByLabelText } = render(<LessonEditorToolbar editor={editor} onInsertImage={onInsertImage} />);
    fireEvent.click(getByLabelText('Картинка'));
    expect(onInsertImage).toHaveBeenCalledTimes(1);
  });
});
