/**
 * AI Question Generator for Diagnostic Sessions
 *
 * Generates multiple-choice diagnostic questions from RAG content chunks via LLM.
 * Uses per-category parallel generation with independent fallback:
 *   Primary model -> Fallback model -> Mock questions (provided by caller)
 */

import type { DiagnosticQuestion, SkillCategory } from '@mpstats/shared';
import { openrouter, MODELS } from './openrouter';
import { prisma } from '@mpstats/db/client';
import {
  generatedQuestionsArraySchema,
  questionJsonSchema,
  type GeneratedQuestion,
} from './question-schema';

import { buildSystemPrompt, CATEGORY_TO_COURSES } from './question-prompt';

// Re-export prompt and constants from standalone module (no server-only deps)
export { buildSystemPrompt, CATEGORY_TO_COURSES };

const QUESTIONS_PER_CATEGORY = 3;
const CHUNKS_TO_FETCH = 15; // fetch more, sample fewer
const CHUNKS_TO_USE = 5;
const LLM_TIMEOUT_MS = 25000;

// ============== TYPES ==============

/** Callback that provides mock questions when LLM generation fails */
export type MockQuestionsFn = (
  category: SkillCategory,
  count: number
) => DiagnosticQuestion[];

// ============== TYPES ==============

/** Options for customizing question generation scope and volume */
export interface GenerateOptions {
  categories?: SkillCategory[];
  questionsPerCategory?: number;
}

// ============== MAIN ENTRY POINT ==============

/**
 * Generate diagnostic questions using LLM + RAG chunks.
 *
 * For each category, attempts LLM generation with model fallback chain.
 * If all models fail for a category, uses `fallbackFn` to get mock questions.
 *
 * @param fallbackFn - Provides mock questions for categories where LLM fails
 * @param options - Optional: limit to specific categories or change count per category
 * @returns Shuffled DiagnosticQuestion objects
 */
export async function generateDiagnosticQuestions(
  fallbackFn: MockQuestionsFn,
  options?: GenerateOptions,
): Promise<DiagnosticQuestion[]> {
  const categories: SkillCategory[] = options?.categories ?? [
    'ANALYTICS',
    'MARKETING',
    'CONTENT',
    'OPERATIONS',
    'FINANCE',
  ];
  const perCategory = options?.questionsPerCategory ?? QUESTIONS_PER_CATEGORY;

  // Generate questions per category in parallel
  const results = await Promise.allSettled(
    categories.map((category) =>
      generateQuestionsForCategory(category, perCategory)
    )
  );

  const allQuestions: DiagnosticQuestion[] = [];

  for (let i = 0; i < categories.length; i++) {
    const result = results[i];
    const category = categories[i];

    if (result.status === 'fulfilled' && result.value.length > 0) {
      // Accept partial results — LLM may return fewer than requested
      allQuestions.push(...result.value.slice(0, perCategory));
      // Supplement with mock if not enough
      if (result.value.length < perCategory) {
        const needed = perCategory - result.value.length;
        console.warn(`[question-generator] ${category}: LLM returned ${result.value.length}/${perCategory}, supplementing ${needed} mock`);
        allQuestions.push(...fallbackFn(category, needed));
      }
    } else {
      // Complete failure — use mock
      console.warn(
        `[question-generator] LLM failed for ${category}, using mock fallback.`,
        result.status === 'rejected' ? (result.reason instanceof Error ? result.reason.message : result.reason) : 'Empty result'
      );
      allQuestions.push(...fallbackFn(category, perCategory));
    }
  }

  // Shuffle final array to mix categories
  return shuffleArray(allQuestions);
}

// ============== PER-CATEGORY GENERATION ==============

/**
 * Generate questions for a single category using LLM with model fallback.
 *
 * @throws Error if all models fail (caller substitutes mock)
 */
async function generateQuestionsForCategory(
  category: SkillCategory,
  count: number
): Promise<DiagnosticQuestion[]> {
  const coursePrefixes = CATEGORY_TO_COURSES[category];

  // FINANCE has no courses — throw immediately to trigger mock fallback
  if (coursePrefixes.length === 0) {
    throw new Error(`No course data for category ${category}`);
  }

  // Fetch random chunks for this category
  const chunks = await fetchRandomChunks(coursePrefixes, CHUNKS_TO_FETCH);

  if (chunks.length === 0) {
    throw new Error(`No chunks found for category ${category}`);
  }

  // Randomly sample chunks to use as context
  const sampledChunks = shuffleArray(chunks).slice(0, CHUNKS_TO_USE);
  const context = sampledChunks
    .map((chunk, i) => `[${i + 1}] ${chunk.content}`)
    .join('\n\n');

  // Try primary model, then fallback
  const models = [MODELS.chat, MODELS.fallback];

  for (const model of models) {
    try {
      const questions = await callLLM(model, category, count, context);
      return questions.map((q, i) =>
        toDiagnosticQuestion(q, category, i, sampledChunks)
      );
    } catch (err) {
      console.warn(
        `[question-generator] Model ${model} failed for ${category}:`,
        err instanceof Error ? err.message : err
      );
      // Continue to next model
    }
  }

  throw new Error(`All models failed for category ${category}`);
}

// ============== LLM CALL ==============

/**
 * Call LLM to generate questions with structured output.
 */
