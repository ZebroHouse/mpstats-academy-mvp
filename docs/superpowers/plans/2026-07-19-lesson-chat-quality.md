# Lesson-Chat Quality — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the in-lesson AI chat handle meta/greeting questions with a warm orientation (no RAG), turn cold content-refusals into helpful redirects, and fix the `isRefusalAnswer` analytics heuristic so real refusals are counted.

**Architecture:** A pure meta-question detector short-circuits `ai.chat` before RAG (returns a canned orientation built from the lesson title). The RAG system prompt is softened so genuine content-misses start with a stable anchor phrase and don't dump screen artifacts. `isRefusalAnswer` is widened (interpolation regex + new anchor) so both the old and new refusal wordings register as `noAnswer=true`; meta orientations persist as answered (`noAnswer=false`) via a new `answered` flag on `buildChatMessageRows`.

**Tech Stack:** tRPC, Prisma, OpenRouter (gpt-4.1-mini), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-19-lesson-chat-quality-design.md`

---

## Ground rules

- No migrations, no DB writes beyond the existing best-effort `ChatMessage` persist. Pure code + prompt change.
- **The `isRefusalAnswer` anchor and the #2B refusal copy MUST agree.** The prompt (Task 2) instructs the model to start refusals with «В этом уроке это не разбирается»; `isRefusalAnswer` (Task 1) matches that exact phrase. If you change one, change the other.
- Meta short-circuit persists with `answered: true` → `noAnswer=false` (a meta orientation is a handled answer, not a miss). Content path is unchanged except the widened refusal detection.
- The `ai.chat` return shape `{ content, sources, model }` stays stable; persist stays best-effort (`try/catch`).
- **Working dir:** the worktree `.claude/worktrees/lesson-chat-quality/` (branch `feature/lesson-chat-quality`). Fresh worktree — run `pnpm install` once if `node_modules` is missing.

---

## File Structure

- **Modify** `packages/api/src/utils/lesson-chat-analytics.ts` — widen `isRefusalAnswer`; add `isMetaQuestion` + `buildMetaOrientation`; add `answered?` to `buildChatMessageRows`.
- **Modify** `packages/api/src/utils/lesson-chat-analytics.test.ts` — tests for all of the above.
- **Modify** `packages/ai/src/generation.ts` — soften the refusal instruction in the system prompt (one line).
- **Modify** `packages/api/src/routers/ai.ts` — meta short-circuit in the `chat` mutation before RAG.

---

## Task 1: Pure utils — refusal widening, meta detector, orientation copy, answered flag

**Files:**
- Modify: `packages/api/src/utils/lesson-chat-analytics.ts`
- Test: `packages/api/src/utils/lesson-chat-analytics.test.ts`

- [ ] **Step 1: Write the failing tests** (append new describe blocks to the existing test file)

```ts
import { isMetaQuestion, buildMetaOrientation } from './lesson-chat-analytics';

describe('isRefusalAnswer — widened', () => {
  it('catches the interpolated prod refusal', () => {
    expect(isRefusalAnswer('В этом фрагменте урока ответа на вопрос «Что ты умеешь?» нет.')).toBe(true);
  });
  it('catches the new softened refusal anchor', () => {
    expect(isRefusalAnswer('В этом уроке это не разбирается. Спросите про настройку рекламы.')).toBe(true);
  });
  it('still catches the plain forms', () => {
    expect(isRefusalAnswer('ответа нет в контексте')).toBe(true);
    expect(isRefusalAnswer('Извините, не удалось сгенерировать ответ.')).toBe(true);
  });
  it('does not flag a normal grounded answer', () => {
    expect(isRefusalAnswer('ДРР — доля рекламных расходов [1]. Считается как расходы делить на выручку.')).toBe(false);
  });
});

