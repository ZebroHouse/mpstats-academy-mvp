# Diagnostic Axis-Redesign — Backend + Error Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace tier-based learning-path generation with an axis-centric `AxisLearningPath` (v3): one section per competency, weakest-first, capped, relevance-ranked lessons, plus revived error-linking via question→lesson source data.

**Architecture:** New pure utils in `packages/api/src/utils/axis-path.ts` (tier/selection/caps/error-grouping), a `generateAxisPath` orchestrator in `diagnostic.ts` replacing `generateSectionedPath` at completion, `getRecommendedPath` serving v3 + migrate-on-read, and `StaticQuestion` source fields plumbed through `startSession`/`submitAnswer`. Additive, going-forward, no DB schema migration (LearningPath.lessons is Json). Never touches `LessonProgress`.

**Tech Stack:** TypeScript, tRPC, Prisma, Vitest, pnpm monorepo. Spec: `docs/superpowers/specs/2026-07-01-diagnostic-plan-axis-redesign-design.md`.

---

## Shared enriched contract (authoritative — the UI plan consumes exactly this)

`learning.getRecommendedPath` for a v3 path returns:

```ts
// EnrichedLesson = buildLessonData(row) output (existing shape: id, title, courseName?,
//   duration, status: 'NOT_STARTED'|'IN_PROGRESS'|'COMPLETED', locked, ...)
interface EnrichedJob { id: string; slug: string; title: string; lessons: EnrichedLesson[] }
interface EnrichedAxisSection {
  axis: string; label: string; score: number;
  tier: 'weak' | 'medium' | 'strong'; collapsed: boolean;
  jobs: EnrichedJob[];
  lessons: EnrichedLesson[];       // non-error lessons of the axis
  errorLessons: EnrichedLesson[];  // error-review lessons of the axis
}
// Response:
{
  generatedAt: Date;
  isAxis: true;
  sections: EnrichedAxisSection[];   // sorted weakest-first
  lessons: EnrichedLesson[];         // flat (errorLessons + lessons), for counts
  totalLessons: number;
  completedLessons: number;
  addedJobs: /* existing addedJobsPayload */;
  hasPlatformSubscription: boolean;
}
```

`diagnostic.getResults.recommendedJobs[]` additionally carry `axis`, `axisLabel`, `axisScore` (weakest matched axis) — see Task 3.6.

---

## Wave 1: Types + pure utilities

### Task 1.1 — New axis-path types + `parseLearningPath` v3 recognition

**Files:**
- Modify: `packages/shared/src/types/index.ts` (add types after `SectionedLearningPath` ~line 294; extend `parseLearningPath` 297-303)
- Create: `packages/shared/src/types/__tests__/parse-learning-path.test.ts`

- [ ] Write failing test `packages/shared/src/types/__tests__/parse-learning-path.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseLearningPath } from '../index';
import type { AxisLearningPath } from '../index';

describe('parseLearningPath v3', () => {
  it('recognizes version:3 AxisLearningPath', () => {
    const v3: AxisLearningPath = {
      version: 3,
      sections: [{
        axis: 'ANALYTICS', label: 'Аналитика', score: 33, tier: 'weak',
        collapsed: false, jobIds: ['job-1'], lessonIds: ['l1', 'l2'], errorLessonIds: ['l1'],
      }],
      generatedFromSessionId: 'sess-1',
    };
    const parsed = parseLearningPath(v3);
    expect(Array.isArray(parsed)).toBe(false);
    expect((parsed as AxisLearningPath).version).toBe(3);
    expect((parsed as AxisLearningPath).sections[0].axis).toBe('ANALYTICS');
  });

  it('still recognizes v2 SectionedLearningPath', () => {
    const v2 = { version: 2, sections: [], generatedFromSessionId: 's' };
    expect((parseLearningPath(v2) as any).version).toBe(2);
  });

  it('still recognizes flat string[]', () => {
    expect(parseLearningPath(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('unknown version falls back to [] (no throw)', () => {
    expect(parseLearningPath({ version: 99 })).toEqual([]);
    expect(parseLearningPath(null)).toEqual([]);
  });
});
```
- [ ] Run: `pnpm --filter @mpstats/shared test parse-learning-path` — expect FAIL (`AxisLearningPath` not exported).
- [ ] Add after the `SectionedLearningPath` interface (~line 294) in `packages/shared/src/types/index.ts`:
```ts
// ============== AXIS LEARNING PATH (v3) ==============

export interface AxisLearningPathSection {
  axis: SkillCategory;
  label: string;
  score: number;            // 0-100
  tier: 'weak' | 'medium' | 'strong';
  collapsed: boolean;
  jobIds: string[];
  lessonIds: string[];
  errorLessonIds: string[];
}

export interface AxisLearningPath {
  version: 3;
  sections: AxisLearningPathSection[];   // sorted by score asc
  generatedFromSessionId: string;
  previousSkillProfileId?: string;
}
```
- [ ] Replace `parseLearningPath` (297-303):
```ts
/** Parse LearningPath.lessons Json — old string[], v2 SectionedLearningPath, v3 AxisLearningPath */
export function parseLearningPath(
  lessons: unknown,
): string[] | SectionedLearningPath | AxisLearningPath {
  if (Array.isArray(lessons)) return lessons; // old format: string[]
  if (typeof lessons === 'object' && lessons !== null && 'version' in lessons) {
    const v = (lessons as any).version;
    if (v === 3) return lessons as AxisLearningPath;
    if (v === 2) return lessons as SectionedLearningPath;
  }
  return []; // fallback — never throw
}
```
- [ ] Run: `pnpm --filter @mpstats/shared test parse-learning-path` — expect PASS.
- [ ] Run: `pnpm --filter @mpstats/shared typecheck` — expect PASS.
- [ ] Commit: `git add packages/shared/src/types/index.ts packages/shared/src/types/__tests__/parse-learning-path.test.ts && git commit -m "feat(shared): add AxisLearningPath v3 type + parseLearningPath recognition"`

