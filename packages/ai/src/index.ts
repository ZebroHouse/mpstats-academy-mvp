/**
 * @mpstats/ai - AI services for MPSTATS Academy
 *
 * Provides RAG (Retrieval Augmented Generation) capabilities:
 * - Query embedding generation
 * - Vector similarity search via Supabase pgvector
 * - LLM generation for summaries and chat
 */

// OpenRouter client
export { openrouter, MODELS, MODEL_CONFIG, callWithSpan } from './openrouter';
export type { ModelType } from './openrouter';

// Embedding service
export { embedQuery, embedBatch, EMBEDDING_DIMS } from './embeddings';

// Text/interactive lesson indexing
export { extractPlainText, chunkText, indexLessonText } from './text-index';

// Retrieval service
export { searchChunks, getChunksForLesson, formatTimecode } from './retrieval';
export type { ChunkSearchResult, SearchOptions } from './retrieval';

// Generation service
export { generateLessonSummary, generateChatResponse } from './generation';
export type { GenerationResult, SourceCitation, ChatMessage } from './generation';

// Lesson tagging (Phase 23) — no server-only, safe for CLI scripts
export { tagLesson, fetchLessonChunks, clusterTopics, lessonTagSchema } from './tagging';
export type { LessonTag } from './tagging';

// Question generation
export { generateDiagnosticQuestions, CATEGORY_TO_COURSES } from './question-generator';
export type { MockQuestionsFn, GenerateOptions } from './question-generator';
export { generatedQuestionSchema, generatedQuestionsArraySchema, questionJsonSchema } from './question-schema';
export type { GeneratedQuestion } from './question-schema';

export { retrieve, PROFILES, type ProfileName, type RetrievalProfile, type RetrieveOptions } from './profiles';

// Seller-lexicon query expansion (applied to embedded queries before retrieval)
export { expandSellerQuery } from './seller-lexicon';

// RAG public wrapper (Stage 5 — REST/MCP consumers)
export { searchChunksPublic, DEEPLINK_BASE } from './rag-public';
export type {
  PublicChunk,
  SearchChunksPublicOptions,
  SearchChunksPublicResult,
} from './rag-public';

// Intent resolution (Track B — job recommendations via user intent)
export { resolveIntent } from './intent';
export type { IntentResult, IntentAction, JobCandidate } from './intent';
export type { ResolveArgs } from './intent/resolve';

// Assistant pipeline (multi-turn LLM + retrieval + synthesis)
export {
  runAssistantPipeline,
  type AssistantTurnResult,
  type AssistantLessonRef,
  type AssistantJobRef,
  type AssistantHistoryMessage,
  type AssistantPipelineArgs,
} from './assistant';
