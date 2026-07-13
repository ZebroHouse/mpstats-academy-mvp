import { getOpenRouterClient, MODELS } from '../openrouter';
import type { ReplyCategory } from './types';

export interface DomainVerdict {
  category: ReplyCategory;
}

const VALID: ReplyCategory[] = ['material', 'platform_help', 'complaint', 'off_domain'];

const SYSTEM = `Ты — классификатор реплик пользователя в AI-ассистенте обучающей платформы для селлеров маркетплейсов (Wildberries, Ozon).
Верни СТРОГО JSON: {"category":"<одна из: material | platform_help | complaint | off_domain>"}.

Категории:
- "platform_help" — вопрос про ПОЛЬЗОВАНИЕ этой платформой: где что нажать, как отменить подписку, где избранное/план/диагностика, как работает реф-программа, что умеет ассистент, сколько уроков в курсе, как перезапустить онбординг. Ориентирование по интерфейсу и функциям платформы.
- "complaint" — жалоба/негатив/«не работает»/«ничего не открывается»/раздражение в адрес платформы или обучения.
- "material" — содержательный вопрос про бизнес продавца на маркетплейсах: механика WB/Ozon, карточки, реклама, аналитика, финансы бизнеса (юнит-экономика, ДРР, налоги ИП), продвижение, операционка. Всё «про дело», не про интерфейс платформы.
- "off_domain" — всё остальное: код, школьные/мед/полит вопросы, личные финансы, творчество не про бизнес продавца.

Правила приоритета: если это жалоба на платформу → "complaint". Если про интерфейс/функции платформы → "platform_help". Если по сути про бизнес продавца → "material". Иначе → "off_domain". При сомнении между material и off_domain выбирай material.`;

// Fail-open: любая ошибка/невалидность → material (безопаснее ответить, чем отказать селлеру).
export async function classifyDomain(query: string): Promise<DomainVerdict> {
  try {
    const client = getOpenRouterClient();
    const resp = await client.chat.completions.create({
      model: MODELS.chat,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: query },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    });
    const raw = resp.choices[0]?.message?.content ?? '';
    const parsed = JSON.parse(raw) as { category?: unknown };
    const cat = parsed.category;
    if (typeof cat === 'string' && VALID.includes(cat as ReplyCategory)) {
      return { category: cat as ReplyCategory };
    }
    return { category: 'material' };
  } catch {
    return { category: 'material' };
  }
}