---

### Task 1.2 — `scoreToTier` + `collectErrorLessonsByAxis`

**Files:**
- Create: `packages/api/src/utils/axis-path.ts`
- Create: `packages/api/src/utils/__tests__/axis-path.test.ts`

- [ ] Write failing test `packages/api/src/utils/__tests__/axis-path.test.ts`:
```ts
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
```
- [ ] Run: `pnpm --filter @mpstats/api test axis-path` — expect FAIL (module not found).
- [ ] Create `packages/api/src/utils/axis-path.ts`:
```ts
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
```
- [ ] Run: `pnpm --filter @mpstats/api test axis-path` — expect PASS.
- [ ] Commit: `git add packages/api/src/utils/axis-path.ts packages/api/src/utils/__tests__/axis-path.test.ts && git commit -m "feat(api): add scoreToTier + collectErrorLessonsByAxis pure utils"`

---

### Task 1.3 — `selectAxisLessons` (tier-driven ranking, no embeddings v1)

**Files:**
- Modify: `packages/api/src/utils/axis-path.ts`
- Modify: `packages/api/src/utils/__tests__/axis-path.test.ts` (append)

- [ ] Append failing tests to `axis-path.test.ts`:
```ts
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
```
- [ ] Run: `pnpm --filter @mpstats/api test axis-path` — expect FAIL.
- [ ] Append to `packages/api/src/utils/axis-path.ts`:
```ts
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
```
- [ ] Run: `pnpm --filter @mpstats/api test axis-path` — expect PASS.
- [ ] Commit: `git add packages/api/src/utils/axis-path.ts packages/api/src/utils/__tests__/axis-path.test.ts && git commit -m "feat(api): add selectAxisLessons tier-driven ranking"`

---

### Task 1.4 — `applyPlanCaps` (per-axis + global cap; protect errors & weakest)

**Files:**
- Modify: `packages/api/src/utils/axis-path.ts`
- Modify: `packages/api/src/utils/__tests__/axis-path.test.ts` (append)

- [ ] Append failing tests:
```ts
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
```
- [ ] Run: `pnpm --filter @mpstats/api test axis-path` — expect FAIL.
- [ ] Append to `packages/api/src/utils/axis-path.ts`:
```ts
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
```
- [ ] Run: `pnpm --filter @mpstats/api test axis-path` — expect PASS.
- [ ] Run: `pnpm --filter @mpstats/api typecheck` — expect PASS.
- [ ] Commit: `git add packages/api/src/utils/axis-path.ts packages/api/src/utils/__tests__/axis-path.test.ts && git commit -m "feat(api): add applyPlanCaps with per-axis + global caps protecting errors/weakest"`

---

## Wave 2: Error linking (question → lesson source data)

### Task 2.1 — Add `sourceLessonIds`/`sourceTimecodes` to `StaticQuestion`

**Files:**
- Modify: `packages/api/src/diagnostic/static-deck.ts` (interface 16-24)
- Create: `packages/api/src/diagnostic/__tests__/static-deck-shape.test.ts`

- [ ] Write failing test `packages/api/src/diagnostic/__tests__/static-deck-shape.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { STATIC_DECK } from '../static-deck';
import type { StaticQuestion } from '../static-deck';

describe('StaticQuestion optional source fields', () => {
  it('accepts sourceLessonIds/sourceTimecodes as optional', () => {
    const q: StaticQuestion = {
      id: 'q-x', axis: 'ANALYTICS', level: 1, marketplace: 'WB',
      prompt: 'p', options: ['a','b','c','d'], explanation: 'e',
      sourceLessonIds: ['lesson-1'],
      sourceTimecodes: [{ lessonId: 'lesson-1', label: 'intro', start: 0, end: 30 }],
    };
    expect(q.sourceLessonIds).toEqual(['lesson-1']);
  });
  it('deck questions remain valid without source fields (30 total)', () => {
    const all = [...STATIC_DECK.wb, ...STATIC_DECK.ozon];
    expect(all).toHaveLength(30);
    for (const q of all) expect(q.options).toHaveLength(4);
  });
});
```
- [ ] Run: `pnpm --filter @mpstats/api test static-deck-shape` — expect FAIL. (If the exported deck symbol is not `STATIC_DECK`/not `.wb`/`.ozon`, read `static-deck.ts` export at ~488-491 and adjust the test to the real export.)
- [ ] Edit `StaticQuestion` (16-24) to add after `marketplace`:
```ts
  // axis-redesign — links wrong answers to specific lessons for "разбор ошибок".
  sourceLessonIds?: string[];
  sourceTimecodes?: Array<{ lessonId: string; label: string; start: number; end: number }>;
```
- [ ] Run: `pnpm --filter @mpstats/api test static-deck-shape` — expect PASS.
- [ ] Commit: `git add packages/api/src/diagnostic/static-deck.ts packages/api/src/diagnostic/__tests__/static-deck-shape.test.ts && git commit -m "feat(api): add optional sourceLessonIds/sourceTimecodes to StaticQuestion"`

