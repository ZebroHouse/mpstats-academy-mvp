import { describe, it, expect } from 'vitest';
import { generateAxisPath } from '../../routers/diagnostic';
import type { SkillProfile } from '@mpstats/shared';

function mockPrisma(lessons: any[]) { return { lesson: { findMany: async () => lessons } } as any; }
const profile: SkillProfile = { analytics: 33, marketing: 50, content: 100, operations: 0, finance: 67 };
const lessons = [
  { id: 'a1', skillCategory: 'ANALYTICS', skillCategories: ['ANALYTICS'], skillLevel: 'EASY', order: 1 },
  { id: 'a2', skillCategory: 'ANALYTICS', skillCategories: ['ANALYTICS'], skillLevel: 'MEDIUM', order: 2 },
  { id: 'o1', skillCategory: 'OPERATIONS', skillCategories: ['OPERATIONS'], skillLevel: 'EASY', order: 1 },
  { id: 'c1', skillCategory: 'CONTENT', skillCategories: ['CONTENT'], skillLevel: 'HARD', order: 1 },
  { id: 'c2', skillCategory: 'CONTENT', skillCategories: ['CONTENT'], skillLevel: 'EASY', order: 2 },
];

describe('generateAxisPath', () => {
  it('produces v3 sorted by score asc', async () => {
    const path = await generateAxisPath(mockPrisma(lessons), profile, 'sess-1', [], []);
    expect(path.version).toBe(3);
    const scores = path.sections.map((s) => s.score);
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
    expect(path.sections[0].axis).toBe('OPERATIONS');
  });
  it('strong axis with no errors is collapsed & HARD-only', async () => {
    const path = await generateAxisPath(mockPrisma(lessons), profile, 'sess-1', [], []);
    const content = path.sections.find((s) => s.axis === 'CONTENT')!;
    expect(content.tier).toBe('strong');
    expect(content.collapsed).toBe(true);
    expect(content.lessonIds).toEqual(['c1']);
  });
  it('axis with errors is never collapsed and keeps errorLessonIds', async () => {
    const answers = [{ isCorrect: false, sourceData: { lessonIds: ['c2'] } }];
    const path = await generateAxisPath(mockPrisma(lessons), profile, 'sess-1', answers, []);
    const content = path.sections.find((s) => s.axis === 'CONTENT')!;
    expect(content.collapsed).toBe(false);
    expect(content.errorLessonIds).toContain('c2');
    expect(content.lessonIds).toContain('c2');
  });
  it('attaches jobs to their weakest matched axis', async () => {
    const jobs = [{ id: 'job-1', matchedAxes: ['ANALYTICS', 'OPERATIONS'] } as any];
    const path = await generateAxisPath(mockPrisma(lessons), profile, 'sess-1', [], jobs);
    expect(path.sections.find((s) => s.axis === 'OPERATIONS')!.jobIds).toContain('job-1');
    expect(path.sections.find((s) => s.axis === 'ANALYTICS')!.jobIds).not.toContain('job-1');
  });
  it('drops empty axes', async () => {
    const path = await generateAxisPath(mockPrisma(lessons), profile, 'sess-1', [], []);
    expect(path.sections.find((s) => s.axis === 'MARKETING')).toBeUndefined();
    expect(path.sections.find((s) => s.axis === 'FINANCE')).toBeUndefined();
  });
});