async function callLLM(
  model: string,
  category: SkillCategory,
  count: number,
  context: string
): Promise<GeneratedQuestion[]> {
  const systemPrompt = buildSystemPrompt(category, count);

  let response;
  try {
    // Try structured output first (works with OpenAI models)
    response = await openrouter.chat.completions.create(
      {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Контекст из учебных материалов:\n\n${context}\n\nСгенерируй ${count} вопросов на основе этого контекста.`,
          },
        ],
        temperature: 0.7,
        max_tokens: 2048,
        response_format: {
          type: 'json_schema' as const,
          json_schema: {
            name: 'diagnostic_questions',
            strict: true,
            schema: questionJsonSchema,
          },
        },
      },
      { timeout: LLM_TIMEOUT_MS }
    );
  } catch (structuredErr) {
    // Fallback: some models (Gemini via OpenRouter) don't support json_schema
    // Use json_object mode instead
    console.warn(`[question-generator] json_schema failed for ${model}, trying json_object:`,
      structuredErr instanceof Error ? structuredErr.message : structuredErr);
    response = await openrouter.chat.completions.create(
      {
        model,
        messages: [
          { role: 'system', content: systemPrompt + '\n\nОтвечай ТОЛЬКО валидным JSON массивом. Без markdown, без ```.' },
          {
            role: 'user',
            content: `Контекст из учебных материалов:\n\n${context}\n\nСгенерируй ${count} вопросов на основе этого контекста. Верни JSON массив.`,
          },
        ],
        temperature: 0.7,
        max_tokens: 2048,
        response_format: { type: 'json_object' as const },
      },
      { timeout: LLM_TIMEOUT_MS }
    );
  }

  const rawContent = response.choices[0]?.message?.content;
  if (!rawContent) {
    throw new Error('Empty LLM response');
  }

  // Strip markdown code fences if present
  const jsonString = stripCodeFences(rawContent);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new Error(`Invalid JSON from LLM: ${jsonString.slice(0, 200)}`);
  }

  // Validate with Zod
  const validation = generatedQuestionsArraySchema.safeParse(parsed);
  if (!validation.success) {
    throw new Error(
      `Zod validation failed: ${validation.error.issues.map((i) => i.message).join(', ')}`
    );
  }

  return validation.data.questions;
}

// ============== HELPERS ==============

/**
 * Fetch random chunks from content_chunk table for given course prefixes.
 */
async function fetchRandomChunks(
  coursePrefixes: string[],
  limit: number
): Promise<Array<{ id: string; content: string; lesson_id: string; timecode_start: number; timecode_end: number }>> {
  // Build OR filter for multiple prefixes using Prisma raw SQL (direct TCP)
  // PostgREST (Supabase client) times out on large content_chunk queries
  const likeConditions = coursePrefixes
    .map((prefix) => `lesson_id LIKE '${prefix}%'`)
    .join(' OR ');

  // Exclude bonus/intro lessons — they contain VPN guides, tool tutorials,
  // and general IT definitions that pollute diagnostic question quality
  // Exclude chunks belonging to hidden lessons or lessons of hidden courses
  // (ContentChunk has no FK to Lesson, so we join via lesson_id)
  const data = await prisma.$queryRawUnsafe<Array<{
    id: string;
    content: string;
    lesson_id: string;
    timecode_start: number;
    timecode_end: number;
  }>>(`
    SELECT c.id::text, c.content::text, c.lesson_id::text, c.timecode_start::int, c.timecode_end::int
    FROM content_chunk c
    INNER JOIN "Lesson" l ON l.id = c.lesson_id
    INNER JOIN "Course" co ON co.id = l."courseId"
    WHERE (${likeConditions.replace(/lesson_id/g, 'c.lesson_id')})
      AND c.lesson_id NOT LIKE '%_m00_%'
      AND c.lesson_id NOT LIKE '%_m01_intro_%'
      AND l."isHidden" = false
      AND co."isHidden" = false
    ORDER BY RANDOM()
    LIMIT ${limit}
  `);

  return data || [];
}

/**
 * Convert a GeneratedQuestion to DiagnosticQuestion format.
 * Shuffles options and recalculates correctIndex to avoid LLM index bias.
 */
function toDiagnosticQuestion(
  q: GeneratedQuestion,
  category: SkillCategory,
  index: number,
  sourceChunks?: Array<{ id: string; lesson_id: string; timecode_start: number; timecode_end: number }>
): DiagnosticQuestion {
  // Remember the correct answer text before shuffling
  const correctAnswer = q.options[q.correctIndex];

  // Create shuffled options
  const shuffledOptions = shuffleArray([...q.options]);

  // Find new index of correct answer
  const newCorrectIndex = shuffledOptions.indexOf(correctAnswer);

  return {
    id: `q-${category.toLowerCase()}-${Date.now()}-${index}`,
    question: q.question,
    options: shuffledOptions,
    correctIndex: newCorrectIndex,
    explanation: q.explanation,
    difficulty: q.difficulty,
    skillCategory: category,
    marketplace: q.marketplace,
    // Source tracing (Phase 23)
    // Use LLM-provided sourceIndices to map only relevant chunks per question
    ...(sourceChunks ? (() => {
      const indices = (q.sourceIndices || [])
        .map(i => i - 1) // Convert 1-based to 0-based
        .filter(i => i >= 0 && i < sourceChunks.length);
      // Fall back to all chunks if LLM didn't provide valid indices
      const relevantChunks = indices.length > 0
        ? indices.map(i => sourceChunks[i])
        : sourceChunks;
      return {
        sourceChunkIds: relevantChunks.map(c => c.id),
        sourceLessonIds: [...new Set(relevantChunks.map(c => c.lesson_id))],
        sourceTimecodes: relevantChunks.map(c => ({
          lessonId: c.lesson_id,
          start: c.timecode_start,
          end: c.timecode_end,
        })),
      };
    })() : {}),
  };
}

/**
 * Strip markdown code fences from LLM response if present.
 */
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  // Match ```json ... ``` or ``` ... ```
  const match = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  return match ? match[1].trim() : trimmed;
}

/**
 * Fisher-Yates shuffle — returns a new shuffled array.
 */
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
