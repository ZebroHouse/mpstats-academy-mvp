export interface JobCandidate {
  jobId: string;
  title: string;
  slug: string;
  description: string | null;
  lessonCount: number;
  jobEmbeddingSim: number; // 0..1
  topChunkSim: number;     // 0..1
  combinedScore: number;   // 0..1
  topSnippets: Array<{ content: string; similarity: number }>;
}

export type IntentAction = { type: 'add_to_track'; jobId: string; label: string };

export interface IntentJobItem {
  jobId: string;
  title: string;
  slug: string;
  lessonCount: number;
  reason: string;
  actions: IntentAction[];
}

export type IntentResult =
  | { mode: 'clarify'; question: string; options: Array<{ label: string; intent: string }>; conversationState: string }
  | { mode: 'recommend'; answer: string; jobs: IntentJobItem[] }
  | { mode: 'fallback'; answer: string; lessons: Array<{ lessonId: string; reason: string }> }
  | { mode: 'empty'; message: string };
