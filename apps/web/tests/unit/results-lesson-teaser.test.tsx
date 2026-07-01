import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ResultsLessonTeaser, RESULTS_LESSON_TEASER_CAP } from '@/components/diagnostic/ResultsLessonTeaser';

afterEach(() => cleanup());

const lesson = (id: string, title: string) => ({ id, title, courseName: 'Курс', duration: 10, status: 'NOT_STARTED', locked: false });
const sections = [
  { axis: 'ANALYTICS', label: 'Аналитика', score: 33, tier: 'weak', collapsed: false, jobs: [], lessons: [lesson('a1','Урок А1'),lesson('a2','Урок А2'),lesson('a3','Урок А3')], errorLessons: [] },
  { axis: 'MARKETING', label: 'Маркетинг', score: 50, tier: 'medium', collapsed: false, jobs: [], lessons: [lesson('m1','Урок М1'),lesson('m2','Урок М2'),lesson('m3','Урок М3')], errorLessons: [] },
  { axis: 'FINANCE', label: 'Финансы', score: 100, tier: 'strong', collapsed: true, jobs: [], lessons: [lesson('f1','Урок Ф1')], errorLessons: [] },
];

describe('ResultsLessonTeaser', () => {
  it('exports a hard cap of 5', () => { expect(RESULTS_LESSON_TEASER_CAP).toBe(5); });
  it('renders lessons only from the 2 weakest axes and caps total at 5', () => {
    const { getByText, queryByText, getAllByRole } = render(<ResultsLessonTeaser sections={sections} />);
    expect(getByText('Аналитика')).toBeTruthy();
    expect(getByText('Маркетинг')).toBeTruthy();
    expect(queryByText('Финансы')).toBeNull();
    expect(getByText('Урок А1')).toBeTruthy();
    expect(getByText('Урок М2')).toBeTruthy();
    expect(queryByText('Урок М3')).toBeNull();
    expect(getAllByRole('link').length).toBe(RESULTS_LESSON_TEASER_CAP);
  });
  it('renders nothing when there are no lessons', () => {
    const { container } = render(<ResultsLessonTeaser sections={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
