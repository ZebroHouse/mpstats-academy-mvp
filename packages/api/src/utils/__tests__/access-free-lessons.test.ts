import { describe, it, expect, vi } from 'vitest';
import { getFirstJobLessonIds } from '../access';
import { EMERGENCY_FREE_LESSON_IDS } from '../emergency';

function prismaWithNoJobLessons() {
  return { jobLesson: { findMany: vi.fn().mockResolvedValue([]) } } as any;
}

describe('getFirstJobLessonIds — free-lesson allowlist', () => {
  it('включает id из аллоулиста даже когда нет джоб (bulk)', async () => {
    const set = await getFirstJobLessonIds(prismaWithNoJobLessons());
    for (const id of EMERGENCY_FREE_LESSON_IDS) expect(set.has(id)).toBe(true);
  });

  it('при фильтре lessonIds возвращает только запрошенные free-id', async () => {
    const wanted = '04_workshops_w12_jul26_crisis_001';
    const other = '04_workshops_text_d1db18c6-7275-4e16-ab16-8ca58117cd50';
    const set = await getFirstJobLessonIds(prismaWithNoJobLessons(), [wanted]);
    expect(set.has(wanted)).toBe(true);
    expect(set.has(other)).toBe(false); // не запрашивали — не должен просочиться
  });

  it('пустой lessonIds → пустой набор (ранний выход сохранён)', async () => {
    const set = await getFirstJobLessonIds(prismaWithNoJobLessons(), []);
    expect(set.size).toBe(0);
  });
});