---

### Task 2.2 — Propagate source fields in `startSession` + write `sourceData` in `submitAnswer`

**Files:**
- Create: `packages/api/src/diagnostic/question-source.ts`
- Create: `packages/api/src/diagnostic/__tests__/source-mapping.test.ts`
- Modify: `packages/api/src/routers/diagnostic.ts` (mapping 511-523; submitAnswer sourceData 696-700)

- [ ] Write failing test `packages/api/src/diagnostic/__tests__/source-mapping.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { toDiagnosticQuestionSource, buildAnswerSourceData } from '../question-source';
import type { StaticQuestion } from '../static-deck';

const base: StaticQuestion = { id: 'q1', axis: 'ANALYTICS', level: 1, marketplace: 'WB', prompt: 'p', options: ['a','b','c','d'], explanation: 'e' };

describe('toDiagnosticQuestionSource', () => {
  it('passes through source fields', () => {
    const q = { ...base, sourceLessonIds: ['l1'], sourceTimecodes: [{ lessonId: 'l1', label: 'x', start: 1, end: 2 }] };
    expect(toDiagnosticQuestionSource(q)).toEqual({ sourceLessonIds: ['l1'], sourceTimecodes: [{ lessonId: 'l1', start: 1, end: 2 }] });
  });
  it('returns empty object when absent', () => { expect(toDiagnosticQuestionSource(base)).toEqual({}); });
});

describe('buildAnswerSourceData', () => {
  it('null when neither chunkIds nor lessonIds', () => { expect(buildAnswerSourceData({} as any)).toBeNull(); });
  it('builds from sourceLessonIds', () => {
    expect(buildAnswerSourceData({ sourceLessonIds: ['l1'] } as any)).toEqual({ chunkIds: [], lessonIds: ['l1'], timecodes: [] });
  });
  it('builds from sourceChunkIds (legacy)', () => {
    expect(buildAnswerSourceData({ sourceChunkIds: ['c1'], sourceLessonIds: ['l1'], sourceTimecodes: [{ lessonId: 'l1', start: 0, end: 1 }] } as any))
      .toEqual({ chunkIds: ['c1'], lessonIds: ['l1'], timecodes: [{ lessonId: 'l1', start: 0, end: 1 }] });
  });
});
```
- [ ] Run: `pnpm --filter @mpstats/api test source-mapping` — expect FAIL (module not found).
- [ ] Create `packages/api/src/diagnostic/question-source.ts`:
```ts
import type { DiagnosticQuestion } from '@mpstats/shared';
import type { StaticQuestion } from './static-deck';

/** Project a static question's source fields into DiagnosticQuestion shape (timecodes lose `label`). */
export function toDiagnosticQuestionSource(q: StaticQuestion): Pick<DiagnosticQuestion, 'sourceLessonIds' | 'sourceTimecodes'> {
  const out: Pick<DiagnosticQuestion, 'sourceLessonIds' | 'sourceTimecodes'> = {};
  if (q.sourceLessonIds?.length) out.sourceLessonIds = q.sourceLessonIds;
  if (q.sourceTimecodes?.length) {
    out.sourceTimecodes = q.sourceTimecodes.map((t) => ({ lessonId: t.lessonId, start: t.start, end: t.end }));
  }
  return out;
}

/** Persisted `sourceData` for an answer. Null when no source at all. */
export function buildAnswerSourceData(question: DiagnosticQuestion): { chunkIds: string[]; lessonIds: string[]; timecodes: any[] } | null {
  const hasChunks = !!question.sourceChunkIds?.length;
  const hasLessons = !!question.sourceLessonIds?.length;
  if (!hasChunks && !hasLessons) return null;
  return { chunkIds: question.sourceChunkIds ?? [], lessonIds: question.sourceLessonIds ?? [], timecodes: question.sourceTimecodes ?? [] };
}
```
- [ ] Run: `pnpm --filter @mpstats/api test source-mapping` — expect PASS.
- [ ] Wire into `startSession` mapping (511-523): add `import { toDiagnosticQuestionSource, buildAnswerSourceData } from '../diagnostic/question-source';` and spread source fields:
```ts
        questions = picked.map((q) => {
          const { options, correctIndex } = shuffleOptions(q, session.id);
          return {
            id: q.id,
            question: q.prompt,
            options,
            correctIndex,
            explanation: q.explanation,
            difficulty: levelToDifficulty(q.level),
            skillCategory: q.axis,
            marketplace: q.marketplace,
            ...toDiagnosticQuestionSource(q),
          } as DiagnosticQuestion;
        });
```
- [ ] Wire into `submitAnswer` `sourceData` (696-700): replace the `sourceData:` field with:
```ts
            sourceData: buildAnswerSourceData(question) ?? undefined,
```
- [ ] Run: `pnpm --filter @mpstats/api typecheck && pnpm --filter @mpstats/api test source-mapping` — expect PASS.
- [ ] Commit: `git add packages/api/src/diagnostic/question-source.ts packages/api/src/diagnostic/__tests__/source-mapping.test.ts packages/api/src/routers/diagnostic.ts && git commit -m "feat(api): propagate question source fields into session + answer sourceData"`

