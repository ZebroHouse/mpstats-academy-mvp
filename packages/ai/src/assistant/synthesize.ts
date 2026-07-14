import { z } from 'zod';
import { getOpenRouterClient, MODELS } from '../openrouter';
import { fixBrandNames } from '../generation';
import type { AssistantHistoryMessage, AssistantBranchResult, AssistantMaterialRef, LessonCandidate, MaterialCandidate } from './types';
import type { JobCandidate } from '../intent/types';

export interface SynthesizeArgs {
  query: string;
  history: AssistantHistoryMessage[];
  lessonCandidates: LessonCandidate[];
  jobCandidates: JobCandidate[];
  // MA4: принимается для будущего whitelist в MA5; пока не используется.
  materialCandidates: MaterialCandidate[];
}

const llmSchema = z.object({
  answer: z.string().min(1),
  lessonIds: z.array(z.string()).default([]),
  jobIds: z.array(z.string()).default([]),
  materialIds: z.array(z.string()).default([]),
});

const FALLBACK_ANSWER =
  'Кажется, я не смог собрать точный ответ. Переформулируй вопрос — или загляни в Базу знаний, там есть материалы по большинству тем.';

const SYSTEM = `Ты — помощник обучающей платформы для селлеров Wildberries и Ozon. Отвечай по-русски, кратко и по делу.

ПРАВИЛА:
1. Отвечай по существу на вопрос про бизнес продавца (механика МП, финансы бизнеса, реклама, аналитика, операционка). Если в КОНТЕКСТЕ есть релевантные материалы — опирайся на них; если нет — можешь ответить общими знаниями в рамках темы селлера.
2. НЕ выдумывай живые рыночные данные (какие ниши горячи, конкретные цифры спроса) и НЕ давай директивных финсоветов «вложи сюда». На такие вопросы объясняй МЕТОД и предлагай проверить гипотезы в сервисе MPSTATS.
3. В поле "answer" пиши ТОЛЬКО связный содержательный ответ обычным текстом. КАТЕГОРИЧЕСКИ НЕЛЬЗЯ: перечислять, называть или упоминать в тексте конкретные уроки/задачи, писать их id, технические коды (вроде 04_workshops_...), слово «id=», ссылки или списки «полезные уроки». Подходящие материалы платформа сама покажет отдельными карточками под ответом — их выбираешь ТОЛЬКО через массивы lessonIds/jobIds.
4. В lessonIds/jobIds клади ТОЛЬКО те id из списка КАНДИДАТОВ ниже, что реально релевантны вопросу (обычно 1–3, не все подряд). Не придумывай id. Если ничего толком не подходит — верни пустые массивы, и в тексте на карточки не ссылайся.
5. В "materialIds" клади ТОЛЬКО id из списка КАНДИДАТОВ-МАТЕРИАЛОВ ниже и ТОЛЬКО если материал прямо в тему вопроса или юзер просит шаблон/чек-лист/таблицу. МАКСИМУМ 1-2, не вываливай все. Обычно 0-1. Не придумывай id. В тексте ответа материалы и их id не упоминай.

Верни СТРОГО JSON (в "answer" — только человекочитаемый текст, без id и без перечня уроков):
{"answer": "<markdown-ответ без упоминания уроков и id>", "lessonIds": ["<id из кандидатов>"], "jobIds": ["<id из кандидатов>"], "materialIds": ["<id>"]}`;

function buildUserMessage(args: SynthesizeArgs): string {
  const lessons = args.lessonCandidates
    .map((l) => `- УРОК id=${l.lessonId} | ${l.title} | ${l.snippet}`)
    .join('\n');
  const jobs = args.jobCandidates
    .map((j) => `- ЗАДАЧА id=${j.jobId} | ${j.title} (${j.lessonCount} уроков)`)
    .join('\n');
  const materials = args.materialCandidates
    .map((m) => `- МАТЕРИАЛ id=${m.materialId} | ${m.title} | ${m.type}`)
    .join('\n');
  const hist = args.history
    .slice(-10)
    .map((m) => `${m.role === 'user' ? 'Юзер' : 'Ассистент'}: ${m.content}`)
    .join('\n');

  return `ИСТОРИЯ ДИАЛОГА:\n${hist || '(пусто)'}\n\nВОПРОС: ${args.query}\n\nКАНДИДАТЫ-УРОКИ:\n${lessons || '(нет)'}\n\nКАНДИДАТЫ-ЗАДАЧИ:\n${jobs || '(нет)'}\n\nКАНДИДАТЫ-МАТЕРИАЛЫ:\n${materials || '(нет)'}`;
}

export async function synthesizeAssistantResponse(args: SynthesizeArgs): Promise<AssistantBranchResult> {
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
    return { answer: FALLBACK_ANSWER, lessons: [], jobs: [], navLinks: [], materials: [] };
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

  const CAP = 2;
  const materialById = new Map(args.materialCandidates.map((m) => [m.materialId, m]));
  const materials = parsed.materialIds
    .filter((id) => materialById.has(id))
    .slice(0, CAP)
    .map((id) => {
      const m = materialById.get(id)!;
      return {
        materialId: id, type: m.type, title: m.title, ctaText: m.ctaText,
        isAccessible: true, // STUB: реальный доступ проставит роутер (MB2); здесь всегда true
        externalUrl: m.externalUrl, hasFile: m.hasFile,
      } satisfies AssistantMaterialRef;
    });

  return { answer: fixBrandNames(parsed.answer), lessons, jobs, navLinks: [], materials };
}
