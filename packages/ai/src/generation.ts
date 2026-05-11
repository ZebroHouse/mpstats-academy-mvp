/**
 * LLM Generation service
 *
 * Handles AI text generation for:
 * - Lesson summaries (RAG-enhanced)
 * - Chat responses with citations
 */

import { openrouter, MODELS, MODEL_CONFIG } from './openrouter';
import { getChunksForLesson, formatTimecode, type ChunkSearchResult } from './retrieval';
import { retrieve } from './profiles';

/**
 * Fix transliterated brand names in AI-generated text.
 *
 * Two sources of garbage:
 *  1) Whisper transcripts mishear foreign brand names (Канцински = Kandinsky,
 *     Чат жпт = ChatGPT, ВиШоп/WeShop variations) — that garbage flows into
 *     RAG context and then into summaries.
 *  2) LLMs sometimes transliterate brand names back to Cyrillic.
 *
 * We can't fully fix the upstream transcripts (would require re-Whisper'ing
 * all videos with a brand-name biasing prompt), but we can normalize known
 * mishearings on the way out so the user never sees "Канцински".
 */
export function fixBrandNames(text: string): string {
  return text
    // Marketplaces
    .replace(/Валбер[иеё]с(?:а|у|ом|е)?/gi, 'Wildberries')
    .replace(/Вайлдберр?ис(?:а|у|ом|е)?/gi, 'Wildberries')
    .replace(/Вайлдберриз/gi, 'Wildberries')
    // Note: JS \b doesn't recognize Cyrillic as word chars, so we use a
    // negative lookahead instead — match Озон unless it's continuing into a
    // longer Russian word (Озонатор, Озонирование).
    .replace(/Озон(?![а-яА-Я])/g, 'Ozon')
    // AI image models
    .replace(/Канд?ински(?:й|м|х|е)?/gi, 'Kandinsky')
    .replace(/Канцински(?:й|м|х|е)?/gi, 'Kandinsky')
    .replace(/Миджорн(?:и|ей|ея|ею|и)/gi, 'Midjourney')
    .replace(/Мидж(?:о|у)рни/gi, 'Midjourney')
    .replace(/Стейбл\s*Диффуж[еэ]н/gi, 'Stable Diffusion')
    .replace(/Дал[еи]\s*-?\s*[ИИие]/gi, 'DALL-E')
    .replace(/Креа[йи]/gi, 'Krea')
    .replace(/Криэи/gi, 'Krea AI')
    // AI text models
    .replace(/Чат\s*-?\s*[ГгJj]?[ПпPp][ТтTt]/gi, 'ChatGPT')
    .replace(/Чатжпт/gi, 'ChatGPT')
    .replace(/Чатгпт/gi, 'ChatGPT')
    .replace(/Гига\s*-?\s*[Чч]ат/gi, 'GigaChat')
    .replace(/Янд[еи]кс\s*-?\s*[ГгJj][ПпPp][ТтTt]/gi, 'YandexGPT')
    .replace(/Кл[ао]уд(?:а|е|у|ом)?/g, 'Claude')
    .replace(/Перпл[еи]кс[иы]/gi, 'Perplexity')
    .replace(/[Дд]ипс[ии]к/g, 'DeepSeek')
    .replace(/Квен(?![а-яА-Я])/g, 'Qwen')
    // Tools
    .replace(/[МмMm][ПпPp][\s\-]?[Сс]татс/g, 'MPSTATS')
    .replace(/Ампостат/gi, 'MPSTATS')
    .replace(/Capcut|Кэпкат|Кап\s*кат/gi, 'CapCut')
    .replace(/Фигма(?![а-яА-Я])/g, 'Figma');
}

// Types
export interface GenerationResult {
  content: string;
  sources: SourceCitation[];
  model: string;
}

export interface SourceCitation {
  id: string;
  lesson_id: string;
  content: string;
  timecode_start: number;
  timecode_end: number;
  timecodeFormatted: string;
  sourceType?: string;
}

/**
 * Build context string for LLM prompt, distinguishing audio (transcript) vs
 * frame (visual) chunks.
 */