---

### Task 2.3 — One-shot RAG mapping script (proposal only)

**Files:**
- Create: `scripts/diagnostic/map-questions-to-lessons.ts`

Proposal-only script (not on runtime path, no unit test). Verify by running against prod env.

- [ ] Create `scripts/diagnostic/map-questions-to-lessons.ts`:
```ts
/**
 * One-shot proposal (spec §7.2). Embeds (prompt + correct option + explanation) per
 * static question, vector-searches content_chunk for closest 1-2 lessons, prints JSON.
 * Does NOT modify static-deck. Run:
 *   NODE_OPTIONS=--dns-result-order=ipv4first npx tsx --conditions=react-server \
 *     scripts/diagnostic/map-questions-to-lessons.ts
 */
import { prisma } from '@mpstats/db/client';
import { embedQuery } from '@mpstats/ai/embeddings';
import { STATIC_DECK } from '../../packages/api/src/diagnostic/static-deck';

const TOP_N = 2;

async function main() {
  const all = [...STATIC_DECK.wb, ...STATIC_DECK.ozon];
  const proposals: Array<{ questionId: string; axis: string; suggestedLessonIds: string[]; titles: string[]; similarities: number[] }> = [];

  for (const q of all) {
    const correct = q.options[0]; // canonical: options[0] is the correct answer in source
    const vec = await embedQuery(`${q.prompt}\n${correct}\n${q.explanation}`);
    const literal = `[${vec.join(',')}]`;
    const rows = await prisma.$queryRawUnsafe<Array<{ lesson_id: string; title: string; similarity: number }>>(`
      SELECT l.id AS lesson_id, l.title AS title,
             MAX(1 - (cc.embedding <=> '${literal}'::vector)) AS similarity
      FROM content_chunk cc
      JOIN "Lesson" l ON l.id = cc.lesson_id
      JOIN "Course" c ON c.id = l."courseId"
      WHERE l."isHidden" = false AND c."isHidden" = false AND c."partnerKey" IS NULL
      GROUP BY l.id, l.title
      ORDER BY similarity DESC
      LIMIT ${TOP_N}
    `);
    proposals.push({ questionId: q.id, axis: q.axis, suggestedLessonIds: rows.map(r => r.lesson_id), titles: rows.map(r => r.title), similarities: rows.map(r => Number(r.similarity)) });
    console.error(`[mapped] ${q.id} -> ${rows.map(r => r.title).join(' | ')}`);
  }
  console.log(JSON.stringify(proposals, null, 2));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
```
- [ ] Confirm `content_chunk` table/column names by grepping an existing raw query: `grep -rn "content_chunk" packages/`. Adjust the SQL casing to match production.
- [ ] Commit: `git add scripts/diagnostic/map-questions-to-lessons.ts && git commit -m "chore(diagnostic): add one-shot question->lesson RAG mapping proposal script"`
- [ ] MANUAL STEP (instruction, not automated): run the script, eyeball each proposal (owner + agent quick sanity, no methodologist gate), then hand-edit `sourceLessonIds` into matching questions in `static-deck.ts`. Keep only clear matches. Commit the data edit separately: `data(diagnostic): link static-deck questions to source lessons`.

---

## Wave 3: Wiring — generateAxisPath, completion, getRecommendedPath, migration, legacy rebuild

### Task 3.1 — `generateAxisPath` orchestrator

**Files:**
- Modify: `packages/api/src/routers/diagnostic.ts` (add after `generateSectionedPath`, line 418)
- Create: `packages/api/src/utils/__tests__/generate-axis-path.test.ts`

