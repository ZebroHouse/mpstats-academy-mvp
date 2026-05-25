---
name: track-b-agentic-search
description: Track B (intent→jobs engine) shipped to prod 2026-05-25 as v1.9 — replaces keyword search on /learn with LLM-mediated intent retrieval. PR #10 + marker-split hotfix 820c5b8.
type: project
---

# Track B — Agentic Search (shipped 2026-05-25)

**Spec:** `docs/superpowers/specs/2026-05-20-agentic-search-design.md`
**Plan:** `docs/superpowers/plans/2026-05-20-track-b-intent-jobs-engine.md`
**PR #10** squash-merged as `a9c8402`. Hotfix `820c5b8` (marker split) on top of master.

## What it does

User types free-text on `/learn` («как снизить ДРР на Wildberries»). Backend `intent.resolve` returns one of 4 modes:

- **recommend** — 1-3 jobs from retrieval, with reason text from LLM + add-to-track action.
- **clarify** — single broad term («Ozon», «реклама») → question + 2-4 option chips, clicking re-runs with refined intent.
- **fallback** — no strong job match → answer text + suggested lessons (rare).
- **empty** — out-of-scope («цена нефти») → polite-decline message.

Same engine pre-runs on `/welcome` Step 1 in background; result stored under `WELCOME_INTENT_RESULT_KEY` (`apps/web/src/components/welcome/intent-key.ts`) for `/learn` to pick up.

## Architecture

```
query → embedQuery (text-embedding-3-small, 1536d)
      ↓
      ├─ searchJobsByEmbedding (pgvector ivfflat cosine, threshold 0.2)
      └─ aggregateChunksToJobs (content_chunks → JobLesson → jobs)
      ↓
      mergeJobCandidates (0.7·embSim + 0.3·chunkSim, async — backfills meta for chunk-only hits)
      ↓ slice(0, 8)
      synthesizeIntentResponse (gpt-4.1-mini, JSON schema, zod validation)
      ↓ filter to validIds (hallucination guardrail)
      ↓ enrich with title/slug/lessonCount from candidates
      → IntentResult
```

Files: `packages/ai/src/intent/{types,retrieval,synthesize,resolve,embed-jobs}.ts`.

## DB

Migration `20260522000000_add_job_embedding`:
- `Job.embedding vector(1536)` Unsupported column
- `Job_embedding_idx` ivfflat (lists=50) cosine

Applied to prod Supabase. Idempotent backfill: `pnpm tsx packages/ai/src/intent/embed-jobs.ts` (skip if non-null; `--force` to re-embed). 29/29 jobs embedded ~$0.0001.

## Frontend

`AgentSearch` (`apps/web/src/components/learning/AgentSearch.tsx`):
- Loading: button «Найти» → «Ищем…» + pulsing-dot placeholder block.
- Reactive track state — subscribes to `learning.getRecommendedPath`, `trackedJobIds = new Set(addedJobs.map(pb => pb.id))`. Jobs in that set render «В треке ✓» disabled, not «Положить в трек». No local state.
- Hallucination guardrail visible to user: recommend cards render real title/slug from server, never raw cuid.

`/welcome` `StepIntent` (`apps/web/src/components/welcome/StepIntent.tsx`): on Next click, `trpc.intent.resolve.useMutation()` fires without await; result written to `sessionStorage[WELCOME_INTENT_RESULT_KEY]` for downstream UI.

`/learn/track` redesign in same session:
- «Мои плейбуки» — compact card grid (title + progress + lesson count + chevron, whole card is `<Link>` to `/learn/job/<slug>`). No lesson lists in track overview.
- Flat-list branch (legacy unsectioned `LearningPath`) now wrapped in Card with «Мои уроки» purple header + `onRemoveFromTrack` passed to LessonCard. Pre-existing UX gap surfaced when playbook compaction stopped masking it.

## Marker split (hotfix `820c5b8`)

Phase 57's `JobSummary.isRecommended` fired for any job whose lessons appeared in `LearningPath.lessons[]`. After Track B made it trivial to add jobs via «+ В трек», the amber «Рекомендовано диагностикой» badge incorrectly fired on manually-added jobs.

