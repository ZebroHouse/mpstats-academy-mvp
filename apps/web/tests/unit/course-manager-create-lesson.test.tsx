import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';

const createMutate = vi.fn();
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    useUtils: () => ({ admin: { getCourseLessons: { invalidate: vi.fn() }, getCourses: { invalidate: vi.fn() } } }),
    admin: {
      getCourseLessons: { useQuery: () => ({ data: [] }) },
      createLesson: { useMutation: (opts: any) => ({ mutate: (v: any) => { createMutate(v); opts?.onSuccess?.({ id: 'c1_text_x' }); }, isPending: false }) },
      moveLessonToPosition: { useMutation: () => ({ mutate: vi.fn() }) },
      updateLessonTitle: { useMutation: () => ({ mutate: vi.fn() }) },
      toggleLessonHidden: { useMutation: () => ({ mutate: vi.fn() }) },
    },
  },
}));

import { CreateLessonDialog } from '@/components/admin/CreateLessonDialog';

afterEach(cleanup);
beforeEach(() => { createMutate.mockReset(); pushMock.mockReset(); });

describe('CreateLessonDialog', () => {
  it('creates a TEXT lesson and navigates to its editor', () => {
    const { getByPlaceholderText, getByRole } = render(<CreateLessonDialog courseId="c1" onClose={vi.fn()} />);
    fireEvent.change(getByPlaceholderText('Название урока'), { target: { value: 'Мой урок' } });
    fireEvent.click(getByRole('button', { name: 'Создать' }));
    expect(createMutate).toHaveBeenCalledWith({ courseId: 'c1', title: 'Мой урок', contentType: 'TEXT' });
    expect(pushMock).toHaveBeenCalledWith('/admin/content/lessons/c1_text_x');
  });
});
