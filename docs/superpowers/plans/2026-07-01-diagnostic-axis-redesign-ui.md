# Diagnostic Axis-Redesign — UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Execute the backend plan first** (`2026-07-01-diagnostic-axis-redesign-backend.md`) — this plan consumes the v3 enriched response it produces.

**Goal:** Rebuild `/diagnostic/results` into a single axis-centric flow (explainer + jobs-with-reason + capped lesson teaser + one CTA) and `/learn/plan` into an axis-section accordion, consuming the backend's v3 `getRecommendedPath`.

**Architecture:** New presentational components (`HowLearningWorks`, `ResultsLessonTeaser`, `axis-section` helpers), edits to `results/page.tsx`, `plan/page.tsx`, `RecommendedJobsBlock.tsx`, and the `/learn` redirect. Consumer-only — no backend/router edits.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind, shadcn, Vitest + Testing Library. Spec: `docs/superpowers/specs/2026-07-01-diagnostic-plan-axis-redesign-design.md`.

---

## Consumed contract (produced by the backend plan)

`learning.getRecommendedPath` for a v3 path returns:

```ts
{
  generatedAt: Date; isAxis: true;
  sections: Array<{
    axis: string; label: string; score: number;
    tier: 'weak' | 'medium' | 'strong'; collapsed: boolean;
    jobs: Array<{ id: string; slug: string; title: string; lessons: EnrichedLesson[] }>;
    lessons: EnrichedLesson[];       // non-error lessons of the axis
    errorLessons: EnrichedLesson[];  // error-review lessons of the axis
  }>;                                 // sorted weakest-first
  lessons: EnrichedLesson[];         // flat, for counts
  totalLessons: number; completedLessons: number;
  addedJobs: /* existing */; hasPlatformSubscription: boolean;
}
// EnrichedLesson: { id, title, courseName?, duration, status:'NOT_STARTED'|'IN_PROGRESS'|'COMPLETED', locked, ... }
```

`diagnostic.getResults.recommendedJobs[]` carry `axis`, `axisLabel`, `axisScore` (weakest matched axis).

---

## Wave 4: Экран результатов

### Task 4.1 — Inline-блок «Как устроено обучение»

**Files:**
- Create: `apps/web/src/components/diagnostic/HowLearningWorks.tsx`
- Create: `apps/web/tests/unit/how-learning-works.test.tsx`

Пояснительный inline-блок (§6.3): объясняет Задача (маршрут из уроков под цель) и Урок (один материал: видео/текст). Чистый презентационный компонент.

- [ ] Написать падающий тест `apps/web/tests/unit/how-learning-works.test.tsx`:
```tsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { HowLearningWorks } from '@/components/diagnostic/HowLearningWorks';

afterEach(() => cleanup());

describe('HowLearningWorks', () => {
  it('renders the section heading', () => {
    const { getByText } = render(<HowLearningWorks />);
    expect(getByText('Как устроено обучение')).toBeTruthy();
  });
  it('explains what a Задача is', () => {
    const { getByText } = render(<HowLearningWorks />);
    expect(getByText('Задача')).toBeTruthy();
    expect(getByText(/готовый маршрут из уроков под конкретную цель/i)).toBeTruthy();
  });
  it('explains what a Урок is', () => {
    const { getByText } = render(<HowLearningWorks />);
    expect(getByText('Урок')).toBeTruthy();
    expect(getByText(/один материал: видео или текст/i)).toBeTruthy();
  });
});
```
- [ ] Run: `pnpm --filter web test how-learning-works` — expect FAIL.
- [ ] Create `apps/web/src/components/diagnostic/HowLearningWorks.tsx`:
```tsx
'use client';

import { Layers, PlaySquare } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

/** Inline explainer on the results screen (spec §6.3). Owner decision: inline block, not tooltip. */
export function HowLearningWorks() {
  return (
    <Card className="shadow-mp-card border-mp-gray-200">
      <CardContent className="py-5">
        <h2 className="text-heading font-semibold text-mp-gray-900 mb-3">Как устроено обучение</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-[#eef0ff] text-[#4338ca] shrink-0"><Layers className="w-5 h-5" /></div>
            <div>
              <div className="text-body font-semibold text-mp-gray-900">Задача</div>
              <p className="text-body-sm text-mp-gray-500 mt-0.5">Готовый маршрут из уроков под конкретную цель.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-mp-gray-50 text-mp-gray-500 shrink-0"><PlaySquare className="w-5 h-5" /></div>
            <div>
              <div className="text-body font-semibold text-mp-gray-900">Урок</div>
              <p className="text-body-sm text-mp-gray-500 mt-0.5">Один материал: видео или текст.</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```
