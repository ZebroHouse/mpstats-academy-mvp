/**
 * LLM Lesson Tagging Module
 *
 * Provides functions to tag lessons with multi-categories, topics, and difficulty
 * using LLM analysis of content chunks.
 *
 * Designed to work both in Next.js app context and standalone scripts.
 * Does NOT import 'server-only' — safe for CLI usage.
 */

import { z } from 'zod';
import OpenAI from 'openai';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ============== SCHEMA ==============

export const lessonTagSchema = z.object({
  skillCategories: z.array(z.enum(['ANALYTICS', 'MARKETING', 'CONTENT', 'OPERATIONS', 'FINANCE'])).min(1).max(3),
  topics: z.array(z.string().min(2).max(50)).min(2).max(5),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
});

export type LessonTag = z.infer<typeof lessonTagSchema>;

// ============== JSON SCHEMA (for response_format) ==============

const tagJsonSchema = {
  type: 'object' as const,
  additionalProperties: false,
  required: ['skillCategories', 'topics', 'difficulty'],
  properties: {
    skillCategories: {
      type: 'array' as const,
      items: {
        type: 'string' as const,
        enum: ['ANALYTICS', 'MARKETING', 'CONTENT', 'OPERATIONS', 'FINANCE'],
      },
      minItems: 1,
      maxItems: 3,
    },
    topics: {
      type: 'array' as const,
      items: {
        type: 'string' as const,
        minLength: 2,
        maxLength: 50,
      },
      minItems: 2,
      maxItems: 5,
    },
    difficulty: {
      type: 'string' as const,
      enum: ['EASY', 'MEDIUM', 'HARD'],
    },
  },
};

// ============== CLIENTS ==============

let _openrouter: OpenAI | null = null;
let _supabase: SupabaseClient | null = null;

function getOpenRouter(): OpenAI {
  if (!_openrouter) {
    _openrouter = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY || '',
      defaultHeaders: {
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
        'X-Title': 'MPSTATS Academy',
      },
    });
  }
  return _openrouter;
}

function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) {
      throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY');
    }
    _supabase = createClient(url, key);
  }
  return _supabase;
}

// Model configuration (matches openrouter.ts but no server-only import)
const MODELS = {
  chat: process.env.OPENROUTER_DEFAULT_MODEL || 'openai/gpt-4.1-nano',
  fallback: process.env.OPENROUTER_FALLBACK_MODEL || 'google/gemini-3.1-flash-lite-preview',
};

// ============== TAGGING SYSTEM PROMPT ==============

const TAGGING_SYSTEM_PROMPT = `You are a content classification expert for MPSTATS Academy (marketplace seller education: Ozon, Wildberries).

Given lesson content chunks, classify the lesson:

1. skillCategories (1-3): Choose from ANALYTICS, MARKETING, CONTENT, OPERATIONS, FINANCE
   - ANALYTICS: data analysis, metrics, A/B testing, dashboards, unit economics analysis
   - MARKETING: advertising, promotion, SEO, PPC, traffic, campaigns
   - CONTENT: product cards, photos, descriptions, AI tools for content
   - OPERATIONS: logistics, warehousing, fulfillment, processes, tools setup
   - FINANCE: pricing, margins, ROI, cost calculation, profitability, budgeting, unit economics calculations

2. topics (2-5): Free-form Russian tags describing specific topics covered. Be specific: "ABC-анализ", "Юнит-экономика", "Настройка рекламы Ozon" not generic "Аналитика".

3. difficulty: EASY (introductory, definitions), MEDIUM (applied skills, standard practice), HARD (advanced strategy, complex calculations, expert-level)

Respond as JSON: { "skillCategories": [...], "topics": [...], "difficulty": "..." }`;

// ============== MAIN FUNCTIONS ==============

/**
 * Fetch first N content chunks for a lesson from Supabase.
 */
export async function fetchLessonChunks(lessonId: string, limit = 3): Promise<string[]> {
  const supabase = getSupabase();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const { data, error } = await supabase
      .from('content_chunk')
      .select('content')
      .eq('lesson_id', lessonId)
      .order('timecode_start', { ascending: true })
      .limit(limit)
      .abortSignal(controller.signal);

    if (error) {
      throw new Error(`Failed to fetch chunks for ${lessonId}: ${error.message}`);
    }

    return (data || []).map((row: { content: string }) => row.content);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Tag a single lesson using LLM analysis of its content chunks.
 */
export async function tagLesson(lessonId: string, chunks: string[]): Promise<LessonTag> {
  const openrouter = getOpenRouter();
  const content = chunks.join('\n\n---\n\n');
  const models = [MODELS.chat, MODELS.fallback];

  for (const model of models) {
    try {
      const response = await openrouter.chat.completions.create(
        {
          model,
          messages: [
            { role: 'system', content: TAGGING_SYSTEM_PROMPT },
            { role: 'user', content: `Lesson ID: ${lessonId}\n\nContent chunks:\n\n${content}` },
          ],
          temperature: 0.3,
          max_tokens: 512,
          response_format: {
            type: 'json_schema' as const,
            json_schema: {
              name: 'lesson_tag',
              strict: true,
              schema: tagJsonSchema,
            },
          },
        },
        { timeout: 15000 }
      );

      const rawContent = response.choices[0]?.message?.content;
      if (!rawContent) throw new Error('Empty LLM response');

      // Strip code fences if present
      const jsonString = rawContent.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/, '$1').trim();
      const parsed = JSON.parse(jsonString);
      const validated = lessonTagSchema.parse(parsed);
      return validated;
    } catch (err) {
      console.warn(`[tagging] Model ${model} failed for ${lessonId}:`, err instanceof Error ? err.message : err);
    }
  }

  throw new Error(`All models failed for lesson ${lessonId}`);
}

/**
 * Cluster raw topics into canonical forms using LLM.
 * Takes all unique raw topics, returns mapping { rawTopic -> canonicalTopic }.
 */
export async function clusterTopics(rawTopics: string[]): Promise<Record<string, string>> {
  const openrouter = getOpenRouter();

  const systemPrompt = `Group these Russian educational topics into canonical forms. Merge synonyms (e.g. "маржа", "маржинальность", "маржинальная прибыль" -> "Маржинальность"). Return JSON: { "raw_topic": "canonical_topic", ... } for ALL input topics. Every input topic MUST appear as a key in the output.`;

  const models = [MODELS.chat, MODELS.fallback];

  for (const model of models) {
    try {
      const response = await openrouter.chat.completions.create(
        {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: JSON.stringify(rawTopics) },
          ],
          temperature: 0.2,
          max_tokens: 8192,
        },
        { timeout: 60000 }
      );

      const rawContent = response.choices[0]?.message?.content;
      if (!rawContent) throw new Error('Empty LLM response');

      const jsonString = rawContent.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/, '$1').trim();
      const parsed = JSON.parse(jsonString) as Record<string, string>;

      // Validate that it's a Record<string, string>
      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('Clustering response is not an object');
      }

      return parsed;
    } catch (err) {
      console.warn(`[tagging] Clustering model ${model} failed:`, err instanceof Error ? err.message : err);
    }
  }

  // Fallback: identity mapping (no clustering)
  console.error('[tagging] All models failed for clustering, using identity mapping');
  const identity: Record<string, string> = {};
  for (const topic of rawTopics) {
    identity[topic] = topic;
  }
  return identity;
}
