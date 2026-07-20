/**
 * Heuristic: did the in-lesson assistant essentially refuse / say "no answer"?
 * The RAG system prompt instructs the model to say «в этом фрагменте урока
 * ответа нет» when the context lacks the answer; the fallback string on a failed
 * generation is «не удалось сгенерировать ответ». Matched case-insensitively.
 * This is a heuristic (a normal answer could contain these substrings) — the
 * objective signal is sourceCount===0; this catches "had context but declined".
 */
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
// NB: JS `\b` is ASCII-only and never matches Cyrillic word boundaries, so Cyrillic-aware
// lookarounds `(?<![а-яё])…(?![а-яё])` stand in for it. The interpolated quote can contain a
// «?» (e.g. «умеешь?»), so `?` is NOT a stop char here (only sentence-ending `.`/`!`/newline).
// Requires GENITIVE «ответа» (the refusal template) — nominative «Ответ …» is a normal
// sentence subject («Ответ зависит от того … или нет») and must NOT be flagged.
const REFUSAL_REGEX = /(?<![а-яё])ответа[^.!\n]{0,60}(?<![а-яё])нет(?![а-яё])/i;

export function isRefusalAnswer(content: string): boolean {
  const c = content.toLowerCase();
  return REFUSAL_SUBSTRINGS.some((p) => c.includes(p)) || REFUSAL_REGEX.test(content);
}

export interface ChatPersistInput {
  userId: string;
  lessonId: string;
  message: string; // user query
  answer: string; // assistant content
  model: string;
  sourceCount: number;
  answered?: boolean; // true for a handled meta orientation → forces noAnswer=false
}

export interface ChatMessageRow {
  userId: string;
  lessonId: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  model: string | null;
  sourceCount: number | null;
  noAnswer: boolean;
}

/** Two rows per turn: the user query, then the assistant reply (carrying metadata). */
export function buildChatMessageRows(i: ChatPersistInput): ChatMessageRow[] {
  const noAnswer = i.answered === true ? false : i.sourceCount === 0 || isRefusalAnswer(i.answer);
  return [
    { userId: i.userId, lessonId: i.lessonId, role: 'USER', content: i.message, model: null, sourceCount: null, noAnswer: false },
    { userId: i.userId, lessonId: i.lessonId, role: 'ASSISTANT', content: i.answer, model: i.model, sourceCount: i.sourceCount, noAnswer },
  ];
}

export interface LessonChatQuality {
  total: number;
  noAnswer: number;
  noAnswerRate: number;
  noGrounding: number;
  noGroundingRate: number;
}

export function computeLessonChatQuality(i: {
  total: number | bigint;
  noAnswer: number | bigint;
  noGrounding: number | bigint;
}): LessonChatQuality {
  const total = Number(i.total);
  const noAnswer = Number(i.noAnswer);
  const noGrounding = Number(i.noGrounding);
  const rate = (x: number) => (total === 0 ? 0 : x / total);
  return { total, noAnswer, noAnswerRate: rate(noAnswer), noGrounding, noGroundingRate: rate(noGrounding) };
}

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