- [ ] Run: `pnpm --filter web test how-learning-works` — expect PASS.
- [ ] Commit: `feat(diagnostic): add «Как устроено обучение» inline explainer`

---

### Task 4.2 — Axis-подпись «Закрывает: {axisLabel} — {axisScore}%» в RecommendedJobsBlock

**Files:**
- Modify: `apps/web/src/components/diagnostic/RecommendedJobsBlock.tsx` (job map ~91-108)
- Create: `apps/web/tests/unit/recommended-jobs-axis.test.tsx`

> Backend Task 3.5 adds `axis`/`axisLabel`/`axisScore` to `RecommendedJob` and populates them. This task only renders them.

- [ ] Написать падающий тест `apps/web/tests/unit/recommended-jobs-axis.test.tsx`:
```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    useUtils: () => ({ learning: { getRecommendedPath: { invalidate: vi.fn() } }, job: { getCatalog: { invalidate: vi.fn() } } }),
    learning: { getRecommendedPath: { useQuery: () => ({ data: undefined }) }, addJobToTrack: { useMutation: () => ({ mutateAsync: vi.fn() }) } },
  },
}));

import { RecommendedJobsBlock } from '@/components/diagnostic/RecommendedJobsBlock';

const baseJob = { slug: 's', description: 'd', marketplace: 'WB' as const, axes: [], lessonCount: 3, totalDurationMin: 30, completedLessons: 0, isRecommended: true, isInTrack: false, score: 0.9, matchedAxes: [], badges: [] as string[] };

afterEach(() => cleanup());

describe('RecommendedJobsBlock — axis reason label', () => {
  it('shows reason with «(ваша слабейшая зона)» on job #1', () => {
    const jobs = [
      { ...baseJob, id: 'j1', title: 'Задача 1', rank: 1 as const, axis: 'ANALYTICS', axisLabel: 'Аналитика', axisScore: 33 },
      { ...baseJob, id: 'j2', title: 'Задача 2', rank: 2 as const, axis: 'MARKETING', axisLabel: 'Маркетинг', axisScore: 50 },
    ];
    const { getByText } = render(<RecommendedJobsBlock jobs={jobs} />);
    expect(getByText('Закрывает: Аналитика — 33% (ваша слабейшая зона)')).toBeTruthy();
  });
  it('shows plain reason on job #2', () => {
    const jobs = [
      { ...baseJob, id: 'j1', title: 'Задача 1', rank: 1 as const, axis: 'ANALYTICS', axisLabel: 'Аналитика', axisScore: 33 },
      { ...baseJob, id: 'j2', title: 'Задача 2', rank: 2 as const, axis: 'MARKETING', axisLabel: 'Маркетинг', axisScore: 50 },
    ];
    const { getByText } = render(<RecommendedJobsBlock jobs={jobs} />);
    expect(getByText('Закрывает: Маркетинг — 50%')).toBeTruthy();
  });
  it('renders no axis label when axis data is absent', () => {
    const jobs = [{ ...baseJob, id: 'j1', title: 'Задача 1', rank: 1 as const }];
    const { queryByText } = render(<RecommendedJobsBlock jobs={jobs} />);
    expect(queryByText(/^Закрывает:/)).toBeNull();
  });
});
```
- [ ] Run: `pnpm --filter web test recommended-jobs-axis` — expect FAIL.
- [ ] Replace the card map (~91-108) in `RecommendedJobsBlock.tsx`:
```tsx
        {jobs.map((job) => {
          const isInTrack = derivedIsInTrack(job.id, job.isInTrack);
          const axisReason =
            job.axis && job.axisLabel && typeof job.axisScore === 'number'
              ? `Закрывает: ${job.axisLabel} — ${job.axisScore}%${job.rank === 1 ? ' (ваша слабейшая зона)' : ''}`
              : null;
          return (
            <div key={job.id} className="relative">
              <div aria-hidden className="absolute -top-2 -left-2 z-10 w-8 h-8 rounded-full bg-mp-blue-500 text-white text-body font-bold flex items-center justify-center shadow-mp-md">
                {RANK_LABEL[job.rank]}
              </div>
              <JobCard job={{ ...job, isInTrack }} onAddToTrack={handleSingleAdd} isAddPending={pendingId === job.id || bulkPending} />
              {axisReason && <p className="mt-2 text-body-sm font-medium text-mp-blue-600">{axisReason}</p>}
            </div>
          );
        })}
```
(If local helper names differ — `derivedIsInTrack`, `RANK_LABEL`, `handleSingleAdd`, `pendingId`, `bulkPending` — read the file and keep the existing names; only add the `axisReason` computation + `<p>`.)
- [ ] Run: `pnpm --filter web test recommended-jobs-axis && pnpm typecheck` — expect PASS.
- [ ] Commit: `feat(diagnostic): show axis reason on recommended jobs`

