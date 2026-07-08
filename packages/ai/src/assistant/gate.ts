import { getOpenRouterClient, MODELS } from '../openrouter';

export interface DomainVerdict {
  inDomain: boolean;
}

const SYSTEM = `Ты — классификатор запросов для обучающей платформы селлеров маркетплейсов (Wildberries, Ozon).
Верни СТРОГО JSON: {"inDomain": true} или {"inDomain": false}.

inDomain=true, если вопрос про ведение или рост бизнеса продавца на маркетплейсах, включая смежные предпринимательские темы:
- механика WB/Ozon: карточки, реклама, аналитика, выкупы, рейтинг, поставки, логистика;
- финансы бизнеса: PnL, юнит-экономика, ДРР, маржа, кэшфлоу, налоги ИП/самозанятого;
- продвижение, маркетинг, внешний трафик, SEO;
- операционка, закупки, найм под этот бизнес.

inDomain=false для всего остального: код, школьные/математические задачи, медицина, политика, творчество, ЛИЧНЫЕ финансы (ипотека, вклады), написание текстов не про бизнес продавца, любые общие вопросы.

При сомнении в сторону бизнеса продавца — ставь true. Личное/общее — false.`;

// Fail-open: любая ошибка/невалидный ответ → пропускаем (true).
// Ошибка «отказал реальному селлеру» дороже ошибки «ответил на пограничное».
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
    const parsed = JSON.parse(raw) as { inDomain?: unknown };
    return { inDomain: parsed.inDomain === false ? false : true };
  } catch {
    return { inDomain: true };
  }
}