- [ ] Write failing test `packages/api/src/utils/__tests__/generate-axis-path.test.ts`:
```ts
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
```
- [ ] Run: `pnpm --filter @mpstats/api test generate-axis-path` — expect FAIL.
- [ ] In `diagnostic.ts` add imports: add `AxisLearningPath, AxisLearningPathSection, SKILL_LABELS` to the shared import group, `import { scoreToTier, selectAxisLessons, collectErrorLessonsByAxis, applyPlanCaps, PER_AXIS_LESSON_CAP, PLAN_ACTIVE_LESSON_CAP } from '../utils/axis-path';`, `import type { JobMatch } from '../utils/job-matcher';`. (Verify `JobMatch` is the actual exported return type of `getRecommendedJobsFromGaps`; if named differently, use that name.)
- [ ] Add after line 418:
```ts
const AXIS_ORDER: SkillCategory[] = ['ANALYTICS', 'MARKETING', 'CONTENT', 'OPERATIONS', 'FINANCE'];

/** Build AxisLearningPath v3: one section per canonical axis, score asc. Never touches LessonProgress. */
export async function generateAxisPath(
  prisma: PrismaClient,
  skillProfile: SkillProfile,
  sessionId: string,
  answers: Array<{ isCorrect: boolean; sourceData: any }>,
  recommendedJobs: Array<Pick<JobMatch, 'id' | 'matchedAxes'>>,
): Promise<AxisLearningPath> {
  const allLessons = await prisma.lesson.findMany({
    where: { isHidden: false, course: { isHidden: false, partnerKey: null } },
    select: { id: true, skillCategory: true, skillCategories: true, skillLevel: true, order: true },
    orderBy: { order: 'asc' },
  });

  const lessonAxis = new Map<string, SkillCategory>(allLessons.map((l) => [l.id, l.skillCategory as SkillCategory]));
  const errorsByAxis = collectErrorLessonsByAxis(answers, lessonAxis);

  const jobsByAxis = new Map<SkillCategory, string[]>();
  for (const job of recommendedJobs) {
    const matched = ((job.matchedAxes ?? []) as SkillCategory[]);
    if (matched.length === 0) continue;
    const weakest = matched.reduce((best, ax) =>
      skillProfile[CATEGORY_KEY_MAP[ax]] < skillProfile[CATEGORY_KEY_MAP[best]] ? ax : best);
    const list = jobsByAxis.get(weakest) ?? [];
    list.push(job.id);
    jobsByAxis.set(weakest, list);
  }

  const usedLessonIds = new Set<string>();
  const axesByScore = [...AXIS_ORDER].sort((a, b) => skillProfile[CATEGORY_KEY_MAP[a]] - skillProfile[CATEGORY_KEY_MAP[b]]);

  const sections: AxisLearningPathSection[] = [];
  for (const axis of axesByScore) {
    const score = skillProfile[CATEGORY_KEY_MAP[axis]];
    const tier = scoreToTier(score);
    const errorLessonIds = errorsByAxis.get(axis) ?? [];

    const candidates = allLessons
      .filter((l) => {
        if (usedLessonIds.has(l.id)) return false;
        const cats = (l.skillCategories as string[] | null) ?? [];
        return l.skillCategory === axis || cats.includes(axis);
      })
      .map((l) => ({ id: l.id, isPrimary: l.skillCategory === axis, skillLevel: l.skillLevel as 'EASY'|'MEDIUM'|'HARD', order: l.order }));

    const rankedNonError = selectAxisLessons(tier, candidates, PER_AXIS_LESSON_CAP);
    const lessonIds = Array.from(new Set([...errorLessonIds, ...rankedNonError]));
    lessonIds.forEach((id) => usedLessonIds.add(id));

    const jobIds = jobsByAxis.get(axis) ?? [];
    const collapsed = tier === 'strong' && errorLessonIds.length === 0;

    if (lessonIds.length === 0 && jobIds.length === 0 && errorLessonIds.length === 0) continue;

    sections.push({ axis, label: SKILL_LABELS[axis], score, tier, collapsed, jobIds, lessonIds, errorLessonIds });
  }

  return { version: 3, sections: applyPlanCaps(sections, PER_AXIS_LESSON_CAP, PLAN_ACTIVE_LESSON_CAP), generatedFromSessionId: sessionId };
}
```
- [ ] Run: `pnpm --filter @mpstats/api test generate-axis-path && pnpm --filter @mpstats/api typecheck` — expect PASS.
- [ ] Commit: `git add packages/api/src/routers/diagnostic.ts packages/api/src/utils/__tests__/generate-axis-path.test.ts && git commit -m "feat(api): add generateAxisPath v3 orchestrator"`

---

### Task 3.2 — Completion block writes v3 via `generateAxisPath`

**Files:**
- Modify: `packages/api/src/routers/diagnostic.ts` (completion block ~753-854)

Router glue; verify via api suite + typecheck. Compute jobs first, pass into `generateAxisPath`.

- [ ] Replace the sectioned-path generation (~753-791) and reorder so `getRecommendedJobsFromGaps` runs before path generation:
```ts
          // Recommend jobs first — generateAxisPath attaches them to axes.
          const profileForJobs = await ctx.prisma.userProfile.findUnique({
            where: { id: ctx.user.id }, select: { marketplaces: true },
          });
          const newRecommendedJobs = await getRecommendedJobsFromGaps(ctx.prisma, {
            skillProfile, userMarketplaces: profileForJobs?.marketplaces ?? [], limit: 3,
          });
          const newRecommendedJobIds = newRecommendedJobs.map((j) => j.id);

          let pathData: any;
          try {
            const allAnswersWithSource = await ctx.prisma.diagnosticAnswer.findMany({
              where: { sessionId: input.sessionId }, select: { isCorrect: true, sourceData: true },
            });
            pathData = await generateAxisPath(
              ctx.prisma, skillProfile, input.sessionId,
              allAnswersWithSource.map((a) => ({ isCorrect: a.isCorrect, sourceData: a.sourceData as any })),
              newRecommendedJobs.map((j) => ({ id: j.id, matchedAxes: j.matchedAxes })),
            );
          } catch (err) {
            console.error('[diagnostic] Axis path generation failed, falling back to flat:', err);
            pathData = await generateFullRecommendedPath(ctx.prisma, skillProfile);
          }
```
- [ ] Remove the now-duplicate `profileForJobs`/`newRecommendedJobs`/`newRecommendedJobIds` block at old ~816-827 (moved above). Keep the `mergedAddedJobs` transaction (~831-854) referencing `newRecommendedJobIds`.
- [ ] Remove the v2 "Preserve custom section" block (~793-814): v3 has no `custom` section (jobs/lessons live per-axis). Confirm no other reader depends on it (it only mutated `pathData.sections`).
- [ ] Run: `pnpm --filter @mpstats/api typecheck && pnpm --filter @mpstats/api test` — expect PASS. Update any completion test asserting `version:2` → `version:3`/axis sections.
- [ ] Commit: `git add packages/api/src/routers/diagnostic.ts && git commit -m "feat(api): diagnostic completion writes AxisLearningPath v3"`