---

### Task 4.3 — Teaser-список уроков по слабым осям с cap

**Files:**
- Create: `apps/web/src/components/diagnostic/ResultsLessonTeaser.tsx`
- Create: `apps/web/tests/unit/results-lesson-teaser.test.tsx`

Короткий «пощупать»-список по 1-2 слабым осям (§6.5), лимит `RESULTS_LESSON_TEASER_CAP=5`. Потребляет v3 `sections` (weakest-first).

- [ ] Написать падающий тест `apps/web/tests/unit/results-lesson-teaser.test.tsx`:
```tsx
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
```
- [ ] Run: `pnpm --filter web test results-lesson-teaser` — expect FAIL.
- [ ] Create `apps/web/src/components/diagnostic/ResultsLessonTeaser.tsx`:
```tsx
'use client';

import Link from 'next/link';

export const RESULTS_LESSON_TEASER_CAP = 5; // never a wall (spec §6.5)
const TEASER_AXES = 2;

interface TeaserLesson { id: string; title: string; courseName?: string }
interface TeaserSection { axis: string; label: string; score: number; lessons: TeaserLesson[] }

/** Short "start with a single lesson" list — two weakest axes, hard-capped total, grouped by axis label. */
export function ResultsLessonTeaser({ sections }: { sections: TeaserSection[] }) {
  const weakSections = sections.slice(0, TEASER_AXES);
  let budget = RESULTS_LESSON_TEASER_CAP;
  const grouped: Array<{ label: string; lessons: TeaserLesson[] }> = [];
  for (const section of weakSections) {
    if (budget <= 0) break;
    const take = section.lessons.slice(0, budget);
    if (take.length === 0) continue;
    grouped.push({ label: section.label, lessons: take });
    budget -= take.length;
  }
  const total = grouped.reduce((n, g) => n + g.lessons.length, 0);
  if (total === 0) return null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-heading text-mp-gray-900">Или начните с отдельного урока</h2>
        <p className="text-body-sm text-mp-gray-500 mt-1">Несколько уроков по вашим слабым зонам</p>
      </div>
      {grouped.map((group) => (
        <div key={group.label} className="space-y-2">
          <p className="text-body-sm font-semibold text-mp-gray-700">{group.label}</p>
          {group.lessons.map((lesson) => (
            <Link key={lesson.id} href={`/learn/${lesson.id}`} className="flex items-center gap-3 bg-white border border-mp-gray-200 rounded-xl px-4 py-3 shadow-mp-card hover:shadow-mp-card-hover transition-shadow">
              <div className="min-w-0">
                <div className="text-body font-medium text-mp-gray-900 leading-snug line-clamp-1">{lesson.title}</div>
                {lesson.courseName && <div className="text-caption text-mp-gray-400 mt-0.5">{lesson.courseName}</div>}
              </div>
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}
```
- [ ] Run: `pnpm --filter web test results-lesson-teaser` — expect PASS.
- [ ] Commit: `feat(diagnostic): add capped per-axis lesson teaser for results screen`

---

### Task 4.4 — Пересборка `/diagnostic/results` (убрать «стену трёх списков»)

**Files:**
- Modify: `apps/web/src/app/(main)/diagnostic/results/page.tsx` (imports after ~12; replace CTA ~251-277; delete duplicate `RecommendedJobsBlock` ~280 + «Track preview» IIFE ~282-333)
- Create: `apps/web/tests/unit/diagnostic-results-page.test.tsx`

Поток §6: хедер → радар → «Как устроено обучение» → «С чего начать» (задачи с axis-подписью) → teaser уроков → главный CTA «Открыть персональный план» (→ `/learn/plan`).

