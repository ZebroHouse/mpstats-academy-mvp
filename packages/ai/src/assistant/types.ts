// Категория реплики (хребет): определяется гейтом, роутит пайплайн.
export type ReplyCategory = 'material' | 'platform_help' | 'complaint' | 'off_domain';

// Навигационная deep-link карточка концьержа (propose→click).
export interface AssistantNavLink {
  label: string;
  href: string;
}

// Результат одной ветки пайплайна (без категории — её проставляет оркестратор).
export interface AssistantBranchResult {
  answer: string;
  lessons: AssistantLessonRef[];
  jobs: AssistantJobRef[];
  navLinks: AssistantNavLink[];
}

// Ответ ассистента на один ход диалога.
export interface AssistantTurnResult extends AssistantBranchResult {
  category: ReplyCategory; // off_domain ⟺ !inDomain (inDomain выводим при персисте)
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