---

### Task 3.3 — `getRecommendedPath` serves v3 (enriched contract) + migrate-on-read

**Files:**
- Modify: `packages/api/src/routers/learning.ts` (getRecommendedPath 293-473)

Emits the **Shared enriched contract** above (key `sections`, split `lessons`/`errorLessons`, enriched `jobs[].lessons`). Migrate-on-read when parsed ≠ v3 but user has a `SkillProfile`. LessonProgress untouched.

- [ ] Add imports: `import { generateAxisPath } from './diagnostic';`, `import type { AxisLearningPath, SkillProfile } from '@mpstats/shared';`, and ensure `getRecommendedJobsFromGaps` is imported from `../utils/job-matcher`.
- [ ] After `const parsed = parseLearningPath(path.lessons);` and after `buildLessonData`/`activeGeneratedAt`/`hasPlatformSubscription`/`addedJobsPayload` are in scope (~after 388), insert the v3 builder + branch:
```ts
      const buildAxisResponse = async (axisPath: AxisLearningPath) => {
        const allLessonIds = axisPath.sections.flatMap((s) => s.lessonIds);
        const jobIds = axisPath.sections.flatMap((s) => s.jobIds);

        const lessonRows = allLessonIds.length
          ? await ctx.prisma.lesson.findMany({
              where: { id: { in: allLessonIds }, isHidden: false, course: { isHidden: false, partnerKey: null } },
              include: { progress: { where: { path: { userId: ctx.user.id } } }, course: { select: { title: true, isHidden: true } } },
            })
          : [];
        const lessonMap = new Map(lessonRows.map((l) => [l.id, buildLessonData(l)]));

        const jobRows = jobIds.length
          ? await ctx.prisma.job.findMany({
              where: { id: { in: jobIds }, isPublished: true },
              select: { id: true, slug: true, title: true, lessons: { orderBy: { order: 'asc' }, select: { lesson: { select: { id: true, title: true } } } } },
            })
          : [];
        const jobMap = new Map(jobRows.map((j) => [j.id, {
          id: j.id, slug: j.slug, title: j.title,
          lessons: j.lessons.map((jl) => lessonMap.get(jl.lesson.id) ?? { id: jl.lesson.id, title: jl.lesson.title, status: 'NOT_STARTED', locked: false, duration: 0 } as any),
        }]));

        const sections = axisPath.sections
          .map((s) => {
            const errorSet = new Set(s.errorLessonIds);
            const enriched = s.lessonIds.map((id) => lessonMap.get(id)).filter(Boolean) as ReturnType<typeof buildLessonData>[];
            return {
              axis: s.axis, label: s.label, score: s.score, tier: s.tier, collapsed: s.collapsed,
              jobs: s.jobIds.map((id) => jobMap.get(id)).filter(Boolean),
              lessons: enriched.filter((l) => !errorSet.has(l.id)),
              errorLessons: enriched.filter((l) => errorSet.has(l.id)),
            };
          })
          .filter((s) => s.lessons.length > 0 || s.errorLessons.length > 0 || s.jobs.length > 0);

        const flat = sections.flatMap((s) => [...s.errorLessons, ...s.lessons]);
        return {
          generatedAt: activeGeneratedAt,
          isAxis: true as const,
          sections,
          lessons: flat,
          totalLessons: flat.length,
          completedLessons: flat.filter((l) => l.status === 'COMPLETED').length,
          hasPlatformSubscription,
          addedJobs: addedJobsPayload,
        };
      };

      if (!Array.isArray(parsed) && (parsed as any).version === 3) {
        return buildAxisResponse(parsed as AxisLearningPath);
      }

      // Non-v3 but user has a SkillProfile → migrate-on-read into v3 (no persist here, no LessonProgress touch).
      const skillProfileRow = await ctx.prisma.skillProfile.findUnique({ where: { userId: ctx.user.id } });
      if (skillProfileRow) {
        const skillProfile: SkillProfile = {
          analytics: skillProfileRow.analytics, marketing: skillProfileRow.marketing,
          content: skillProfileRow.content, operations: skillProfileRow.operations, finance: skillProfileRow.finance,
        };
        const session = await ctx.prisma.diagnosticSession.findFirst({
          where: { userId: ctx.user.id, status: 'COMPLETED' }, orderBy: { completedAt: 'desc' }, select: { id: true },
        });
        const answers = session
          ? await ctx.prisma.diagnosticAnswer.findMany({ where: { sessionId: session.id }, select: { isCorrect: true, sourceData: true } })
          : [];
        const userProfile = await ctx.prisma.userProfile.findUnique({ where: { id: ctx.user.id }, select: { marketplaces: true } });
        const recJobs = await getRecommendedJobsFromGaps(ctx.prisma, { skillProfile, userMarketplaces: userProfile?.marketplaces ?? [], limit: 3 });
        const migrated = await generateAxisPath(
          ctx.prisma, skillProfile, session?.id ?? 'migrated',
          answers.map((a) => ({ isCorrect: a.isCorrect, sourceData: a.sourceData as any })),
          recJobs.map((j) => ({ id: j.id, matchedAxes: j.matchedAxes })),
        );
        return buildAxisResponse(migrated);
      }
```
- [ ] Keep the existing v2 and flat branches BELOW as fallback for users with no SkillProfile. (`buildLessonData` currently returns an object with at least `id, title, courseName?, duration, status, locked` — if a field the UI reads is missing, extend `buildLessonData` minimally; do not change existing consumers.)
- [ ] Run: `pnpm --filter @mpstats/api typecheck && pnpm --filter @mpstats/api test` — expect PASS. Adjust any learning-router test expecting the old shape.
- [ ] Commit: `git add packages/api/src/routers/learning.ts && git commit -m "feat(api): getRecommendedPath serves v3 enriched axis sections + migrate-on-read"`

