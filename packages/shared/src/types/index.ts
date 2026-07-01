// ============== ENUMS ==============

export const SkillCategory = {
  ANALYTICS: 'ANALYTICS',
  MARKETING: 'MARKETING',
  CONTENT: 'CONTENT',
  OPERATIONS: 'OPERATIONS',
  FINANCE: 'FINANCE',
} as const;

export type SkillCategory = (typeof SkillCategory)[keyof typeof SkillCategory];

export const Difficulty = {
  EASY: 'EASY',
  MEDIUM: 'MEDIUM',
  HARD: 'HARD',
} as const;

export type Difficulty = (typeof Difficulty)[keyof typeof Difficulty];

export const DiagnosticStatus = {
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  ABANDONED: 'ABANDONED',
} as const;

export type DiagnosticStatus = (typeof DiagnosticStatus)[keyof typeof DiagnosticStatus];

export const LessonStatus = {
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
} as const;

export type LessonStatus = (typeof LessonStatus)[keyof typeof LessonStatus];

// ============== SKILL PROFILE ==============

export interface SkillProfile {
  analytics: number; // 0-100
  marketing: number;
  content: number;
  operations: number;
  finance: number;
}

export const SKILL_LABELS: Record<SkillCategory, string> = {
  ANALYTICS: 'Аналитика',
  MARKETING: 'Маркетинг',
  CONTENT: 'Контент',
  OPERATIONS: 'Операции',
  FINANCE: 'Финансы',
};

// ============== DIAGNOSTIC ==============

export interface DiagnosticQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: Difficulty;
  skillCategory: SkillCategory;
  marketplace: 'WB' | 'OZON' | 'BOTH';
  // Source tracing (Phase 23)
  sourceChunkIds?: string[];
  sourceLessonIds?: string[];
  sourceTimecodes?: Array<{ lessonId: string; start: number; end: number }>;
}

export interface DiagnosticAnswer {
  questionId: string;
  answer: string;
  isCorrect: boolean;
  difficulty: Difficulty;
  skillCategory: SkillCategory;
}

// ============== LEARNING ==============

export interface Course {
  id: string;
  title: string;
  description: string | null;
  slug: string;
  imageUrl: string | null;
  duration: number;
  order: number;
}

export interface Lesson {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  videoUrl: string;
  videoId: string | null;
  duration: number;
  order: number;
  skillCategory: SkillCategory;
  skillLevel: Difficulty;
}

export interface LessonWithProgress extends Lesson {
  status: LessonStatus;
  watchedPercent: number;
  locked?: boolean;
  topics?: string[];           // Phase 30: canonical topic tags
  skillCategories?: string[];  // Phase 30: multi-category tags
  contentType?: LessonContentType;  // TEXT/INTERACTIVE lessons
  body?: unknown;                    // TipTap document, gated behind `locked`
  progressState?: InteractiveProgressState | null; // INTERACTIVE: reveal/choice state
  badges?: string[];            // editorial storefront tags (START/NEW/HOT/QUICK)
}

// ============== AI / RAG ==============

