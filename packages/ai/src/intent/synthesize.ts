import 'server-only';

import { z } from 'zod';
import { randomUUID } from 'crypto';
import { openrouter } from '../openrouter';
import type { IntentResult, JobCandidate, IntentAction } from './types';

const llmSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('recommend'),
    answer: z.string(),
    jobs: z.array(z.object({ jobId: z.string(), reason: z.string() })).min(1).max(3),
  }),
  z.object({
    mode: z.literal('clarify'),
    question: z.string(),
    options: z.array(z.object({ label: z.string(), intent: z.string() })).min(2).max(4),
  }),
  z.object({
    mode: z.literal('fallback'),
    answer: z.string(),
    lessons: z.array(z.object({ lessonId: z.string(), reason: z.string() })).min(1).max(3),
  }),
  z.object({ mode: z.literal('empty'), message: z.string() }),
]);

const SYSTEM = `Ты — ассистент учебной платформы MPSTATS Academy. Тебе дают свободный текст пользователя и список кандидатов-джобов (учебных наборов). Верни строго JSON по одной из схем ниже:

ВАРИАНТ 1 — recommend (есть 1-3 явно подходящих джоба среди кандидатов):
{"mode":"recommend","answer":"<строка 1-2 предложения>","jobs":[{"jobId":"<id из кандидатов>","reason":"<строка>"}, ...до 3]}

ВАРИАНТ 2 — clarify (используй ТОЛЬКО когда запрос — это одно общее слово БЕЗ глагола и без конкретики:
   - примеры clarify: "реклама", "аналитика", "продажи", "Ozon", "Wildberries", "карточки", "товары"
   - НЕ clarify если в запросе есть конкретный глагол/намерение ("хочу научиться X", "как сделать Y") — это recommend
   Сформулируй один уточняющий вопрос и 2-4 опции (label + intent для следующего запроса), отражающие основные подтемы из кандидатов):
{"mode":"clarify","question":"<строка>","options":[{"label":"<строка>","intent":"<строка для след.запроса>"}, ...2-4]}

ВАРИАНТ 3 — fallback (используй ТОЛЬКО если ни один из кандидатов даже отдалённо не подходит к запросу и есть отдельные урок-snippets):
{"mode":"fallback","answer":"<строка>","lessons":[{"lessonId":"<id из snippets>","reason":"<строка>"}, ...до 3]}

ВАРИАНТ 4 — empty (нет кандидатов или ничего не подходит):
{"mode":"empty","message":"<строка>"}

КРИТИЧНО:
- Используй РОВНО те имена полей, что указаны выше (answer, jobs, lessons, jobId, lessonId, question, options).
- jobId выбирать ТОЛЬКО из переданных кандидатов. Никаких выдуманных ID.
- НЕ используй "recommendations", "message" вместо "answer" в recommend/fallback, не возвращай lessons как массив строк.
- Без markdown, без текста вокруг JSON.`;

export interface SynthesizeArgs {
  query: string;
  candidates: JobCandidate[];
  conversationState?: string;
  forceClarify?: boolean;
}

function isBroadQuery(q: string): boolean {
  const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length > 2) return false;
  // single token, or 2 tokens without verb-like intent (как, хочу, помоги, что, где, когда)
  const verbMarkers = ['как', 'хочу', 'помоги', 'что', 'где', 'когда', 'почему', 'нужн', 'надо'];
  return !tokens.some((t) => verbMarkers.some((v) => t.startsWith(v)));
}

export async function synthesizeIntentResponse(args: SynthesizeArgs): Promise<IntentResult> {
  if (args.candidates.length === 0) {
    if (isBroadQuery(args.query) || args.forceClarify) {
      return {
        mode: 'clarify',
        question: `Уточни запрос «${args.query}» — что именно интересует?`,
        options: [
          { label: 'Wildberries', intent: `${args.query} на Wildberries` },
          { label: 'Ozon', intent: `${args.query} на Ozon` },
          { label: 'С чего начать', intent: `${args.query} — с чего начать` },
        ],
        conversationState: randomUUID(),
      };
    }
    return {
      mode: 'empty',
      message: 'По этой теме точного материала не нашёл. Открой каталог или фильтры рядом.',
    };
  }

  const broad = args.forceClarify || isBroadQuery(args.query);
  const userMsg = JSON.stringify({
    query: args.query,
    queryIsBroadSingleTerm: broad,
    instruction: broad
      ? 'Запрос — широкое одиночное слово/термин. ОБЯЗАТЕЛЬНО используй mode:"clarify" — задай уточняющий вопрос и предложи 2-4 опции из главных подтем кандидатов.'
      : undefined,
    candidates: args.candidates.map((c) => ({
      jobId: c.jobId,
      title: c.title,
      description: c.description,
      lessonCount: c.lessonCount,
      combinedScore: Number(c.combinedScore.toFixed(3)),
      topSnippets: c.topSnippets.map((s) => s.content),
    })),
  });

  const resp = await openrouter.chat.completions.create({
    model: 'openai/gpt-4.1-mini',
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: userMsg },
    ],
    response_format: { type: 'json_object' },
  });

  const content = resp.choices[0]?.message?.content;
  if (!content) {
    return { mode: 'empty', message: 'Не получилось разобрать ответ. Открой каталог.' };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return { mode: 'empty', message: 'Не получилось разобрать ответ. Открой каталог.' };
  }

  const parsed = llmSchema.safeParse(raw);
  if (!parsed.success) {
    if (process.env.INTENT_DEBUG) {
      console.error('[intent.synthesize] zod fail:', JSON.stringify(raw).slice(0, 500));
      console.error('[intent.synthesize] zod errors:', parsed.error.errors.slice(0, 3));
    }
    return { mode: 'empty', message: 'Не получилось разобрать ответ. Открой каталог.' };
  }

  const validIds = new Set(args.candidates.map((c) => c.jobId));

  if (parsed.data.mode === 'recommend') {
    const cleaned = parsed.data.jobs.filter((j) => validIds.has(j.jobId));
    if (cleaned.length === 0) {
      return { mode: 'fallback', answer: parsed.data.answer, lessons: [] };
    }
    const metaById = new Map(args.candidates.map((c) => [c.jobId, c]));
    return {
      mode: 'recommend',
      answer: parsed.data.answer,
      jobs: cleaned.map((j) => {
        const meta = metaById.get(j.jobId)!;
        return {
          jobId: j.jobId,
          title: meta.title,
          slug: meta.slug,
          lessonCount: meta.lessonCount,
          reason: j.reason,
          actions: [
            { type: 'add_to_track', jobId: j.jobId, label: 'Положить в трек' } as IntentAction,
          ],
        };
      }),
    };
  }

  if (parsed.data.mode === 'clarify') {
    return { ...parsed.data, conversationState: randomUUID() };
  }

  return parsed.data;
}
