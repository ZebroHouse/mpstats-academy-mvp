/**
 * Zod schemas and JSON Schema for AI-generated diagnostic questions.
 *
 * Used to validate LLM structured output before converting to DiagnosticQuestion format.
 */

import { z } from 'zod';

// ============== ZOD SCHEMAS ==============

/**
 * Schema for a single LLM-generated question.
 * Enforces: 4 options, correctIndex 0-3, difficulty enum, length constraints.
 */
export const generatedQuestionSchema = z.object({
  question: z.string().min(10).max(500),
  options: z
    .array(z.string().min(1).max(300))
    .length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().min(10).max(500),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  marketplace: z.enum(['WB', 'OZON', 'BOTH']),
  sourceIndices: z.array(z.number().int().min(1).max(5)).min(1).max(5),
});

/**
 * Schema for the LLM response wrapper — an object with a questions array.
 */
export const generatedQuestionsArraySchema = z.object({
  questions: z.array(generatedQuestionSchema).min(1).max(5),
});

/**
 * Type inferred from Zod for a single generated question.
 */
export type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>;

// ============== JSON SCHEMA ==============

/**
 * Plain JSON Schema mirroring the Zod schemas above.
 * Used for OpenRouter `response_format: { type: "json_schema" }`.
 *
 * Must have `additionalProperties: false` at all levels and all fields required
 * for strict mode compliance.
 */
export const questionJsonSchema = {
  type: 'object' as const,
  additionalProperties: false,
  required: ['questions'],
  properties: {
    questions: {
      type: 'array' as const,
      minItems: 1,
      maxItems: 5,
      items: {
        type: 'object' as const,
        additionalProperties: false,
        required: ['question', 'options', 'correctIndex', 'explanation', 'difficulty', 'marketplace', 'sourceIndices'],
        properties: {
          question: {
            type: 'string' as const,
            minLength: 10,
            maxLength: 500,
          },
          options: {
            type: 'array' as const,
            items: {
              type: 'string' as const,
              minLength: 1,
              maxLength: 300,
            },
            minItems: 4,
            maxItems: 4,
          },
          correctIndex: {
            type: 'integer' as const,
            minimum: 0,
            maximum: 3,
          },
          explanation: {
            type: 'string' as const,
            minLength: 10,
            maxLength: 500,
          },
          difficulty: {
            type: 'string' as const,
            enum: ['EASY', 'MEDIUM', 'HARD'],
          },
          marketplace: {
            type: 'string' as const,
            enum: ['WB', 'OZON', 'BOTH'],
          },
          sourceIndices: {
            type: 'array' as const,
            items: {
              type: 'integer' as const,
              minimum: 1,
              maximum: 5,
            },
            minItems: 1,
            maxItems: 5,
          },
        },
      },
    },
  },
};