export interface ContentChunk {
  id: string;
  lessonId: string;
  content: string;
  timecodeStart: number;
  timecodeEnd: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

export interface Citation {
  lessonId: string;
  lessonTitle: string;
  timecodeStart: number;
  timecodeEnd: number;
  text: string;
}

// ============== DIAGNOSTIC RESULTS ==============

export interface SkillGap {
  category: SkillCategory;
  label: string;
  currentScore: number;
  targetScore: number;
  gap: number;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  recommendedLessons: string[];
}

export interface RecommendedJob {
  id: string;
  slug: string;
  title: string;
  description: string;
  marketplace: JobMarketplace;
  axes: string[];
  lessonCount: number;
  totalDurationMin: number;
  completedLessons: number;
  isRecommended: boolean;
  isInTrack: boolean;
  rank: 1 | 2 | 3;
  score: number;
  matchedAxes: string[];
}

export interface DiagnosticResult {
  sessionId: string;
  completedAt: Date;
  totalQuestions: number;
  correctAnswers: number;
  accuracy: number;
  skillProfile: SkillProfile;
  gaps: SkillGap[];
  recommendedPath: string[];
  recommendedJobs: RecommendedJob[];
}

export interface DiagnosticSessionState {
  sessionId: string;
  currentQuestionIndex: number;
  totalQuestions: number;
  answeredQuestions: DiagnosticAnswer[];
  currentQuestion: DiagnosticQuestion | null;
  isComplete: boolean;
  // Phase 59 — the user's marketplaces, surfaced so the Question card can
  // render the WB/OZON badge for mix-users on non-BOTH questions (D-09).
  userMarketplaces?: string[];
}

// ============== DASHBOARD ==============

export interface UserStats {
  totalLessonsCompleted: number;
  totalWatchTime: number; // minutes
  currentStreak: number; // days
  longestStreak: number;
  averageScore: number;
  lastActivityAt: Date | null;
}

export interface RecentActivity {
  id: string;
  type: 'lesson_completed' | 'diagnostic_completed' | 'lesson_started';
  title: string;
  description: string;
  timestamp: Date;
  metadata?: {
    lessonId?: string;
    courseId?: string;
    score?: number;
  };
}

export interface DashboardData {
  stats: UserStats;
  skillProfile: SkillProfile | null;
  recentActivity: RecentActivity[];
  nextLesson: LessonWithProgress | null;
  completionPercent: number;
}

// ============== COURSE WITH PROGRESS ==============

export interface CourseWithProgress extends Course {
  lessons: LessonWithProgress[];
  completedLessons: number;
  totalLessons: number;
  progressPercent: number;
}

// ============== SEARCH RESULTS (Phase 30) ==============

export interface SearchSnippet {
  content: string;         // truncated to 200 chars
  timecodeStart: number;   // seconds
  timecodeEnd: number;     // seconds
  similarity: number;
}

export interface SearchLessonResult {
  lesson: {
    id: string;
    courseId: string;
    title: string;
    duration: number;
    order: number;
    skillCategory: SkillCategory;
    skillLevel: Difficulty;
    skillCategories: string[];
    topics: string[];
  };
  course: {
    id: string;
    title: string;
  };
  snippets: SearchSnippet[];
  bestSimilarity: number;
  watchedPercent: number;
  status: LessonStatus;
  locked: boolean;
  inRecommendedPath: boolean;
  /** True when the lesson belongs to a partner course (e.g. partnerKey='mpstats').
   *  UI should route to /mpstats-tools/<id> instead of /learn/<id>. */
  isPartner: boolean;
}

// ============== KINESCOPE ==============

// ============== SECTIONED LEARNING PATH (Phase 23) ==============

export interface LearningPathSection {
  id: 'errors' | 'deepening' | 'growth' | 'advanced' | 'custom';
  title: string;
  description: string;
  lessonIds: string[];
  addedAt?: Record<string, string>; // lessonId -> ISO date string (for custom section ordering)
  hints?: Array<{
    lessonId: string;
    questionText: string;
    timecodes: Array<{ start: number; end: number }>;
  }>;
}

export interface SectionedLearningPath {
  version: 2;
  sections: LearningPathSection[];
  generatedFromSessionId: string;
  previousSkillProfileId?: string;
}

// ============== AXIS LEARNING PATH (v3) ==============

export interface AxisLearningPathSection {
  axis: SkillCategory;
  label: string;
  score: number;            // 0-100
  tier: 'weak' | 'medium' | 'strong';
  collapsed: boolean;
  jobIds: string[];
  lessonIds: string[];
  errorLessonIds: string[];
}

export interface AxisLearningPath {
  version: 3;
  sections: AxisLearningPathSection[];   // sorted by score asc
  generatedFromSessionId: string;
  previousSkillProfileId?: string;
}

/** Parse LearningPath.lessons Json — old string[], v2 SectionedLearningPath, v3 AxisLearningPath */
export function parseLearningPath(
  lessons: unknown,
): string[] | SectionedLearningPath | AxisLearningPath {
  if (Array.isArray(lessons)) return lessons; // old format: string[]
  if (typeof lessons === 'object' && lessons !== null && 'version' in lessons) {
    const v = (lessons as any).version;
    if (v === 3) return lessons as AxisLearningPath;
    if (v === 2) return lessons as SectionedLearningPath;
  }
  return []; // fallback — never throw
}

// ============== KINESCOPE ==============

export const getKinescopeEmbedUrl = (videoId: string): string =>
  `https://kinescope.io/embed/${videoId}`;

export const getKinescopeEmbedUrlWithTime = (videoId: string, seconds: number): string =>
  `https://kinescope.io/embed/${videoId}?t=${seconds}`;

export const formatTimecode = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// ============== LESSON MATERIALS (Phase 49) ==============

export const MATERIAL_TYPE_VALUES = [
  'PRESENTATION',
  'CALCULATION_TABLE',
  'EXTERNAL_SERVICE',
  'CHECKLIST',
  'MEMO',
] as const;

export type MaterialTypeValue = (typeof MATERIAL_TYPE_VALUES)[number];

export const MATERIAL_TYPE_LABELS: Record<MaterialTypeValue, string> = {
  PRESENTATION: 'Презентация',
  CALCULATION_TABLE: 'Таблица расчётов',
  EXTERNAL_SERVICE: 'Внешний сервис',
  CHECKLIST: 'Чек-лист',
  MEMO: 'Памятка',
};

export const MATERIAL_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'text/csv',
] as const;