- [ ] Написать падающий тест `apps/web/tests/unit/diagnostic-results-page.test.tsx`:
```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }), useSearchParams: () => ({ get: () => 'sess-1' }) }));
vi.mock('@/lib/analytics/metrika', () => ({ reachGoal: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/charts/RadarChart', () => ({ SkillRadarChart: () => <div data-testid="radar" /> }));

let mockResults: { data: unknown; isLoading: boolean };
let mockPath: { data: unknown };
vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    useUtils: () => ({ learning: { getRecommendedPath: { invalidate: vi.fn() } }, job: { getCatalog: { invalidate: vi.fn() } } }),
    diagnostic: { getResults: { useQuery: () => mockResults }, getHistory: { useQuery: () => ({ data: [] }) } },
    learning: { getRecommendedPath: { useQuery: () => mockPath }, addJobToTrack: { useMutation: () => ({ mutateAsync: vi.fn() }) } },
  },
}));

import DiagnosticResultsPage from '@/app/(main)/diagnostic/results/page';

const results = {
  sessionId: 'sess-1', totalQuestions: 15, correctAnswers: 6, accuracy: 40, skillProfile: {},
  gaps: [{ category: 'ANALYTICS', label: 'Аналитика', currentScore: 33, targetScore: 80, gap: 47, priority: 'HIGH' }],
  recommendedPath: ['l1', 'l2'],
  recommendedJobs: [{ id: 'j1', slug: 's1', title: 'Задача 1', description: 'd', marketplace: 'WB', axes: [], lessonCount: 3, totalDurationMin: 30, completedLessons: 0, isRecommended: true, isInTrack: false, score: 0.9, matchedAxes: [], badges: [], rank: 1, axis: 'ANALYTICS', axisLabel: 'Аналитика', axisScore: 33 }],
};
const path = {
  isAxis: true,
  sections: [{ axis: 'ANALYTICS', label: 'Аналитика', score: 33, tier: 'weak', collapsed: false, jobs: [], lessons: [{ id: 'a1', title: 'Урок А1', courseName: 'Курс' }], errorLessons: [] }],
  lessons: [{ id: 'a1', title: 'Урок А1', courseName: 'Курс', locked: false, status: 'NOT_STARTED' }],
  addedJobs: [],
};

beforeEach(() => { pushMock.mockReset(); mockResults = { data: results, isLoading: false }; mockPath = { data: path }; });
afterEach(() => cleanup());

describe('DiagnosticResultsPage — axis-centric flow', () => {
  it('renders the explainer', () => { expect(render(<DiagnosticResultsPage />).getByText('Как устроено обучение')).toBeTruthy(); });
  it('main CTA links to the personal plan', () => {
    const cta = render(<DiagnosticResultsPage />).getByRole('link', { name: /Открыть персональный план/i });
    expect(cta.getAttribute('href')).toBe('/learn/plan');
  });
  it('does NOT render the legacy «Рекомендованные уроки» wall', () => {
    expect(render(<DiagnosticResultsPage />).queryByText('Рекомендованные уроки')).toBeNull();
  });
  it('renders the per-axis lesson teaser', () => {
    const { getByText } = render(<DiagnosticResultsPage />);
    expect(getByText('Или начните с отдельного урока')).toBeTruthy();
    expect(getByText('Урок А1')).toBeTruthy();
  });
});
```
- [ ] Run: `pnpm --filter web test diagnostic-results-page` — expect FAIL.
- [ ] Add imports after ~line 12 in `results/page.tsx`:
```tsx
import { HowLearningWorks } from '@/components/diagnostic/HowLearningWorks';
import { ResultsLessonTeaser } from '@/components/diagnostic/ResultsLessonTeaser';
```
- [ ] Replace the CTA card (~251-277) with the new flow + plan CTA:
```tsx
      {/* Как устроено обучение (spec §6.3) */}
      <HowLearningWorks />

      {/* С чего начать — задачи с axis-подписью «почему» */}
      <RecommendedJobsBlock jobs={results.recommendedJobs ?? []} />

      {/* Или начните с отдельного урока — capped teaser (spec §6.5) */}
      {recommendedPath?.sections && (
        <ResultsLessonTeaser sections={recommendedPath.sections as any} />
      )}

      {/* Главный CTA */}
      <Card variant="gradient" className="shadow-mp-lg">
        <CardContent className="py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="font-sans text-2xl sm:text-3xl font-bold tracking-tight text-mp-gray-900">Готов персональный план обучения</h3>
              <p className="text-body text-mp-gray-500 mt-1">План собран по вашим слабым зонам — слабейшие сверху</p>
            </div>
            <div className="flex gap-3">
              <Link href="/learn/plan"><Button size="lg" className="shadow-mp-md">Открыть персональный план →</Button></Link>
              <Link href="/dashboard"><Button variant="outline" size="lg">На главную</Button></Link>
            </div>
          </div>
        </CardContent>
      </Card>
```
(`recommendedPath` is the local from `learning.getRecommendedPath.useQuery` already in the page — confirm its name when reading the file.)
- [ ] Delete the duplicate `<RecommendedJobsBlock ... />` (~280) and the entire «Track preview with gating» IIFE (~282-333, the «Рекомендованные уроки» block). Keep the page's closing `</div>` (~334).
- [ ] Run: `pnpm --filter web test diagnostic-results-page recommended-jobs-axis results-lesson-teaser how-learning-works` — expect PASS.
- [ ] Commit: `feat(diagnostic): rebuild results screen into single axis-centric flow`

