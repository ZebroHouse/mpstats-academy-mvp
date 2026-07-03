import { describe, it, expect } from 'vitest';
import { scoreToTier, collectErrorLessonsByAxis } from '../axis-path';
import type { SkillCategory } from '@mpstats/shared';

describe('scoreToTier', () => {
  it('weak below 50', () => { expect(scoreToTier(0)).toBe('weak'); expect(scoreToTier(49)).toBe('weak'); });
  it('medium 50..<100', () => { expect(scoreToTier(50)).toBe('medium'); expect(scoreToTier(99)).toBe('medium'); });
  it('strong at 100', () => { expect(scoreToTier(100)).toBe('strong'); });
});

describe('collectErrorLessonsByAxis', () => {
  const axisMap = new Map<string, SkillCategory>([['l1','ANALYTICS'],['l2','MARKETING'],['l3','ANALYTICS']]);
  it('empty when no sourceData', () => {
    expect(collectErrorLessonsByAxis([{ isCorrect: false, sourceData: null }], axisMap).size).toBe(0);
  });
  it('ignores correct answers', () => {
    expect(collectErrorLessonsByAxis([{ isCorrect: true, sourceData: { lessonIds: ['l1'] } }], axisMap).size).toBe(0);
  });
  it('groups wrong-answer lessons by axis, de-duped', () => {
    const res = collectErrorLessonsByAxis([
      { isCorrect: false, sourceData: { lessonIds: ['l1', 'l3'] } },
      { isCorrect: false, sourceData: { lessonIds: ['l1', 'l2'] } },
    ], axisMap);
    expect(res.get('ANALYTICS')).toEqual(['l1', 'l3']);
    expect(res.get('MARKETING')).toEqual(['l2']);
  });
  it('skips lessons missing from axis map', () => {
    expect(collectErrorLessonsByAxis([{ isCorrect: false, sourceData: { lessonIds: ['unknown'] } }], axisMap).size).toBe(0);
  });
});

import { selectAxisLessons } from '../axis-path';

describe('selectAxisLessons', () => {
  const mk = (id: string, isPrimary: boolean, skillLevel: 'EASY'|'MEDIUM'|'HARD', order: number) => ({ id, isPrimary, skillLevel, order });

  it('weak: primary before secondary, then EASY>MEDIUM>HARD, then order', () => {
    const out = selectAxisLessons('weak', [
      mk('hard-primary', true, 'HARD', 1),
      mk('easy-secondary', false, 'EASY', 1),
      mk('easy-primary-2', true, 'EASY', 2),
      mk('easy-primary-1', true, 'EASY', 1),
    ], 5);
    expect(out).toEqual(['easy-primary-1', 'easy-primary-2', 'hard-primary', 'easy-secondary']);
  });

  it('medium: MEDIUM>HARD>EASY within primary bucket', () => {
    const out = selectAxisLessons('medium', [
      mk('easy', true, 'EASY', 1), mk('hard', true, 'HARD', 1), mk('medium', true, 'MEDIUM', 1),
    ], 5);
    expect(out).toEqual(['medium', 'hard', 'easy']);
  });

  it('strong: only HARD lessons kept', () => {
    const out = selectAxisLessons('strong', [
      mk('easy', true, 'EASY', 1), mk('hard-1', true, 'HARD', 2), mk('medium', true, 'MEDIUM', 1), mk('hard-2', false, 'HARD', 1),
    ], 5);
    expect(out).toEqual(['hard-1', 'hard-2']);
  });

  it('caps output length', () => {
    const cands = Array.from({ length: 10 }, (_, i) => mk(`l${i}`, true, 'EASY', i));
    expect(selectAxisLessons('weak', cands, 3)).toHaveLength(3);
  });
});

import { applyPlanCaps, PER_AXIS_LESSON_CAP, PLAN_ACTIVE_LESSON_CAP } from '../axis-path';
import type { AxisLearningPathSection } from '@mpstats/shared';

function section(over: Partial<AxisLearningPathSection>): AxisLearningPathSection {
  return { axis: 'ANALYTICS', label: 'x', score: 0, tier: 'weak', collapsed: false, jobIds: [], lessonIds: [], errorLessonIds: [], ...over };
}

describe('applyPlanCaps', () => {
  it('exports 5 and 20 caps', () => { expect(PER_AXIS_LESSON_CAP).toBe(5); expect(PLAN_ACTIVE_LESSON_CAP).toBe(20); });

  it('per-axis cap trims lessonIds but never errorLessonIds', () => {
    const out = applyPlanCaps([section({ lessonIds: ['a','b','c','d','e','f','g'], errorLessonIds: ['a','b'] })], 5, 20);
    expect(out[0].lessonIds).toEqual(expect.arrayContaining(['a','b']));
    expect(out[0].lessonIds.length).toBeLessThanOrEqual(5 + 2);
  });

  it('global cap trims from strong end, keeps weakest section & error lessons', () => {
    const out = applyPlanCaps([
      section({ axis: 'ANALYTICS', score: 0, tier: 'weak', lessonIds: ['a1','a2','a3','a4','a5'], errorLessonIds: ['a1'] }),
      section({ axis: 'MARKETING', score: 30, tier: 'weak', lessonIds: ['m1','m2','m3','m4','m5'] }),
      section({ axis: 'CONTENT', score: 40, tier: 'weak', lessonIds: ['c1','c2','c3','c4','c5'] }),
      section({ axis: 'OPERATIONS', score: 50, tier: 'medium', lessonIds: ['o1','o2','o3','o4','o5'] }),
      section({ axis: 'FINANCE', score: 67, tier: 'medium', lessonIds: ['f1','f2','f3','f4','f5'] }),
    ], 5, 20);
    const total = out.reduce((s, x) => s + x.lessonIds.length, 0);
    expect(total).toBeLessThanOrEqual(20);
    expect(out[0].lessonIds).toEqual(['a1','a2','a3','a4','a5']);
    expect(out[4].lessonIds.length).toBeLessThan(5);
  });

  it('collapsed sections are excluded from the global active count', () => {
    const out = applyPlanCaps([
      section({ axis: 'ANALYTICS', tier: 'weak', lessonIds: ['a1','a2','a3','a4','a5'] }),
      section({ axis: 'FINANCE', tier: 'strong', collapsed: true, lessonIds: ['f1','f2','f3','f4','f5'] }),
    ], 5, 5);
    expect(out[0].lessonIds).toHaveLength(5);
    expect(out[1].lessonIds).toHaveLength(5);
  });
});

import { pickJobAxisReason } from '../axis-path';
import { SKILL_LABELS } from '@mpstats/shared';

const KEY_MAP = { ANALYTICS: 'analytics', MARKETING: 'marketing', CONTENT: 'content', OPERATIONS: 'operations', FINANCE: 'finance' } as const;

describe('pickJobAxisReason', () => {
  const profile = { analytics: 33, marketing: 50, content: 100, operations: 0, finance: 67 } as any;
  it('picks the weakest matched axis with its score + label', () => {
    expect(pickJobAxisReason(['ANALYTICS', 'OPERATIONS'] as any, profile, KEY_MAP as any, SKILL_LABELS))
      .toEqual({ axis: 'OPERATIONS', axisLabel: SKILL_LABELS.OPERATIONS, axisScore: 0 });
  });
  it('returns null for empty matched axes', () => {
    expect(pickJobAxisReason([] as any, profile, KEY_MAP as any, SKILL_LABELS)).toBeNull();
  });
});