export const MATERIAL_MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB (D-12)
export const MATERIAL_SIGNED_URL_TTL = 3600; // 1 hour (D-10)
export const MATERIAL_STORAGE_BUCKET = 'lesson-materials';

// ============== LESSON CONTENT (TEXT / INTERACTIVE) ==============

export const LessonContentType = {
  VIDEO: 'VIDEO',
  TEXT: 'TEXT',
  INTERACTIVE: 'INTERACTIVE',
} as const;
export type LessonContentType =
  (typeof LessonContentType)[keyof typeof LessonContentType];

export const LESSON_CONTENT_TYPE_LABELS: Record<LessonContentType, string> = {
  VIDEO: 'Видео',
  TEXT: 'Текст',
  INTERACTIVE: 'Интерактивный',
};

/**
 * Persisted reveal state for an INTERACTIVE lesson. `revealedGateIds` are the
 * gate node ids the student has clicked through; `checkpointChoices` maps a
 * checkpoint node id → the chosen option id (fixed once chosen).
 */
export interface InteractiveProgressState {
  version: 1;
  revealedGateIds: string[];
  checkpointChoices: Record<string, string>;
}

export const LessonContentStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
} as const;
export type LessonContentStatus =
  (typeof LessonContentStatus)[keyof typeof LessonContentStatus];

export const LESSON_IMAGE_ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;
export const LESSON_IMAGE_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
export const LESSON_IMAGE_STORAGE_BUCKET = 'lesson-images';

// ============== LIBRARY REDESIGN (Phase 57): JOB CATALOG ==============

export type JobMarketplace = 'WB' | 'OZON' | 'BOTH';

export interface JobSummary {
  id: string;
  slug: string;
  title: string;
  description: string;
  marketplace: JobMarketplace;
  axes: string[];               // canonical 5
  lessonCount: number;
  totalDurationMin: number;
  completedLessons: number;     // прогресс юзера
  isRecommended: boolean;       // есть уроки из диагностики (errors/deepening/...), не из вручную добавленного плейбука
  isInTrack: boolean;           // юзер добавил весь плейбук через «+ В трек»
  badges?: string[];            // editorial storefront tags (START/NEW/HOT/QUICK)
}

export interface JobCatalogAxis {
  axis: string;                 // ANALYTICS | MARKETING | CONTENT | OPERATIONS | FINANCE
  title: string;                // «Аналитика» и т.д.
  jobs: JobSummary[];
}

export type StorefrontItem =
  | { kind: 'job'; job: JobSummary }
  | { kind: 'lesson'; lesson: LessonWithProgress };

export interface StorefrontShelf {
  shelfKey: string;
  title: string;
  marketplace?: JobMarketplace;
  items: StorefrontItem[]; // capped per shelf (≤12; «start» ≤3)
  totalCount: number;      // full count before cap → drives «Смотреть все (N)»
}

export interface JobLessonItem {
  id: string;
  title: string;
  durationMin: number;
  order: number;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  watchedPercent: number;
  locked: boolean;
}

export interface JobDetail extends JobSummary {
  outcomes: string[];
  skillBlocks: string[];
  lessons: JobLessonItem[];
  isInTrack: boolean;
}
