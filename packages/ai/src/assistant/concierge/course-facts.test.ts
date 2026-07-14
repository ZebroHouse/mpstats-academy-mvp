import { describe, it, expect } from 'vitest';
import { formatCourseFacts } from './course-facts';

describe('formatCourseFacts', () => {
  it('форматирует курс с числом уроков и темами', () => {
    const txt = formatCourseFacts([
      { title: 'Аналитика', lessonCount: 12, topics: ['Ниши', 'Спрос', 'Сезонность'] },
    ]);
    expect(txt).toContain('Аналитика');
    expect(txt).toContain('12');
    expect(txt).toContain('Ниши');
  });

  it('пустой список → пометка об отсутствии', () => {
    expect(formatCourseFacts([])).toMatch(/не наш|нет данных|не нашёл/i);
  });
});
