import { z } from 'zod';
import { getOpenRouterClient, MODELS } from '../openrouter';
import { fixBrandNames } from '../generation';
import type { AssistantHistoryMessage, AssistantTurnResult, LessonCandidate } from './types';
import type { JobCandidate } from '../intent/types';

export interface SynthesizeArgs {
  query: string;
  history: AssistantHistoryMessage[];
  lessonCandidates: LessonCandidate[];
  jobCandidates: JobCandidate[];
}

const llmSchema = z.object({
  answer: z.string().min(1),
  lessonIds: z.array(z.string()).default([]),
  jobIds: z.array(z.string()).default([]),
});

const FALLBACK_ANSWER =
  'Кажется, я не смог собрать точный ответ. Переформулируй вопрос — или загляни в Базу знаний, там есть материалы по большинству тем.';

const SYSTEM = `Ты — помощник обучающей платформы для селлеров Wildberries и Ozon. Отвечай по-русски, кратко и по делу.

ПРАВИЛА:
1. Отвечай по существу на вопрос про бизнес продавца (механика МП, финансы бизнеса, реклама, аналитика, операционка). Если в КОНТЕКСТЕ есть релевантные материалы — опирайся на них; если нет — можешь ответить общими знаниями в рамках темы селлера.
2. НЕ выдумывай живые рыночные данные (какие ниши горячи, конкретные цифры спроса) и НЕ давай директивных финсоветов «вложи сюда». На такие вопросы объясняй МЕТОД и предлагай проверить гипотезы в сервисе MPSTATS.
3. Подмешивай к ответу ТОЛЬКО те уроки/задачи, id которых есть в списке КАНДИДАТОВ ниже. Не придумывай id. Если ничего не подходит — верни пустые массивы.

Верни СТРОГО JSON:
{"answer": "<markdown-ответ>", "lessonIds": ["<id из кандидатов>"], "jobIds": ["<id из кандидатов>"]}`;

function buildUserMessage(args: SynthesizeArgs): string {
  const lessons = args.lessonCandidates
    .map((l) => `- УРОК id=${l.lessonId} | ${l.title} | ${l.snippet}`)
    .join('\n');
  const jobs = args.jobCandidates
    .map((j) => `- ЗАДАЧА id=${j.jobId} | ${j.title} (${j.lessonCount} уроков)`)
    .join('\n');
  const hist = args.history
    .slice(-10)
    .map((m) => `${m.role === 'user' ? 'Юзер' : 'Ассистент'}: ${m.content}`)
    .join('\n');

  return `ИСТОРИЯ ДИАЛОГА:\n${hist || '(пусто)'}\n\nВОПРОС: ${args.query}\n\nКАНДИДАТЫ-УРОКИ:\n${lessons || '(нет)'}\n\nКАНДИДАТЫ-ЗАДАЧИ:\n${jobs || '(нет)'}`;
}

export async function synthesizeAssistantResponse(args: SynthesizeArgs): Promise<AssistantTurnResult> {
  let parsed: z.infer<typeof llmSchema> | null = null;
  try {
    const client = getOpenRouterClient();
    const resp = await client.chat.completions.create({
      model: MODELS.chat,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: buildUserMessage(args) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });
    const raw = resp.choices[0]?.message?.content ?? '';
    const json = JSON.parse(raw);
    const result = llmSchema.safeParse(json);
    if (result.success) parsed = result.data;
  } catch {
    parsed = null;
  }

  if (!parsed) {
    return { inDomain: true, answer: FALLBACK_ANSWER, lessons: [], jobs: [] };
  }

  const lessonById = new Map(args.lessonCandidates.map((l) => [l.lessonId, l]));
  const jobById = new Map(args.jobCandidates.map((j) => [j.jobId, j]));

  const lessons = parsed.lessonIds
    .filter((id) => lessonById.has(id))
    .map((id) => {
      const m = lessonById.get(id)!;
      return { lessonId: id, title: m.title, durationMin: m.durationMin, courseTitle: m.courseTitle, reason: '' };
    });

  const jobs = parsed.jobIds
    .filter((id) => jobById.has(id))
    .map((id) => {
      const m = jobById.get(id)!;
      return { jobId: id, title: m.title, slug: m.slug, lessonCount: m.lessonCount, reason: '' };
    });

  return { inDomain: true, answer: fixBrandNames(parsed.answer), lessons, jobs };
}