---

### Task 4.5 — Фикс редиректа `/learn` (непустой ось-план → `/learn/plan`)

**Files:**
- Modify: `apps/web/src/app/(main)/learn/page.tsx` (25-33)

v3 уроки лежат в `sections[].lessonIds`, а не в плоском `lessons` → расширяем детекцию непустоты.

- [ ] Replace lines 25-33:
```tsx
  const path = await prisma.learningPath.findUnique({
    where: { userId: user.id },
    select: { lessons: true, addedJobs: true },
  });

  const raw = path?.lessons as unknown;
  const addedJobs = path?.addedJobs;
  const hasArrayLessons = Array.isArray(raw) && raw.length > 0;
  const hasSectionLessons =
    !!raw && typeof raw === 'object' &&
    Array.isArray((raw as { sections?: unknown[] }).sections) &&
    (raw as { sections: Array<{ lessonIds?: unknown[]; errorLessonIds?: unknown[] }> }).sections.some(
      (s) => (s.lessonIds?.length ?? 0) > 0 || (s.errorLessonIds?.length ?? 0) > 0,
    );
  const hasAddedJobs = Array.isArray(addedJobs) && addedJobs.length > 0;
  const hasPlan = hasArrayLessons || hasSectionLessons || hasAddedJobs;

  redirect(hasPlan ? '/learn/plan' : '/learn/library');
```
- [ ] Run: `pnpm --filter web typecheck` — expect PASS (server component; redirect verified on staging).
- [ ] Commit: `fix(learn): route non-empty axis/section plan to /learn/plan not library`

---

## Wave 5: Экран плана

### Task 5.1 — Ось-логика заголовков секций (helpers + test)

**Files:**
- Create: `apps/web/src/app/(main)/learn/plan/axis-section.ts`
- Create: `apps/web/tests/unit/plan-axis-section.test.tsx`

- [ ] Написать падающий тест `apps/web/tests/unit/plan-axis-section.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { AXIS_TIER_STYLE, tierBadgeLabel, axisSectionTitle } from '@/app/(main)/learn/plan/axis-section';

describe('axis-section helpers', () => {
  it('maps each tier to a distinct accent', () => {
    expect(AXIS_TIER_STYLE.weak.accent).toContain('border-l-red');
    expect(AXIS_TIER_STYLE.medium.accent).toContain('border-l-yellow');
    expect(AXIS_TIER_STYLE.strong.accent).toContain('border-l-mp-green');
  });
  it('renders tier badge labels with spec emojis', () => {
    expect(tierBadgeLabel('weak')).toBe('🔴 слабая');
    expect(tierBadgeLabel('medium')).toBe('🟡 средняя');
    expect(tierBadgeLabel('strong')).toBe('🟢 сильная');
  });
  it('builds the section title', () => { expect(axisSectionTitle('Аналитика', 33)).toBe('Аналитика — 33%'); });
});
```
- [ ] Run: `pnpm --filter web test plan-axis-section` — expect FAIL.
- [ ] Create `apps/web/src/app/(main)/learn/plan/axis-section.ts`:
```ts
export type AxisTier = 'weak' | 'medium' | 'strong';

export const AXIS_TIER_STYLE: Record<AxisTier, { accent: string; chip: string; title: string }> = {
  weak: { accent: 'border-l-red-400', chip: 'bg-red-100 text-red-700', title: 'text-red-700' },
  medium: { accent: 'border-l-yellow-400', chip: 'bg-yellow-100 text-yellow-700', title: 'text-yellow-700' },
  strong: { accent: 'border-l-mp-green-400', chip: 'bg-mp-green-100 text-mp-green-700', title: 'text-mp-green-700' },
};

const TIER_BADGE: Record<AxisTier, string> = { weak: '🔴 слабая', medium: '🟡 средняя', strong: '🟢 сильная' };

export function tierBadgeLabel(tier: AxisTier): string { return TIER_BADGE[tier]; }
export function axisSectionTitle(label: string, score: number): string { return `${label} — ${score}%`; }
```
(If `border-l-mp-green-400`/`bg-mp-green-100` are not in the Tailwind config, use the nearest existing green token — grep `mp-green` in `tailwind.config`.)
- [ ] Run: `pnpm --filter web test plan-axis-section` — expect PASS.
- [ ] Commit: `feat(plan): add axis-tier section styling helpers`

