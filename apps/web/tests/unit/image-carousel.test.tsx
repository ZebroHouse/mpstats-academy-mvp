import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';

// The carousel node-view creates trpc.admin.requestLessonImageUploadUrl.useMutation()
// unconditionally (Rules of Hooks). On the student (read-only) render it's never
// invoked, but the hook must still resolve to a stub or the node-view mount crashes.
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    admin: {
      requestLessonImageUploadUrl: {
        useMutation: () => ({ mutateAsync: vi.fn() }),
      },
    },
  },
}));

import { LessonBodyRenderer } from '@/components/learning/LessonBodyRenderer';
import { nextIndex } from '@/components/admin/lesson-editor/ImageCarouselNodeView';

afterEach(cleanup);

const docWith = (images: { src: string; alt: string }[]) => ({
  type: 'doc',
  content: [{ type: 'imageCarousel', attrs: { id: 'g1', images } }],
});

describe('nextIndex (wrap-around)', () => {
  it('wraps forward past the last index', () => {
    expect(nextIndex(2, 3, 1)).toBe(0);
  });
  it('wraps backward past the first index', () => {
    expect(nextIndex(0, 3, -1)).toBe(2);
  });
  it('advances normally in the middle', () => {
    expect(nextIndex(1, 3, 1)).toBe(2);
    expect(nextIndex(1, 3, -1)).toBe(0);
  });
  it('returns 0 for an empty gallery', () => {
    expect(nextIndex(0, 0, 1)).toBe(0);
  });
});

describe('ImageCarousel student render', () => {
  it('shows the active image plus arrows and dots for >1 image', async () => {
    const { container, findByAltText } = render(
      <LessonBodyRenderer
        doc={docWith([
          { src: 'https://x/1.png', alt: 'Первое' },
          { src: 'https://x/2.png', alt: 'Второе' },
        ])}
      />,
    );
    // active (first) image visible
    const img = await findByAltText('Первое');
    expect(img.getAttribute('src')).toBe('https://x/1.png');
    // arrows present
    expect(container.querySelector('.image-carousel-arrow-prev')).toBeTruthy();
    expect(container.querySelector('.image-carousel-arrow-next')).toBeTruthy();
    // two dots
    expect(container.querySelectorAll('.image-carousel-dot')).toHaveLength(2);
  });

  it('hides arrows and dots for a single image', async () => {
    const { container, findByAltText } = render(
      <LessonBodyRenderer doc={docWith([{ src: 'https://x/only.png', alt: 'Одно' }])} />,
    );
    await findByAltText('Одно');
    expect(container.querySelector('.image-carousel-arrow-prev')).toBeNull();
    expect(container.querySelector('.image-carousel-arrow-next')).toBeNull();
    expect(container.querySelectorAll('.image-carousel-dot')).toHaveLength(0);
  });
});
