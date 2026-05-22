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

const SYSTEM = `Ты — ассистент учебной платформы MPSTATS Academy. Тебе дают свободный текст пользователя и список кандидатов-джобов (учебных наборов). Твоя задача:

1. Если запрос конкретный и среди кандидатов есть один-три явно подходящих джоба → mode:"recommend". Дай короткий 1-2 предложения ответ и выбери 1-3 jobId из кандидатов, к каждому — однострочный reason ("почему этот набор").
2. Если запрос размыт и кандидаты охватывают несколько разных тем → mode:"clarify". Сформулируй один уточняющий вопрос и 2-4 опции (label + intent для следующего шага). Опции — из кластеров кандидатов.
3. Если ни один джоб не сильный (топ-кандидат < 0.55 по combinedScore) → mode:"fallback". Объясни и предложи 1-3 отдельных урока (lessonId из snippets уроков).
4. Если кандидатов вообще нет — mode:"empty".

КРИТИЧНО: jobId выбирать ТОЛЬКО из переданных кандидатов. Никаких выдуманных ID.`;

export interface SynthesizeArgs {
  query: string;
  candidates: JobCandidate[];
  conversationState?: string;
}

export async function synthesizeIntentResponse(args: SynthesizeArgs): Promise<IntentResult> {
  if (args.candidates.length === 0) {
    return {
      mode: 'empty',
      message: 'По этой теме точного материала не нашёл. Открой каталог или фильтры рядом.',
    };
  }

  const userMsg = JSON.stringify({
    query: args.query,
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
    return { mode: 'empty', message: 'Не получилось разобрать ответ. Открой каталог.' };
  }

  const validIds = new Set(args.candidates.map((c) => c.jobId));

  if (parsed.data.mode === 'recommend') {
    const cleaned = parsed.data.jobs.filter((j) => validIds.has(j.jobId));
    if (cleaned.length === 0) {
      return { mode: 'fallback', answer: parsed.data.answer, lessons: [] };
    }
    return {
      mode: 'recommend',
      answer: parsed.data.answer,
      jobs: cleaned.map((j) => ({
        jobId: j.jobId,
        reason: j.reason,
        actions: [
          { type: 'add_to_track', jobId: j.jobId, label: 'Положить в трек' } as IntentAction,
        ],
      })),
    };
  }

  if (parsed.data.mode === 'clarify') {
    return { ...parsed.data, conversationState: randomUUID() };
  }

  return parsed.data;
}
