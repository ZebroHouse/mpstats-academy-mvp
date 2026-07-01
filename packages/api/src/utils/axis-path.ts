import type { AxisLearningPathSection, SkillCategory } from '@mpstats/shared';

export type Tier = 'weak' | 'medium' | 'strong';

export function scoreToTier(score: number): Tier {
  if (score < 50) return 'weak';
  if (score < 100) return 'medium';
  return 'strong';
}

/** Group error-lesson ids (wrong answers carrying sourceData.lessonIds) by each lesson's axis. De-duped, first-seen order. */
export function collectErrorLessonsByAxis(
  answers: Array<{ isCorrect: boolean; sourceData: any }>,
  lessonAxis: Map<string, SkillCategory>,
): Map<SkillCategory, string[]> {
  const byAxis = new Map<SkillCategory, string[]>();
  const seen = new Set<string>();
  for (const a of answers) {
    if (a.isCorrect) continue;
    const ids: string[] = a.sourceData?.lessonIds ?? [];
    for (const id of ids) {
      if (seen.has(id)) continue;
      const axis = lessonAxis.get(id);
      if (!axis) continue;
      seen.add(id);
      const list = byAxis.get(axis) ?? [];
      list.push(id);
      byAxis.set(axis, list);
    }
  }
  return byAxis;
}

export interface AxisLessonCandidate {
  id: string;
  isPrimary: boolean;                       // skillCategory === axis (vs only in skillCategories)
  skillLevel: 'EASY' | 'MEDIUM' | 'HARD';
  order: number;
}

const LEVEL_PREF: Record<Tier, Array<'EASY' | 'MEDIUM' | 'HARD'>> = {
  weak: ['EASY', 'MEDIUM', 'HARD'],
  medium: ['MEDIUM', 'HARD', 'EASY'],
  strong: ['HARD'],
};

/** Rank an axis's candidates for a tier (no embeddings v1): primary first, level-match per tier, order asc. strong = HARD only. Capped. */
export function selectAxisLessons(tier: Tier, candidates: AxisLessonCandidate[], cap: number): string[] {
  const pref = LEVEL_PREF[tier];
  const levelRank = (lvl: 'EASY' | 'MEDIUM' | 'HARD') => {
    const i = pref.indexOf(lvl);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const filtered = candidates.filter((c) => (tier === 'strong' ? c.skillLevel === 'HARD' : true));
  filtered.sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    const lr = levelRank(a.skillLevel) - levelRank(b.skillLevel);
    if (lr !== 0) return lr;
    return a.order - b.order;
  });
  return filtered.slice(0, cap).map((c) => c.id);
}

export const PER_AXIS_LESSON_CAP = 5;
export const PLAN_ACTIVE_LESSON_CAP = 20;

/**
 * Cap a score-asc-sorted section list.
 * - Per-axis: non-error lessons trimmed to perAxisCap; errorLessonIds always kept.
 * - Global: total active (non-collapsed) lessons ≤ globalCap, trimming from the strong end;
 *   never trims errorLessonIds; never trims the first (weakest) section.
 * - Collapsed sections don't count toward the global cap and are left untouched.
 */
export function applyPlanCaps(
  sections: AxisLearningPathSection[],
  perAxisCap: number,
  globalCap: number,
): AxisLearningPathSection[] {
  const capped = sections.map((s) => {
    const errorSet = new Set(s.errorLessonIds);
    const errors = s.lessonIds.filter((id) => errorSet.has(id));
    const nonErrors = s.lessonIds.filter((id) => !errorSet.has(id)).slice(0, perAxisCap);
    const kept = new Set([...errors, ...nonErrors]);
    return { ...s, lessonIds: s.lessonIds.filter((id) => kept.has(id)) };
  });

  const countActive = () =>
    capped.filter((s) => !s.collapsed).reduce((sum, s) => sum + s.lessonIds.length, 0);

  for (let i = capped.length - 1; i >= 1 && countActive() > globalCap; i--) {
    const s = capped[i];
    if (s.collapsed) continue;
    const errorSet = new Set(s.errorLessonIds);
    while (countActive() > globalCap) {
      const idx = [...s.lessonIds].reverse().findIndex((id) => !errorSet.has(id));
      if (idx === -1) break; // only error lessons left → protected
      s.lessonIds.splice(s.lessonIds.length - 1 - idx, 1);
    }
  }

  return capped;
}
