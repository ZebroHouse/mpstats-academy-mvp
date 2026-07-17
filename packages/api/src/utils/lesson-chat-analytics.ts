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
];

export function isRefusalAnswer(content: string): boolean {
  const c = content.toLowerCase();
  return REFUSAL_SUBSTRINGS.some((p) => c.includes(p));
}

export interface ChatPersistInput {
  userId: string;
  lessonId: string;
  message: string; // user query
  answer: string; // assistant content
  model: string;
  sourceCount: number;
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
  const noAnswer = i.sourceCount === 0 || isRefusalAnswer(i.answer);
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