---

### Task 5.2 — Пересборка `/learn/plan` в ось-аккордеон

**Files:**
- Modify: `apps/web/src/app/(main)/learn/plan/page.tsx` (import after ~24; delete level helpers ~34-57; replace state/memo ~63,99-139; update `onMutate` ~73-80; replace section render ~319-402; replace re-diagnostic CTA ~404-424; drop separate addedJobs block ~281-317)
- Create: `apps/web/tests/unit/plan-page-axis.test.tsx`

Consumed shape: `sections[]` c `axis,label,score,tier,collapsed,jobs[],lessons[],errorLessons[]`. weak/medium развёрнуты, strong (`collapsed`) свёрнуты; `errorLessons` наверху с «⚠ Разбор ошибки»; задачи оси внутри секции.

- [ ] Написать падающий тест `apps/web/tests/unit/plan-page-axis.test.tsx`:
```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/learning/LearningTabs', () => ({ LearningTabs: () => <div /> }));

let mockPath: { data: unknown; isLoading: boolean };
vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    useUtils: () => ({ learning: { getRecommendedPath: { cancel: vi.fn(), getData: vi.fn(), setData: vi.fn(), invalidate: vi.fn() } } }),
    learning: {
      getRecommendedPath: { useQuery: () => mockPath },
      removeFromTrack: { useMutation: () => ({ mutate: vi.fn() }) },
      rebuildTrack: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

import PlanPage from '@/app/(main)/learn/plan/page';

const lesson = (id: string, title: string) => ({ id, title, courseName: 'Курс', duration: 10, status: 'NOT_STARTED', locked: false });
const path = {
  isAxis: true, addedJobs: [],
  sections: [
    { axis: 'ANALYTICS', label: 'Аналитика', score: 33, tier: 'weak', collapsed: false,
      jobs: [{ id: 'j1', slug: 'zadacha-1', title: 'Задача аналитики', lessons: [lesson('jl1','Урок задачи')] }],
      lessons: [lesson('a1','Обычный урок аналитики')], errorLessons: [lesson('e1','Разбор ошибки аналитики')] },
    { axis: 'FINANCE', label: 'Финансы', score: 100, tier: 'strong', collapsed: true, jobs: [], lessons: [lesson('f1','Продвинутый урок финансов')], errorLessons: [] },
  ],
};

beforeEach(() => { mockPath = { data: path, isLoading: false }; });
afterEach(() => cleanup());

describe('PlanPage — axis sections', () => {
  it('renders axis title «{label} — {score}%» with tier badge', () => {
    const { getByText } = render(<PlanPage />);
    expect(getByText('Аналитика — 33%')).toBeTruthy();
    expect(getByText('🔴 слабая')).toBeTruthy();
    expect(getByText('Финансы — 100%')).toBeTruthy();
    expect(getByText('🟢 сильная')).toBeTruthy();
  });
  it('expands weak axes and collapses strong ones by default', () => {
    const { getByText, queryByText } = render(<PlanPage />);
    expect(getByText(/Обычный урок аналитики/)).toBeTruthy();
    expect(queryByText(/Продвинутый урок финансов/)).toBeNull();
  });
  it('flags error-review lessons at the top of their axis', () => {
    const { getByText } = render(<PlanPage />);
    expect(getByText('⚠ Разбор ошибки')).toBeTruthy();
    expect(getByText(/Разбор ошибки аналитики/)).toBeTruthy();
  });
  it('renders the axis job block inside the section', () => {
    expect(render(<PlanPage />).getByText('Задача аналитики')).toBeTruthy();
  });
});
```
- [ ] Run: `pnpm --filter web test plan-page-axis` — expect FAIL.
- [ ] Add import after ~24: `import { AXIS_TIER_STYLE, tierBadgeLabel, axisSectionTitle, type AxisTier } from './axis-section';`
- [ ] Delete level constants: `SECTION_DESCRIPTIONS` (~34-41), `SECTION_STYLES` (~43-53), `DIAGNOSTIC_SECTION_IDS` (~55-57). Keep `pluralLessons` (~28-32).
- [ ] Replace expanded-state (~63) + `diagnosticSections`/`hasDiagnosticLessons` (~99-107):
```tsx
  const [expandedAxes, setExpandedAxes] = useState<Set<string> | null>(null);

  const axisSections = useMemo(() => {
    const s = (recommendedPath as any)?.sections as any[] | undefined;
    return Array.isArray(s) ? s.filter((x) => typeof x.axis === 'string') : [];
  }, [recommendedPath]);

  const hasDiagnosticLessons = axisSections.some(
    (s: any) => (s.lessons?.length ?? 0) > 0 || (s.errorLessons?.length ?? 0) > 0,
  );

  const effectiveExpanded = useMemo(() => {
    if (expandedAxes) return expandedAxes;
    return new Set(axisSections.filter((s: any) => !s.collapsed).map((s: any) => s.axis));
  }, [expandedAxes, axisSections]);

  const toggleAxis = (axis: string) => {
    setExpandedAxes(() => {
      const next = new Set(effectiveExpanded);
      if (next.has(axis)) next.delete(axis); else next.add(axis);
      return next;
    });
  };
```
- [ ] Replace `visibleTotal`/`visibleCompleted`/`firstUnfinishedLesson` (~119-139):
```tsx
  const allAxisLessons = useMemo(
    () => axisSections.flatMap((s: any) => [...(s.errorLessons ?? []), ...(s.lessons ?? [])]),
    [axisSections],
  );
  const visibleTotal = allAxisLessons.length;
  const visibleCompleted = useMemo(() => allAxisLessons.filter((l: any) => l.status === 'COMPLETED').length, [allAxisLessons]);
  const firstUnfinishedLesson = useMemo(
    () => allAxisLessons.find((l: any) => l.status === 'IN_PROGRESS') ?? allAxisLessons.find((l: any) => l.status === 'NOT_STARTED') ?? null,
    [allAxisLessons],
  );
```
- [ ] Delete old `toggleSection` (~141-148).
- [ ] Update `removeFromTrackMutation.onMutate` optimistic setData (~73-80) to filter both arrays:
```tsx
      utils.learning.getRecommendedPath.setData(undefined, (old: typeof prev) => {
        if (!old || !(old as any).sections) return old;
        const sections = (old as any).sections.map((s: any) => ({
          ...s,
          lessons: (s.lessons ?? []).filter((l: any) => l.id !== lessonId),
          errorLessons: (s.errorLessons ?? []).filter((l: any) => l.id !== lessonId),
        }));
        return { ...(old as any), sections } as any;
      });
```
- [ ] Replace the section render block (~319-402) with the axis accordion:
```tsx
          {hasDiagnosticLessons && (
            <div className="space-y-3">
              <h2 className="text-heading font-semibold text-mp-gray-900">Ваш план по компетенциям</h2>
              {axisSections
                .filter((s: any) => (s.lessons?.length ?? 0) > 0 || (s.errorLessons?.length ?? 0) > 0 || (s.jobs?.length ?? 0) > 0)
                .map((section: any) => {
                  const tier = section.tier as AxisTier;
                  const style = AXIS_TIER_STYLE[tier] ?? AXIS_TIER_STYLE.medium;
                  const isOpen = effectiveExpanded.has(section.axis);
                  const errorLessons = (section.errorLessons as any[]) ?? [];
                  const normalLessons = (section.lessons as any[]) ?? [];
                  const jobs = (section.jobs as any[]) ?? [];
                  const allLessons = [...errorLessons, ...normalLessons];
                  const completedInSection = allLessons.filter((l: { status: string }) => l.status === 'COMPLETED').length;

                  return (
                    <Card key={section.axis} className={`shadow-mp-card overflow-hidden border-l-4 ${style.accent}`}>
                      <button onClick={() => toggleAxis(section.axis)} aria-expanded={isOpen} className="w-full text-left px-5 py-4 flex items-center justify-between gap-3 hover:bg-mp-gray-50 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${style.chip}`}>{tierBadgeLabel(tier)}</span>
                          <h3 className={`text-heading font-semibold ${style.title}`}>{axisSectionTitle(section.label, section.score)}</h3>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-body-sm font-medium text-mp-gray-500 tabular-nums">{completedInSection}/{allLessons.length}</span>
                          <svg className={`w-5 h-5 text-mp-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </div>
                      </button>

                      {isOpen && (
                        <CardContent className="pt-3 pb-4 px-2 sm:px-5 border-t border-mp-gray-100 space-y-4">
                          {errorLessons.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-body-sm font-bold text-red-700">⚠ Разбор ошибки</p>
                              <div className="grid gap-2 sm:gap-3">
                                {errorLessons.map((lesson: any, idx: number) => (
                                  <LessonCard key={lesson.id} lesson={{ ...lesson, title: `${idx + 1}. ${lesson.title}` } as LessonWithProgress} showCourse courseName={(lesson as Record<string, unknown>).courseName as string} locked={lesson.locked} onRemoveFromTrack={() => removeFromTrackMutation.mutate({ lessonId: lesson.id })} />
                                ))}
                              </div>
                            </div>
                          )}
                          {normalLessons.length > 0 && (
                            <div className="grid gap-2 sm:gap-3">
                              {normalLessons.map((lesson: any, idx: number) => (
                                <LessonCard key={lesson.id} lesson={{ ...lesson, title: `${idx + 1}. ${lesson.title}` } as LessonWithProgress} showCourse courseName={(lesson as Record<string, unknown>).courseName as string} locked={lesson.locked} onRemoveFromTrack={() => removeFromTrackMutation.mutate({ lessonId: lesson.id })} />
                              ))}
                            </div>
                          )}
                          {jobs.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-body-sm font-semibold text-mp-gray-700">Задачи по этой компетенции</p>
                              <div className="grid gap-3 sm:grid-cols-2">
                                {jobs.map((job: any) => {
                                  const jl = (job.lessons as any[]) ?? [];
                                  const done = jl.filter((l: any) => l.status === 'COMPLETED').length;
                                  return (
                                    <Link key={job.id} href={`/learn/job/${job.slug}`} className="flex items-start gap-3 bg-white border border-mp-gray-200 rounded-xl p-4 shadow-mp-card hover:shadow-mp-card-hover transition-shadow">
                                      <div className="p-2 rounded-md bg-mp-gray-50 text-mp-gray-500 shrink-0"><Wrench className="w-5 h-5" /></div>
                                      <div className="min-w-0">
                                        <div className="text-xs text-mp-gray-500 mb-0.5">Задача</div>
                                        <div className="text-body font-semibold text-mp-gray-900 leading-snug line-clamp-2">{job.title}</div>
                                        <div className="text-body-sm text-mp-gray-500 mt-1">{jl.length} уроков · прогресс {done}/{jl.length}</div>
                                      </div>
                                    </Link>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      )}
                    </Card>
                  );
                })}
            </div>
          )}
```
(`Wrench` is imported from `lucide-react` — confirm the import exists at top; the old addedJobs block used it.)
- [ ] Replace the old «Re-diagnostic CTA when errors section completed» (~404-424, keyed on `id === 'errors'`) with a whole-plan-complete CTA:
```tsx
          {visibleTotal > 0 && visibleCompleted === visibleTotal && (
            <Card className="shadow-mp-card border-mp-green-200 bg-gradient-to-br from-mp-green-50 to-white">
              <CardContent className="py-8 text-center">
                <h3 className="text-heading text-mp-gray-900 mb-2">Отлично! План пройден</h3>
                <p className="text-body text-mp-gray-500 mb-4">Хотите проверить, как вырос ваш уровень? Пройдите диагностику снова!</p>
                <Link href="/diagnostic"><Button variant="outline">Пройти диагностику снова</Button></Link>
              </CardContent>
            </Card>
          )}
```
- [ ] Delete the now-unused top-level `addedJobs` memo (~110-113) and its separate «Рекомендованные задачи» block (~281-317) — jobs now live inside axis sections (spec §6.1).
- [ ] Run: `pnpm --filter web test plan-page-axis && pnpm --filter web typecheck` — expect PASS.
- [ ] Commit: `feat(plan): rebuild personal plan into axis-centric accordion sections`

---

### Task 5.3 — Регресс-прогон затронутых web-тестов

**Files:** verification only

- [ ] Run: `pnpm --filter web test how-learning-works results-lesson-teaser recommended-jobs-axis diagnostic-results-page plan-axis-section plan-page-axis` — all PASS.
- [ ] Run: `pnpm --filter web test job-manager trial-countdown welcome-page` — neighbors PASS (spot regression check).
- [ ] Run: `pnpm typecheck` — all packages green.
- [ ] Commit (if fixups): `test(diagnostic): green regression run for axis-redesign UI`