describe('isMetaQuestion', () => {
  it('flags capability / meta questions', () => {
    expect(isMetaQuestion('Что ты умеешь?')).toBe(true);
    expect(isMetaQuestion('какой вопрос я тебе могу задать')).toBe(true);
    expect(isMetaQuestion('кто ты')).toBe(true);
  });
  it('flags short greetings', () => {
    expect(isMetaQuestion('Привет')).toBe(true);
    expect(isMetaQuestion('привет бот')).toBe(true);
  });
  it('does NOT flag real content questions', () => {
    expect(isMetaQuestion('Что можешь рассказать про юнит-экономику?')).toBe(false);
    expect(isMetaQuestion('Как настроить рекламную кампанию на Wildberries?')).toBe(false);
    expect(isMetaQuestion('привет, расскажи как считать ДРР по этому уроку')).toBe(false);
  });
  it('does NOT flag empty', () => {
    expect(isMetaQuestion('   ')).toBe(false);
  });
});

describe('buildMetaOrientation', () => {
  it('includes the lesson title when present', () => {
    const s = buildMetaOrientation('Настройка автобиддера');
    expect(s).toContain('«Настройка автобиддера»');
    expect(s.toLowerCase()).toContain('ассистент');
  });
  it('falls back gracefully without a title', () => {
    const s = buildMetaOrientation(undefined);
    expect(s).toContain('по этому уроку');
    expect(s).not.toContain('«»');
  });
});

