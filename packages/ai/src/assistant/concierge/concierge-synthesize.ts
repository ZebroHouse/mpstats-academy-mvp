import { z } from 'zod';
import { getOpenRouterClient, MODELS } from '../../openrouter';
import { fixBrandNames } from '../../generation';
import type { AssistantHistoryMessage, AssistantNavLink } from '../types';
import type { MapEntry } from './types';

const llmSchema = z.object({ answer: z.string().min(1) });

const FALLBACK =
  'Точно подсказать по этому не берусь, чтобы не запутать. Если что — напиши в поддержку, там помогут.';

// Whitelist: deep-links только из найденных записей карты. LLM их не генерирует.
export function buildNavLinks(entries: MapEntry[]): AssistantNavLink[] {
  const links: AssistantNavLink[] = [];
  for (const e of entries) {
    if (e.kind === 'static' && e.deepLink) links.push(e.deepLink);
  }
  return links;
}

const SYSTEM = `Ты — консьерж обучающей платформы для селлеров WB/Ozon. Помогаешь ориентироваться по платформе и её функциям.
СТРОГО: отвечай ТОЛЬКО на основе предоставленных СПРАВОК ниже. НЕ придумывай кнопок, страниц, шагов и ссылок, которых нет в справках. Можно переформулировать под вопрос пользователя, соединить несколько справок, отвечать живо и кратко по-русски. Ссылки/карточки платформа покажет сама — в тексте их не дублируй и не пиши URL.
Если справок недостаточно, чтобы точно ответить — верни ровно: {"answer":"${FALLBACK}"}.
Верни СТРОГО JSON: {"answer":"<markdown-ответ>"}`;

export interface ConciergeSynthArgs {
  query: string;
  history: AssistantHistoryMessage[];
  entries: MapEntry[];        // найденные записи (grounding-источник)
  courseFacts?: string;       // грунд из живого резолвера (для dynamic)
}

function buildUser(args: ConciergeSynthArgs): string {
  const refs = args.entries
    .map((e) => (e.kind === 'static' ? `СПРАВКА [${e.id}]: ${e.answer}` : `СПРАВКА [${e.id}]: (данные каталога ниже)`))
    .join('\n');
  const facts = args.courseFacts ? `\n\nДАННЫЕ КАТАЛОГА:\n${args.courseFacts}` : '';
  const hist = args.history.slice(-6).map((m) => `${m.role === 'user' ? 'Юзер' : 'Ассистент'}: ${m.content}`).join('\n');
  return `ИСТОРИЯ:\n${hist || '(пусто)'}\n\nВОПРОС: ${args.query}\n\nСПРАВКИ:\n${refs || '(нет)'}${facts}`;
}

export async function synthesizeConcierge(args: ConciergeSynthArgs): Promise<string> {
  try {
    const client = getOpenRouterClient();
    const resp = await client.chat.completions.create({
      model: MODELS.chat,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: buildUser(args) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });
    const raw = resp.choices[0]?.message?.content ?? '';
    const parsed = llmSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return fixBrandNames(parsed.data.answer);
  } catch {
    /* fall through */
  }
  return FALLBACK;
}
