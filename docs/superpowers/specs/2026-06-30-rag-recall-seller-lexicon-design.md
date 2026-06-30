# RAG recall + seller-lexicon query expansion — design

**Date:** 2026-06-30
**Status:** approved (owner), implementing
**Branch:** `worktree-lesson-chat-retrieval-recall`

## Problem

The in-lesson AI assistant returns «в этом фрагменте урока ответа нет» for on-topic
questions, so to the client it looks like the assistant simply doesn't work. Two
root causes were confirmed against prod:

1. **Recall floor too strict for lesson-scoped chat.** Chat retrieves with a fixed
   0.5 cosine floor. Since `lessonId` already scopes the pool to a single lesson,
   the whole lesson is relevant context, but terse/abbreviated questions or
   transcripts phrased differently from the question score below 0.5 against every
   chunk → empty context → flat refusal. Measured: «опиши анализ ЦА» best 0.355;
   «топ-3 проблемы в воронке» best 0.195 against the correctly-titled lesson.

2. **Seller abbreviations break retrieval.** The embedding model does not equate
   «ЦА» with «целевая аудитория». Sellers speak in abbreviations (ЦА, ДРР, CPO,
   CTR, CR, SKU, FBO/FBS, ЛК, УТП, РК…). Failing to understand them means we don't
   speak the client's language. This bites hardest on cross-lesson **search**
   (`searchLessons`, `intent.resolve`), where the 0.5 floor is legitimate and the
   only lever is improving the query.

## Scope

In scope:
- **Fix 1 (recall fallback):** done — `generateChatResponse` re-retrieves the
  lesson's best chunks with `threshold: 0` when the primary pass returns nothing.
- **Fix 2 (seller-lexicon query expansion):** a reusable util applied to the
  *embedding* query on three surfaces.

Out of scope (deferred to the future cross-platform assistant task):
- Ingesting the glossary into RAG so the assistant can *explain* a term (option C).
- Mapping colloquial pain-phrases («корзины есть, выкупа нет») as synonyms.
- A platform-wide assistant surface (option B from the product discussion).

## Design — `expandSellerQuery`

`packages/ai/src/seller-lexicon.ts`

```
expandSellerQuery(query: string): string
```

Detects known seller abbreviations/terms in the query and **appends** the
expansion in parentheses (never replaces, so the original signal is preserved):

- «опиши анализ ЦА» → «опиши анализ ЦА (целевая аудитория)»
- «снизить ДРР и CPO» → «снизить ДРР (доля рекламных расходов) и CPO (стоимость заказа)»

Rules:
- **Token-boundary match.** Cyrillic is not recognised by `\b`, so use lookaround
  (`(?<![\wа-яёА-ЯЁ])TERM(?![\wа-яёА-ЯЁ])`) — mirrors the approach in
  `fixBrandNames`. Prevents «ЦА» matching inside a longer word.
- **No double-expansion.** If the expansion text is already present in the query,
  skip it (avoid «целевая аудитория (целевая аудитория)»).
- **Curated, high-confidence dictionary** (~40–60 entries) seeded from
  `docs/obshchiy_glossariy_sellera_2026.docx` + standard marketplace lexicon.
  Ambiguous or noisy short tokens are excluded.
- Latin terms (CTR, CPO, SKU, FBO…) match case-insensitively; Cyrillic terms
  (ЦА, ДРР, РК…) match as written.
- Pure function, no I/O, no LLM call — deterministic and cheap.

### Application points (expand only the embedded query)

| Surface | File | What gets expanded |
|---|---|---|
| Lesson chat | `generation.ts` `generateChatResponse` | both `retrieve` passes' query |
| `/learn` search | `routers/ai.ts` `searchLessons` | only the `searchChunks` (vector) query; keyword `contains` stays on the original |
| Intent engine | `ai/src/intent/…` before `embedQuery` | the query passed to `embedQuery` |

The user-facing message and the question sent to the LLM stay **original** — the
LLM already understands abbreviations; expansion only helps vector retrieval.
Keyword/title `contains` matching must use the original (expansion would break it).

## Testing

- Unit (`seller-lexicon.test.ts`): hit expands; no false match inside a word;
  multiple abbreviations in one query; no-op when no term present; no
  double-expansion when the expansion is already written out; case-insensitive
  Latin.
- Wiring: `generateChatResponse` embeds the expanded query (assert retrieve/embed
  receives expansion); `searchLessons` sends expanded query to the vector path but
  the original to the keyword `contains` branch.

## Rollout

Recall fix + lexicon ship together (one logical story «assistant understands the
client»), one PR, one staging→prod pass. No migrations. Behavioural/visual only.
Verified end-to-end against prod before merge.