describe('buildChatMessageRows — answered flag', () => {
  it('forces noAnswer=false for an answered meta orientation even with sourceCount 0', () => {
    const rows = buildChatMessageRows({ userId: 'u', lessonId: 'l', message: 'что ты умеешь', answer: 'Я — ассистент…', model: 'meta', sourceCount: 0, answered: true });
    expect(rows[1].noAnswer).toBe(false);
  });
  it('still flags a content refusal (no answered flag)', () => {
    const rows = buildChatMessageRows({ userId: 'u', lessonId: 'l', message: 'q', answer: 'В этом уроке это не разбирается.', model: 'm', sourceCount: 5 });
    expect(rows[1].noAnswer).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @mpstats/api test src/utils/lesson-chat-analytics.test.ts`
Expected: FAIL — `isMetaQuestion`/`buildMetaOrientation` not exported; interpolation/anchor cases fail.

- [ ] **Step 3: Implement**

Replace the `REFUSAL_SUBSTRINGS` + `isRefusalAnswer` block (top of the file) with:

```ts
const REFUSAL_SUBSTRINGS = [
  'ответа нет',
  'нет ответа',
  'не удалось сгенерировать',
  'нет в контексте',
  'в контексте нет',
  'не содержится',
  'в этом уроке это не разбирается', // #2B softened-refusal anchor — keep in sync with generation.ts prompt
];

// Catches interpolated refusals like «ответа на вопрос «…» нет» (text between "ответа" and "нет").
const REFUSAL_REGEX = /\bответа?\b[^.!?\n]{0,60}\bнет\b/i;

export function isRefusalAnswer(content: string): boolean {
  const c = content.toLowerCase();
  return REFUSAL_SUBSTRINGS.some((p) => c.includes(p)) || REFUSAL_REGEX.test(content);
}
```

Add `answered?` to the persist input and honor it in the builder:

```ts
export interface ChatPersistInput {
  userId: string;
  lessonId: string;
  message: string; // user query
  answer: string; // assistant content
  model: string;
  sourceCount: number;
  answered?: boolean; // true for a handled meta orientation → forces noAnswer=false
}
```

In `buildChatMessageRows`, change the noAnswer line:

```ts
  const noAnswer = i.answered === true ? false : i.sourceCount === 0 || isRefusalAnswer(i.answer);
```

Append the meta detector + orientation builder at the end of the file:

```ts
// ---- Meta-question handling (in-lesson chat) ----

const META_PATTERNS = [
  'что ты умеешь',
  'что умеешь',
  'что ты можешь',
  'что можешь делать',
  'чем ты можешь помочь',
  'чем можешь помочь',
  'чем помож',
  'какой вопрос',
  'что можно спросить',
  'что тебе можно задать',
  'что тебе задать',
  'кто ты',
  'ты кто',
];

const GREETINGS = ['привет', 'здравствуй', 'здравствуйте', 'добрый день', 'добрый вечер', 'доброе утро', 'hi', 'hello', 'help', 'хелп'];

/**
 * Heuristic: is this a meta/greeting question ABOUT the assistant (not lesson content)?
 * Guarded to SHORT messages so mid-sentence occurrences in real questions
 * («что можешь рассказать про X») don't trigger. False positives only cost the
 * user an orientation instead of an answer; they can rephrase.
 */
export function isMetaQuestion(message: string): boolean {
  const norm = message
    .trim()
    .toLowerCase()
    .replace(/[«»"'?!.,:;()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!norm) return false;
  const wordCount = norm.split(' ').length;
  if (wordCount > 6) return false;
  // Greetings only when the message is essentially just a greeting (≤2 words).
  if (wordCount <= 2 && GREETINGS.some((g) => norm.startsWith(g))) return true;
  return META_PATTERNS.some((p) => norm.includes(p));
}

/** Warm orientation shown for meta/greeting questions (MPSTATS voice, «вы»). */
export function buildMetaOrientation(lessonTitle?: string): string {
  const title = lessonTitle?.trim();
  const about = title ? `по этому уроку: «${title}»` : 'по этому уроку';
  return `Я — ассистент ${about}. Помогу разобраться с материалом: объясню понятия, уточню детали, подскажу, где в уроке искать нужное. Спросите, например: «Что такое…?», «Как…?», «Зачем…?» — отвечу по содержанию урока.`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @mpstats/api test src/utils/lesson-chat-analytics.test.ts`
Expected: PASS (existing + new cases).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/utils/lesson-chat-analytics.ts packages/api/src/utils/lesson-chat-analytics.test.ts
git commit -m "feat(ai): meta detector + orientation copy, widen refusal detection, answered flag"
```

---

## Task 2: Soften the refusal in the RAG system prompt

**Files:**
- Modify: `packages/ai/src/generation.ts` (system prompt, line 263)

- [ ] **Step 1: Replace the refusal instruction line**

Find this exact line (line 263 in the system prompt):

```
- НЕ ВЫДУМЫВАЙ — если в контексте нет ответа, прямо скажи «в этом фрагменте урока ответа нет»
```

Replace with:

```
- НЕ ВЫДУМЫВАЙ. Если в предоставленном контексте нет ответа на вопрос — НЕ пересказывай служебные/навигационные слайды (QR-коды, «время для вопросов», приглашения в Telegram) и ничего не придумывай. Ответь по-человечески: начни ОТВЕТ РОВНО с фразы «В этом уроке это не разбирается», затем одним предложением предложи задать вопрос по теме урока с 1–2 короткими примерами.
```

- [ ] **Step 2: Typecheck ai package**

Run: `pnpm --filter @mpstats/ai typecheck`
Expected: PASS (string-only change).

- [ ] **Step 3: Run ai package tests** (ensure nothing about generation broke)

Run: `pnpm --filter @mpstats/ai test`
Expected: PASS (existing suite; this is a prompt string change, no test asserts its exact text).

- [ ] **Step 4: Commit**

```bash
git add packages/ai/src/generation.ts
git commit -m "feat(ai): softer, helpful lesson-chat refusal (no screen-artifact dumps, stable anchor)"
```

---

## Task 3: Meta short-circuit in `ai.chat`

**Files:**
- Modify: `packages/api/src/routers/ai.ts` (the `chat` mutation)

- [ ] **Step 1: Extend the import** — change the existing import from `../utils/lesson-chat-analytics` to include the meta helpers:

```ts
import { buildChatMessageRows, isMetaQuestion, buildMetaOrientation } from '../utils/lesson-chat-analytics';
```

- [ ] **Step 2: Add the meta short-circuit** at the top of the mutation body, BEFORE the `generateChatResponse` call. Replace the body from `const { lessonId, message, history } = input;` up to (but not including) `const result = await generateChatResponse(` with:

```ts
      const { lessonId, message, history } = input;

      // Meta/greeting questions ("что ты умеешь", "привет") are about the assistant,
      // not lesson content — RAG either refuses or grabs irrelevant slides. Short-circuit
      // with a warm orientation built from the lesson title; no RAG call.
      if (isMetaQuestion(message)) {
        const lesson = await ctx.prisma.lesson.findUnique({ where: { id: lessonId }, select: { title: true } });
        const content = buildMetaOrientation(lesson?.title ?? undefined);
        try {
          await ctx.prisma.chatMessage.createMany({
            data: buildChatMessageRows({ userId: ctx.user!.id, lessonId, message, answer: content, model: 'meta', sourceCount: 0, answered: true }),
          });
        } catch (err) {
          console.error('[ai.chat] ChatMessage persist failed (non-fatal):', err);
        }
        return { content, sources: [], model: 'meta' };
      }

```

(The existing `const result = await generateChatResponse(...)` block and everything after it — the content-path persist and the `return { content, sources, model }` — stays unchanged.)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @mpstats/api typecheck`
Expected: PASS. (`ctx.prisma.lesson.findUnique`, `ctx.user!.id` both valid; `Lesson.title` exists.)

- [ ] **Step 4: Run full api suite**

Run: `pnpm --filter @mpstats/api test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/ai.ts
git commit -m "feat(ai): short-circuit meta/greeting questions to orientation (skip RAG)"
```

---

## Task 4: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full api suite + ai suite**

Run: `pnpm --filter @mpstats/api test && pnpm --filter @mpstats/ai test`
Expected: both PASS.

- [ ] **Step 2: Workspace typecheck**

Run: `pnpm --filter @mpstats/api typecheck && pnpm --filter @mpstats/ai typecheck && pnpm --filter web typecheck`
Expected: all PASS.

- [ ] **Step 3: Production web build**

Run: `pnpm --filter web build`
Expected: succeeds. (No frontend change here, but build proves the API/AI packages compile into the app.) If it fails with `Cannot find module .../next/...`, that's the known pnpm-store artifact → `pnpm install --force`, rebuild once.

- [ ] **Step 4: Staging UAT (manual — required, prompt behavior can't be unit-tested)**

After staging deploy (controller), on a real lesson verify:
1. Meta question («Что ты умеешь?») → orientation with the lesson title, no sources, no screen artifacts.
2. Off-topic-but-plausible question with no lesson answer → helpful refusal starting «В этом уроке это не разбирается» + a topic suggestion (NOT a QR/Telegram slide dump).
3. A normal content question → still answered correctly with citations.
Then check `ChatMessage`: the meta row has `noAnswer=false`; the refusal row has `noAnswer=true`.

- [ ] **Step 5: No commit** — verification only.

---

## Deploy (controller steps — NOT a subagent)

No migration. Standard: staging build-gate `--no-cache web` → **manual UAT (the 3 cases above)** → merge `--no-ff` master → prod `--no-cache web` + recreate + smoke. Rollback: `git revert -m 1 <merge>` + redeploy.

---

## Self-review notes (author)

- **Spec coverage:** #1 refusal widening → Task 1 (REFUSAL_REGEX + anchor); #2A meta → Task 1 (`isMetaQuestion`/`buildMetaOrientation`) + Task 3 (short-circuit wiring); #2B helpful refusal → Task 2 (prompt). Persist-linkage (`answered`) → Task 1 + used in Task 3.
- **Anchor consistency:** the prompt (Task 2) emits «В этом уроке это не разбирается»; `isRefusalAnswer` (Task 1) lists that exact substring. Called out in Ground rules.
- **Meta false-positive stance:** documented — short-message guard + specific patterns; a misfire only downgrades to an orientation, recoverable.
- **Type consistency:** `answered?` optional (existing callers unaffected — the content-path call in ai.ts passes no `answered`). `model: 'meta'` is a plain string, fits the `model: string` field.
- **No frontend changes:** the tab already renders whatever the procedures return; nothing to touch there.
- **Deferred:** LLM-based meta classification, per-lesson example questions from content, retro-reclassification of existing rows.
