import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { LessonEditorToolbar } from '@/components/admin/lesson-editor/LessonEditorToolbar';

afterEach(cleanup);

function makeEditor() {
  const chain: any = { focus: () => chain, toggleBold: () => chain, run: vi.fn() };
  return { chain: () => chain, isActive: vi.fn().mockReturnValue(false), getAttributes: vi.fn(() => ({})) } as any;
}

describe('formatting-marks toggle', () => {
  it('shows the ¶ button only when onToggleMarks is provided and fires it', () => {
    const onToggleMarks = vi.fn();
    const { getByLabelText, queryByLabelText, rerender } = render(
      <LessonEditorToolbar editor={makeEditor()} onInsertImage={vi.fn()} />,
    );
    expect(queryByLabelText('Показать форматирование')).toBeNull();
    rerender(
      <LessonEditorToolbar editor={makeEditor()} onInsertImage={vi.fn()} showMarks={false} onToggleMarks={onToggleMarks} />,
    );
    fireEvent.click(getByLabelText('Показать форматирование'));
    expect(onToggleMarks).toHaveBeenCalledTimes(1);
  });
});