---

### Task 3.4 — `rebuildLegacyLearningPath` outputs v3

**Files:**
- Modify: `packages/api/src/utils/legacy-path-rebuild.ts`
- Modify: `packages/api/src/routers/learning.ts` (legacy flat-rebuild pre-branch re-parses as v3)

- [ ] Rewrite `legacy-path-rebuild.ts` to produce `AxisLearningPath` via `generateAxisPath`, dropping v2 `custom` handling, keeping D-07 (no LessonProgress) + `$transaction`:
```ts
import type { PrismaClient } from '@mpstats/db';
import type { AxisLearningPath, SkillCategory, SkillProfile } from '@mpstats/shared';
import { parseLearningPath } from '@mpstats/shared';
import { generateAxisPath } from '../routers/diagnostic';
import { getRecommendedJobsFromGaps } from './job-matcher';

export type RebuildResult = { rebuilt: boolean; reason?: string };

function calculateSkillProfileFromAnswers(answers: Array<{ skillCategory: SkillCategory; isCorrect: boolean }>): SkillProfile {
  const buckets: Record<string, { correct: number; total: number }> = {};
  for (const a of answers) {
    if (!buckets[a.skillCategory]) buckets[a.skillCategory] = { correct: 0, total: 0 };
    buckets[a.skillCategory].total++;
    if (a.isCorrect) buckets[a.skillCategory].correct++;
  }
  const pct = (cat: string) => (buckets[cat] && buckets[cat].total > 0 ? Math.round((buckets[cat].correct / buckets[cat].total) * 100) : 0);
  return { analytics: pct('ANALYTICS'), marketing: pct('MARKETING'), content: pct('CONTENT'), operations: pct('OPERATIONS'), finance: pct('FINANCE') };
}

/** Rebuild a legacy flat/v2 LearningPath into v3 on read. Never touches LessonProgress (D-07). */
export async function rebuildLegacyLearningPath(prisma: PrismaClient, userId: string): Promise<RebuildResult> {
  try {
    const path = await prisma.learningPath.findUnique({ where: { userId }, select: { lessons: true } });
    if (!path || !path.lessons) return { rebuilt: false, reason: 'not-found' };
    const parsed = parseLearningPath(path.lessons);
    if (!Array.isArray(parsed) && (parsed as any).version === 3) return { rebuilt: false, reason: 'already-v3' };

    const session = await prisma.diagnosticSession.findFirst({ where: { userId, status: 'COMPLETED' }, orderBy: { completedAt: 'desc' }, select: { id: true } });
    if (!session) return { rebuilt: false, reason: 'no-diagnostic' };
    const answers = await prisma.diagnosticAnswer.findMany({ where: { sessionId: session.id }, select: { isCorrect: true, sourceData: true, skillCategory: true } });
    if (answers.length === 0) return { rebuilt: false, reason: 'no-diagnostic' };

    const skillProfile = calculateSkillProfileFromAnswers(answers.map((a) => ({ skillCategory: a.skillCategory as SkillCategory, isCorrect: a.isCorrect })));
    const profile = await prisma.userProfile.findUnique({ where: { id: userId }, select: { marketplaces: true } });
    const recommendedJobs = await getRecommendedJobsFromGaps(prisma, { skillProfile, userMarketplaces: profile?.marketplaces ?? [], limit: 3 });

    let axisPath: AxisLearningPath;
    try {
      axisPath = await generateAxisPath(prisma, skillProfile, session.id, answers.map((a) => ({ isCorrect: a.isCorrect, sourceData: a.sourceData as any })), recommendedJobs.map((j) => ({ id: j.id, matchedAxes: j.matchedAxes })));
    } catch (err) {
      console.error('[legacy-path-rebuild] generateAxisPath failed:', err);
      return { rebuilt: false, reason: 'generation-failed' };
    }

    const addedJobIds = recommendedJobs.map((j) => j.id);
    await prisma.$transaction(async (tx) => {
      await tx.learningPath.update({ where: { userId }, data: { lessons: axisPath as any, addedJobs: addedJobIds as any, generatedAt: new Date() } });
    });
    return { rebuilt: true };
  } catch (err) {
    console.error('[legacy-path-rebuild] error:', err);
    return { rebuilt: false, reason: `error: ${err instanceof Error ? err.message : String(err)}` };
  }
}
```
- [ ] In `learning.ts`, since Task 3.3 already migrates non-v3 users with a SkillProfile on read, keep `rebuildLegacyLearningPath` as the persistence path (called where the flat-rebuild pre-branch was). Ensure after `rebuild.rebuilt` the code re-parses and, if v3, calls `buildAxisResponse(refreshedParsed)`. Confirm no ordering conflict with the 3.3 v3 check (the migrate-on-read covers the read; rebuild persists).
- [ ] Verify no other runtime caller imports `generateSectionedPath`: `grep -rn "generateSectionedPath" packages/api/src`. If only its own def + tests remain, mark it `@deprecated` (do not delete — safety).
- [ ] Run: `pnpm --filter @mpstats/api typecheck && pnpm --filter @mpstats/api test` — expect PASS. Update any legacy-rebuild test asserting v2 → v3.
- [ ] Commit: `git add packages/api/src/utils/legacy-path-rebuild.ts packages/api/src/routers/learning.ts && git commit -m "feat(api): rebuildLegacyLearningPath emits AxisLearningPath v3"`