Now two independent JobSummary signals (`packages/shared/src/types/index.ts`):
- `isInTrack: boolean` — `addedJobs[]` contains the job. Green badge «В треке».
- `isRecommended: boolean` — at least one lesson is in the path AND not part of any manually-added playbook (`!addedJobLessonIds.has(jl.lessonId)`). Amber «Рекомендовано диагностикой».

Mutually exclusive at render (`apps/web/src/components/learning/JobCard.tsx`): in-track wins. Backend computes `addedJobLessonIds` by querying `JobLesson` for all jobIds in `LearningPath.addedJobs`.

## Eval

22-case reference set in `scripts/intent-eval/cases.json` covering recommend/clarify/fallback/empty + broad-term cases. Run `pnpm tsx scripts/intent-eval/run-eval.ts`. Gate ≥85%. Final score **20/22 = 90.9%**. Two acceptable misses: «нейросети для маркетплейсов» picks wrong top-1, «цена нефти» occasionally clarifies instead of empty.

Calibration history (commit `7800370`):
- 1st run scored 0/22. LLM emitted `recommendations` / `message` instead of `jobs` / `answer`. Fixed: SYSTEM prompt rewritten with explicit field-name examples per mode.
- Retrieval threshold 0.5 → 0.2 (both `searchJobsByEmbedding` default and `resolve.ts` call site — they had diverged).
- Broad-query handling: `isBroadQuery()` detects single-token queries without verb markers, injects clarify instruction into user message; if retrieval also empty → synthesize clarify response locally (no LLM call).

Connection pool drops mid-eval handled via 3-attempt retry on `resolveIntent` + pre-cached slug→id map (single query at startup, not per-case).

## Calibration knobs

- `retrieval.ts` `threshold` default 0.2 (was 0.5)
- `resolve.ts` `threshold: 0.2` (explicit override on the call site)
- `retrieval.ts` `W_EMB = 0.7`, `W_CHUNK = 0.3`
- `retrieval.ts` `limit = 10`, `chunkLimit = 30`
- `resolve.ts` `slice(0, 8)` after merge
- `synthesize.ts` LLM model `openai/gpt-4.1-mini`, `response_format: { type: 'json_object' }`
- `synthesize.ts` `isBroadQuery` verb markers: `как / хочу / помоги / что / где / когда / почему / нужн / надо`

## Gotchas surfaced this session

- **Next.js page-export safety** — `apps/web/src/app/welcome/page.tsx` can ONLY export `default` / `metadata` / `dynamic` / etc. Custom const exports break build with «X is not a valid Page export field». Move shared constants to a sibling non-route module (`apps/web/src/components/welcome/intent-key.ts`).
- **server-only marker blocks tsx scripts** — `packages/ai/src/openrouter.ts` has `import 'server-only'`. Standalone `npx tsx ...` fails. Workaround: `NODE_OPTIONS='--conditions=react-server' npx tsx ...` (per `scripts/vision-ingest/smoke-baseline.ts` convention).
- **Prisma can't deserialize `vector` columns** — `SELECT embedding FROM "Job"` via `$queryRawUnsafe` errors with `Failed to deserialize column of type 'extensions.vector'`. Workaround: `SELECT ("embedding" IS NOT NULL) AS has_embedding` to check presence without pulling the vector through Prisma. `$executeRawUnsafe` for updates is fine.
- **OpenRouter JSON mode requires «json» token in prompt** — without it Azure-routed gpt-4.1-mini returns 400 «Response input messages must contain the word 'json' in some form to use 'text.format' of type 'json_object'». Added explicit «Ответ верни строго как JSON-объект…» to SYSTEM prompt.
- **Legacy flat-format `LearningPath` blocks rebuild** — for users whose `LearningPath.lessons` is `string[]` (pre-Phase 23) instead of sectioned, `learning.rebuildTrack` 500s. Workaround: re-pass diagnostic, which regenerates path in sectioned format, then rebuild works. Pre-existing master issue, not Track B.
- **`gh pr merge --delete-branch` conflicts with worktrees** — gh CLI tries to `git checkout master` locally to delete the branch, fails if master is checked out in another worktree («fatal: 'master' is already used»). Use `gh pr merge --squash` without `--delete-branch`, delete branch separately if needed.