export function buildContextWithSources(chunks: ChunkSearchResult[]): string {
  return chunks
    .map((chunk, i) => {
      const idx = i + 1;
      const rel = `${(chunk.similarity * 100).toFixed(0)}%`;
      if (chunk.source_type === 'academy_video_frame') {
        return `[${idx}] (ЭКРАН @ ${formatTimecode(chunk.timecode_start)}, relevance: ${rel})\n${chunk.content}`;
      }
      return `[${idx}] (АУДИО ${formatTimecode(chunk.timecode_start)}-${formatTimecode(chunk.timecode_end)}, relevance: ${rel})\n${chunk.content}`;
    })
    .join('\n\n');
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Generate a summary for a lesson using all its chunks
 *
 * @param lessonId - Lesson ID (e.g., "01_analytics_m01_start_001")
 * @returns Summary with source citations
 */
export async function generateLessonSummary(
  lessonId: string
): Promise<GenerationResult> {
  // 1. Get all chunks for this lesson
  const chunks = await getChunksForLesson(lessonId);

  if (chunks.length === 0) {
    return {
      content: 'Контент для этого урока пока не загружен.',
      sources: [],
      model: MODELS.chat,
    };
  }

  // 2. Build context from chunks
  const context = chunks
    .map(
      (chunk, i) =>
        `[${i + 1}] (${formatTimecode(chunk.timecode_start)} - ${formatTimecode(chunk.timecode_end)})\n${chunk.content}`
    )
    .join('\n\n');

  // 3. Generate summary
  const systemPrompt = `Ты — AI-ассистент образовательной платформы MPSTATS Academy для селлеров маркетплейсов.

Твоя задача: создать структурированное резюме урока на основе транскрипта.

Формат ответа:
## Ключевые темы
- [тема 1]
- [тема 2]
...

## Основные идеи
1. [идея с ссылкой на источник [1]]
2. [идея с ссылкой на источник [2]]
...

## Практические выводы
- [что можно применить]
- [конкретные действия]

Правила:
- Используй ссылки [1], [2] и т.д. для цитирования источников
- Пиши на русском языке
- Будь конкретным и практичным
- Фокусируйся на actionable инсайтах для селлеров

Глоссарий брендов и продуктов (транскрипт может содержать опечатки/мисхиры с микрофона — пиши ВСЕГДА правильно):
- Маркетплейсы: Wildberries (не "Валберес/Вайлдберриз"), Ozon (не "Озон"), Яндекс Маркет
- MPSTATS (не "ампостат", "MPStats")
- AI-инструменты текста: ChatGPT (не "Чат жпт/гпт"), Claude (не "Клауд"), GigaChat, YandexGPT, Perplexity, DeepSeek, Qwen
- AI-инструменты картинок: Midjourney (не "Миджорни"), Kandinsky (не "Канцински/Кандински"), Stable Diffusion, DALL-E, Krea (не "Криэй/КриАй")
- Видео/дизайн: CapCut, Figma, Canva
- Английские аббревиатуры — латиницей: SKU, FBO, FBS, CTR, ROI, DRR, CPC, AOV, LTV, A/B-тест, ABC-анализ (не "АБЦ-анализ")

Если в транскрипте бренд написан с ошибкой — исправь его в резюме. Никогда не цитируй опечатки.`;

  const response = await openrouter.chat.completions.create({
    model: MODELS.chat,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Создай резюме урока на основе следующего транскрипта:\n\n${context}`,
      },
    ],
    max_tokens: MODEL_CONFIG.maxTokens,
    temperature: MODEL_CONFIG.ragTemperature,
  });

  const content = fixBrandNames(response.choices[0]?.message?.content || 'Ошибка генерации.');

  // 4. Build source citations
  const sources: SourceCitation[] = chunks.map((chunk) => ({
    id: chunk.id,
    lesson_id: chunk.lesson_id,
    content: chunk.content.slice(0, 200) + (chunk.content.length > 200 ? '...' : ''),
    timecode_start: chunk.timecode_start,
    timecode_end: chunk.timecode_end,
    timecodeFormatted: `${formatTimecode(chunk.timecode_start)} - ${formatTimecode(chunk.timecode_end)}`,
    sourceType: chunk.source_type,
  }));

  return {
    content,
    sources,
    model: MODELS.chat,
  };
}

/**
 * Generate a chat response using RAG
 *
 * @param lessonId - Lesson ID to search within
 * @param message - User's question
 * @param history - Previous chat messages
 * @returns AI response with citations
 */
export async function generateChatResponse(
  lessonId: string,
  message: string,
  history: ChatMessage[] = []
): Promise<GenerationResult> {
  // 1. Search for relevant chunks (threshold 0.5 — lower values cause Supabase free tier to timeout on large result sets)
  const relevantChunks = await retrieve('academy-lesson', {
    query: message,
    lessonId,
  });

  // 2. Build context with citations
  const context = relevantChunks.length > 0 ? buildContextWithSources(relevantChunks) : '';

  // 3. Build system prompt
  const systemPrompt = `Ты — AI-ассистент образовательной платформы MPSTATS Academy для селлеров маркетплейсов.

Твоя задача: отвечать на вопросы по уроку, используя предоставленный контекст.

${context ? `Контекст из урока (два типа источников):\n- АУДИО — то что говорил спикер в озвучке\n- ЭКРАН — то что показано визуально на тайм-коде\n\n${context}` : 'Контекст не найден.'}

Правила:
- Отвечай ТОЛЬКО на основе предоставленного контекста
- Если ответа нет в контексте, честно скажи об этом
- Используй ссылки [1], [2] и т.д. для цитирования источников
- ОБЯЗАТЕЛЬНО проверь ЭКРАН-источники в первую очередь, если вопрос про:
  • URL, ссылки, доменные имена → ищи в ЭКРАН
  • числа, метрики, цифры с экрана/таблиц/графиков → ищи в ЭКРАН
  • названия инструментов, кнопок, разделов интерфейса → ищи в ЭКРАН
  • что показано/видно/демонстрируется → ищи в ЭКРАН
- Если в контексте есть ЭКРАН-источник по теме вопроса — ОБЯЗАТЕЛЬНО процитируй его (ссылкой [N])
- Если вопрос про идеи/советы/концепции/объяснения спикера — приоритет АУДИО-источников
- Если ответ есть и в АУДИО, и в ЭКРАН — лучше процитировать оба (даёт более полный ответ)
- НЕ ВЫДУМЫВАЙ — если в контексте нет ответа, прямо скажи «в этом фрагменте урока ответа нет»
- ЧИСЛА И ЦИФРЫ: цитируй ОДИН конкретный источник, НЕ смешивай числа из разных кадров. Если в нескольких кадрах разные числа по похожей теме — это разные параметры (разные настройки/таблицы/моменты), не усредняй и не «угадывай среднее»
- СТРУКТУРИРОВАННЫЕ ФАКТЫ В ЭКРАН-ИСТОЧНИКАХ: если в контексте видишь строки вида \`URLs: ...\`, \`Numbers: ...\`, \`Tools: ...\`, \`Other: ...\` — это извлечённые с экрана факты. Используй их ВЕРБАТИМ без перефразирования. Например \`Tools: Wordstat,MPStats,Google Sheets\` — это значит на экране показаны эти три инструмента, цитируй их прямо
- Пиши на русском языке
- Будь конкретным и полезным
- Если вопрос не связан с уроком, вежливо перенаправь к теме урока

Глоссарий — пиши бренды правильно даже если в транскрипте опечатки/мисхиры с микрофона:
- Маркетплейсы: Wildberries, Ozon, Яндекс Маркет (не "Валберес/Вайлдберриз/Озон")
- MPSTATS (не "ампостат/MPStats")
- AI-текст: ChatGPT, Claude, GigaChat, YandexGPT, Perplexity, DeepSeek, Qwen
- AI-картинки: Midjourney, Kandinsky (не "Канцински"), Stable Diffusion, DALL-E, Krea
- Дизайн/видео: Figma, Canva, CapCut
- Английские аббревиатуры — латиницей: SKU, FBO, FBS, CTR, ROI, DRR, ABC-анализ (не "АБЦ")

ПРИМЕРЫ ХОРОШИХ И ПЛОХИХ ОТВЕТОВ (внимательно изучи паттерн):

═══ ПРИМЕР 1: Вопрос про число с экрана ═══
Вопрос: «Какая выручка показана для категории X?»
Контекст:
  [3] (ЭКРАН @ 04:00) Сводка по предмету. Numbers: 121 016 906 ₽, 28 621 563 ₽ 19%, 70 247 шт
  [5] (ЭКРАН @ 11:00) Аналитика по сегментам. Numbers: 25, 35, 1000000

✅ ХОРОШО: «По данным с экрана @ 04:00 [3] выручка категории — 121 016 906 ₽».
❌ ПЛОХО: «Выручка около 125 млн ₽» (смешал числа из [3] и [5], выдал среднее)
❌ ПЛОХО: «В уроке указано 121 016 906 ₽, а также 25, 35» (свалил в кучу разные метрики)

Паттерн: для числа — ВЫБРАТЬ ОДИН источник где число точно отвечает на вопрос, процитировать вербатим, не подмешивать другие.

═══ ПРИМЕР 2: Вопрос про список инструментов / опций ═══
Вопрос: «Какие инструменты используются для анализа?»
Контекст:
  [2] (ЭКРАН @ 01:00) Анализ ниши. Tools: Wordstat, MPStats, Google Sheets

✅ ХОРОШО: «На экране [2] показаны три инструмента: Wordstat, MPStats, Google Sheets».
❌ ПЛОХО: «В уроке используется MPSTATS» (отбросил часть Tools:, не процитировал список целиком)
❌ ПЛОХО: «Применяются разные сервисы аналитики» (полностью проигнорировал Tools:)

Паттерн: если в источнике есть \`Tools:\` / \`URLs:\` / \`Numbers:\` / \`Other:\` — это структурированные факты с экрана, цитировать ВЕРБАТИМ ВЕСЬ список целиком.

═══ ПРИМЕР 3: Вопрос про URL / ссылку ═══
Вопрос: «Какая ссылка на товар показана и за какой период?»
Контекст:
  [4] (ЭКРАН @ 05:00) Карточка товара. URLs: https://mpstats.io/wb/item/463891248?d1=02.07.2025&d2=29.09.2025

✅ ХОРОШО: «На экране [4] показана ссылка https://mpstats.io/wb/item/463891248?d1=02.07.2025&d2=29.09.2025 — данные за период 02.07.2025–29.09.2025 (это видно из параметров d1 и d2)».
❌ ПЛОХО: «Показана ссылка на MPSTATS» (не вытащил URL целиком)
❌ ПЛОХО: «Ссылка mpstats.io/wb/item/463891248» (отбросил query-параметры с датами)

Паттерн: URL цитировать ЦЕЛИКОМ с query-параметрами. Параметры часто содержат ответ на сопутствующий вопрос (период, ID, режим).

═══ ПРИМЕР 4: Вопрос концептуальный (audio-only) ═══
Вопрос: «Что такое юнит-экономика?»
Контекст:
  [1] (АУДИО 02:14-02:34) Юнит-экономика — это анализ доходов и расходов на единицу товара.

✅ ХОРОШО: «Юнит-экономика — это анализ доходов и расходов на единицу товара [1]» (цитата из АУДИО, ЭКРАН не нужен)

Паттерн: для концептуальных вопросов — АУДИО-источник в основу. Не «изобретать» ЭКРАН-ответ если вопрос не визуальный.

ПРИМЕНИ ЭТИ ПАТТЕРНЫ ко всем ответам.`;

  // 4. Build messages array
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-10), // Keep last 10 messages for context
    { role: 'user', content: message },
  ];

  // 5. Generate response
  const response = await openrouter.chat.completions.create({
    model: MODELS.chat,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    max_tokens: MODEL_CONFIG.maxTokens,
    temperature: MODEL_CONFIG.ragTemperature,
  });

  const content = fixBrandNames(
    response.choices[0]?.message?.content ||
    'Извините, не удалось сгенерировать ответ. Попробуйте переформулировать вопрос.'
  );

  // 6. Build source citations
  const sources: SourceCitation[] = relevantChunks.map((chunk) => ({
    id: chunk.id,
    lesson_id: chunk.lesson_id,
    content: chunk.content.slice(0, 200) + (chunk.content.length > 200 ? '...' : ''),
    timecode_start: chunk.timecode_start,
    timecode_end: chunk.timecode_end,
    timecodeFormatted: `${formatTimecode(chunk.timecode_start)} - ${formatTimecode(chunk.timecode_end)}`,
    sourceType: chunk.source_type,
  }));

  return {
    content,
    sources,
    model: MODELS.chat,
  };
}