---

### Task 3.5 — Attach axis reason to recommended jobs (results screen «почему»)

**Files:**
- Modify: `packages/api/src/utils/axis-path.ts` (add `pickJobAxisReason`)
- Modify: `packages/api/src/utils/__tests__/axis-path.test.ts` (append)
- Modify: `packages/shared/src/types/index.ts` (`RecommendedJob` — add axis fields)
- Modify: `packages/api/src/routers/diagnostic.ts` (`getResults` — attach fields to recommendedJobs, ~925-930)

The results-screen UI shows «Закрывает: {axisLabel} — {axisScore}%». Backend must populate `axis`/`axisLabel`/`axisScore` on each recommended job (its weakest matched axis).

- [ ] Add axis fields to `RecommendedJob` in `packages/shared/src/types/index.ts` (after `matchedAxes: string[];`):
```ts
  // Axis reason for results screen «Закрывает: {axisLabel} — {axisScore}%».
  axis?: string;
  axisLabel?: string;
  axisScore?: number;
```
- [ ] Append failing test to `axis-path.test.ts`:
```ts
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
```
- [ ] Run: `pnpm --filter @mpstats/api test axis-path` — expect FAIL.
- [ ] Append to `packages/api/src/utils/axis-path.ts`:
```ts
import type { SkillProfile } from '@mpstats/shared';

/** Pick the weakest matched axis for a job + its score/label, for the results-screen reason line. */
export function pickJobAxisReason(
  matchedAxes: SkillCategory[],
  skillProfile: SkillProfile,
  categoryKeyMap: Record<SkillCategory, keyof SkillProfile>,
  labels: Record<SkillCategory, string>,
): { axis: SkillCategory; axisLabel: string; axisScore: number } | null {
  if (!matchedAxes || matchedAxes.length === 0) return null;
  const weakest = matchedAxes.reduce((best, ax) =>
    skillProfile[categoryKeyMap[ax]] < skillProfile[categoryKeyMap[best]] ? ax : best);
  return { axis: weakest, axisLabel: labels[weakest], axisScore: skillProfile[categoryKeyMap[weakest]] };
}
```
- [ ] Run: `pnpm --filter @mpstats/api test axis-path` — expect PASS.
- [ ] Wire into `getResults` where `recommendedJobs` are assembled (~925-930). Import `pickJobAxisReason` + `SKILL_LABELS`; map each job:
```ts
          const recommendedJobs = rawRecommendedJobs.map((j) => {
            const reason = pickJobAxisReason(j.matchedAxes as any, skillProfile, CATEGORY_KEY_MAP, SKILL_LABELS);
            return { ...j, axis: reason?.axis, axisLabel: reason?.axisLabel, axisScore: reason?.axisScore };
          });
```
(Adapt variable name to the actual local; the existing code already produces the job array from `getRecommendedJobsFromGaps` — wrap that array with this map.)
- [ ] Run: `pnpm --filter @mpstats/api typecheck && pnpm --filter @mpstats/shared typecheck && pnpm --filter @mpstats/api test` — expect PASS.
- [ ] Commit: `git add packages/api/src/utils/axis-path.ts packages/api/src/utils/__tests__/axis-path.test.ts packages/shared/src/types/index.ts packages/api/src/routers/diagnostic.ts && git commit -m "feat(api): attach weakest-axis reason to recommended jobs"`

---

### Task 3.6 — Full backend verification gate

**Files:** none (verification only)

- [ ] Run: `pnpm --filter @mpstats/api test` — all PASS.
- [ ] Run: `pnpm --filter @mpstats/shared test` — all PASS.
- [ ] Run: `pnpm --filter @mpstats/shared typecheck && pnpm --filter @mpstats/api typecheck` — PASS.
- [ ] Confirm no runtime `generateSectionedPath` call remains: `grep -rn "generateSectionedPath" packages/api/src` (only `@deprecated` def + legacy tests).
- [ ] Commit any test-expectation fixups: `git add -A && git commit -m "test(api): align diagnostic/learning tests with AxisLearningPath v3"`
