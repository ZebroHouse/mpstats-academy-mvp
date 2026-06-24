import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { DeleteLessonDialog } from '@/components/admin/DeleteLessonDialog';

afterEach(cleanup);

describe('DeleteLessonDialog', () => {
  it('keeps confirm disabled until the acknowledge checkbox is checked', () => {
    const onConfirm = vi.fn();
    const { getByRole, getByLabelText } = render(
      <DeleteLessonDialog lessonTitle="Мой урок" isDeleting={false} onConfirm={onConfirm} onClose={vi.fn()} />,
    );
    const btn = getByRole('button', { name: 'Удалить навсегда' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(onConfirm.mock.calls.length ? btn : getByLabelText(/безвозвратно/i));
    fireEvent.click(btn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
