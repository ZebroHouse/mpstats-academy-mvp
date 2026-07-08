// Ответ ассистента на один ход диалога.
export interface AssistantTurnResult {
  inDomain: boolean;              // false = офф-топик, карточек нет
  answer: string;                 // markdown-ответ юзеру
  lessons: AssistantLessonRef[];  // подмешанные карточки уроков
  jobs: AssistantJobRef[];        // подмешанные карточки задач
}

export interface AssistantLessonRef {
  lessonId: string;
  title: string;
  durationMin: number | null;
  courseTitle: string | null;
  reason: string;                 // почему релевантно (1 фраза)
}

export interface AssistantJobRef {
  jobId: string;
  title: string;
  slug: string;
  lessonCount: number;
  reason: string;
}

// Одно сообщение истории, передаваемое в LLM-контекст.
export interface AssistantHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Кандидат-урок из ретрива (до whitelist).
export interface LessonCandidate {
  lessonId: string;
  title: string;
  durationMin: number | null;
  courseTitle: string | null;
  snippet: string;
  similarity: number;
}
