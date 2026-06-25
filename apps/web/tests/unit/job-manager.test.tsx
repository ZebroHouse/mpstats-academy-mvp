import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';

// Mutable mock state — reassigned per test before render, mirroring
// checkpoint-analytics-view.test.tsx / AgentSearch.test.tsx.
let mockJobs: { data: unknown; isLoading: boolean; error: unknown };
let mockJobLessons: { data: unknown; isLoading: boolean; error: unknown };
let mockSearch: { data: unknown; isLoading: boolean; error: unknown };

const setPublishedMutate = vi.fn();
const reembedMutate = vi.fn();
const reorderMutate = vi.fn();
const removeMutate = vi.fn();
const addMutate = vi.fn();
const createMutate = vi.fn();

const invalidate = vi.fn();

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    useUtils: () => ({
      admin: {
        job: {
          getJobs: { invalidate },
          getJobLessons: { invalidate },
        },
      },
    }),
    admin: {
      job: {
        getJobs: { useQuery: () => mockJobs },
        getJobLessons: { useQuery: () => mockJobLessons },
        searchLessons: { useQuery: () => mockSearch },
        setJobPublished: {
          useMutation: () => ({ mutate: setPublishedMutate, isPending: false }),
        },
        reembedJob: { useMutation: () => ({ mutate: reembedMutate, isPending: false }) },
        reorderJobLesson: {
          useMutation: () => ({ mutate: reorderMutate, isPending: false }),
        },
        removeJobLesson: {
          useMutation: () => ({ mutate: removeMutate, isPending: false }),
        },
        addJobLesson: { useMutation: () => ({ mutate: addMutate, isPending: false }) },
        createJob: { useMutation: () => ({ mutate: createMutate, isPending: false }) },
      },
    },
  },
}));

import { JobManager } from '@/components/admin/JobManager';
import { CreateJobDialog } from '@/components/admin/CreateJobDialog';

const sampleJobs = [
  {
    id: 'j1',
    slug: 'nastroit-reklamu',
    title: 'Настроить рекламу',
    marketplace: 'WB',
    displayOrder: 0,
    isPublished: true,
    lessonCount: 2,
    hasEmbedding: true,
  },
  {
    id: 'j2',
    slug: 'analiz-konkurentov',
    title: 'Анализ конкурентов',
    marketplace: 'BOTH',
    displayOrder: 1,
    isPublished: false,
    lessonCount: 0,
    hasEmbedding: false,
  },
];

const sampleLessons = [
  {
    lessonId: 'l1',
    title: 'Урок про автобидер',
    order: 0,
    courseTitle: 'Реклама',
    isHidden: false,
    contentType: 'VIDEO',
  },
  {
    lessonId: 'l2',
    title: 'Скрытый урок',
    order: 1,
    courseTitle: 'Реклама',
    isHidden: true,
    contentType: 'TEXT',
  },
];

const sampleSearch = [
  {
    lessonId: 'l3',
    title: 'Новый урок про ставки',
    courseTitle: 'Аналитика',
    isHidden: false,
    contentType: 'VIDEO',
  },
];

beforeEach(() => {
  mockJobs = { data: sampleJobs, isLoading: false, error: null };
  mockJobLessons = { data: sampleLessons, isLoading: false, error: null };
  mockSearch = { data: sampleSearch, isLoading: false, error: null };
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  cleanup();
  vi.clearAllMocks();
});

describe('JobManager', () => {
  it('renders the job list with lesson count and marketplace', () => {
    const { getByText } = render(<JobManager />);
    expect(getByText('Настроить рекламу')).toBeDefined();
    expect(getByText('Анализ конкурентов')).toBeDefined();
    expect(getByText('2 уроков')).toBeDefined();
    // BOTH marketplace renders the combined label.
    expect(getByText('WB + OZON')).toBeDefined();
    // Job without an embedding gets the warning badge.
    expect(getByText('без эмбеддинга')).toBeDefined();
  });

  it('expanding a job shows its ordered lessons', () => {
    const { getByText, queryByText } = render(<JobManager />);
    // Lessons not visible before expand.
    expect(queryByText('Урок про автобидер')).toBeNull();
    fireEvent.click(getByText('Настроить рекламу'));
    expect(getByText('Урок про автобидер')).toBeDefined();
    expect(getByText('Скрытый урок')).toBeDefined();
    // Hidden lesson is tagged.
    expect(getByText('скрыт')).toBeDefined();
  });

  it('toggling the publish switch calls setJobPublished', () => {
    const { container } = render(<JobManager />);
    const switches = container.querySelectorAll('button[role="switch"]');
    expect(switches.length).toBeGreaterThan(0);
    fireEvent.click(switches[0]);
    expect(setPublishedMutate).toHaveBeenCalled();
    expect(setPublishedMutate.mock.calls[0][0]).toMatchObject({ jobId: 'j1' });
  });

  it('typing in the add-lesson search queries searchLessons and selecting a result calls addJobLesson', () => {
    const { getByText, getByPlaceholderText } = render(<JobManager />);
    fireEvent.click(getByText('Настроить рекламу'));
    fireEvent.click(getByText('Добавить урок'));

    const input = getByPlaceholderText('Поиск урока по названию…');
    fireEvent.change(input, { target: { value: 'ставки' } });
    // Advance past the 300ms debounce so the query becomes enabled.
    act(() => {
      vi.advanceTimersByTime(350);
    });

    const result = getByText('Новый урок про ставки');
    fireEvent.click(result);
    expect(addMutate).toHaveBeenCalledWith({ jobId: 'j1', lessonId: 'l3' });
  });

  it('clicking the down arrow reorders the first lesson', () => {
    const { getByText, getAllByTitle } = render(<JobManager />);
    fireEvent.click(getByText('Настроить рекламу'));
    const downButtons = getAllByTitle('Ниже');
    fireEvent.click(downButtons[0]);
    expect(reorderMutate).toHaveBeenCalledWith({
      jobId: 'j1',
      lessonId: 'l1',
      targetOrder: 1,
    });
  });
});

describe('CreateJobDialog', () => {
  it('disables submit until required fields are filled, then calls createJob', () => {
    const { getByText, getByPlaceholderText } = render(
      <CreateJobDialog onClose={vi.fn()} />,
    );

    const submit = getByText('Создать') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.change(getByPlaceholderText('naprimer-nastroit-reklamu'), {
      target: { value: 'novaya-zadacha' },
    });
    fireEvent.change(getByPlaceholderText('Название задачи'), {
      target: { value: 'Новая задача' },
    });
    fireEvent.change(
      getByPlaceholderText('Краткое описание задачи (используется для AI-поиска)'),
      { target: { value: 'Описание' } },
    );
    // Still disabled — no axis selected yet.
    expect(submit.disabled).toBe(true);

    fireEvent.click(getByText('Маркетинг'));
    expect(submit.disabled).toBe(false);

    fireEvent.click(submit);
    expect(createMutate).toHaveBeenCalledWith({
      slug: 'novaya-zadacha',
      title: 'Новая задача',
      description: 'Описание',
      marketplace: 'WB',
      axes: ['MARKETING'],
    });
  });
});
