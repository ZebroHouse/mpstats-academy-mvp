/**
 * Seed script: AI-generate 100 mock diagnostic questions (20 per category)
 *
 * Uses OpenRouter LLM to generate marketplace-relevant MCQ questions
 * from RAG content chunks. Output is written as a TypeScript file
 * for human review before inclusion.
 *
 * Usage:
 *   pnpm tsx scripts/seed/seed-mock-questions.ts
 *   pnpm tsx scripts/seed/seed-mock-questions.ts --dry-run
 *   pnpm tsx scripts/seed/seed-mock-questions.ts --output path/to/file.ts
 *
 * Requires: OPENROUTER_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY in .env
 */

import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

// ── CLI flags ──────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes('--dry-run');
const outputIdx = process.argv.indexOf('--output');
const OUTPUT_PATH = outputIdx !== -1
  ? process.argv[outputIdx + 1]
  : path.resolve(__dirname, '../../packages/api/src/mocks/questions.generated.ts');

// ── Load .env manually (no dotenv dependency) ─────────────────────
function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    // Remove surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

// Load env from multiple possible locations
const projectRoot = path.resolve(__dirname, '../..');
loadEnvFile(path.join(projectRoot, '.env'));
loadEnvFile(path.join(projectRoot, 'apps/web/.env'));

// ── Constants ─────────────────────────────────────────────────────

const QUESTIONS_PER_CATEGORY = 20;

const CATEGORIES = ['ANALYTICS', 'MARKETING', 'CONTENT', 'OPERATIONS', 'FINANCE'] as const;
type SkillCategory = (typeof CATEGORIES)[number];

const CATEGORY_TO_COURSES: Record<SkillCategory, string[]> = {
  ANALYTICS: ['01_analytics'],
  MARKETING: ['02_ads', '05_ozon'],
  CONTENT: ['03_ai'],
  OPERATIONS: ['04_workshops', '06_express'],
  FINANCE: [], // No course data — generate from general knowledge
};

const CATEGORY_LABELS: Record<SkillCategory, string> = {
  ANALYTICS: 'Аналитика маркетплейсов',
  MARKETING: 'Маркетинг и реклама на маркетплейсах',
  CONTENT: 'Контент и карточки товаров',
  OPERATIONS: 'Операции и логистика маркетплейсов',
  FINANCE: 'Финансы и unit-экономика маркетплейсов',
};

// ── Zod schema ────────────────────────────────────────────────────

const questionSchema = z.object({
  question: z.string().min(10),
  options: z.array(z.string().min(1)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().min(10),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
});

const questionsArraySchema = z.object({
  questions: z.array(questionSchema).min(1).max(20),
});

const questionJsonSchema = {
  type: 'object' as const,
  additionalProperties: false,
  required: ['questions'],
  properties: {
    questions: {
      type: 'array' as const,
      minItems: 1,
      maxItems: 20,
      items: {
        type: 'object' as const,
        additionalProperties: false,
        required: ['question', 'options', 'correctIndex', 'explanation', 'difficulty'],
        properties: {
          question: { type: 'string' as const },
          options: {
            type: 'array' as const,
            items: { type: 'string' as const },
            minItems: 4, maxItems: 4,
          },
          correctIndex: { type: 'integer' as const, minimum: 0, maximum: 3 },
          explanation: { type: 'string' as const },
          difficulty: { type: 'string' as const, enum: ['EASY', 'MEDIUM', 'HARD'] },
        },
      },
    },
  },
};

// ── Clients ───────────────────────────────────────────────────────

function getOpenRouter(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');
  return new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey,
    defaultHeaders: {
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'MPSTATS Academy Seed',
    },
  });
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Supabase credentials not set');
  return createClient(url, key);
}

// ── Chunk fetching ────────────────────────────────────────────────

async function fetchChunksForCategory(
  supabase: ReturnType<typeof createClient>,
  category: SkillCategory,
  count: number
): Promise<string[]> {
  const prefixes = CATEGORY_TO_COURSES[category];
  if (prefixes.length === 0) return [];

  const orFilter = prefixes.map((p) => `lesson_id.like.${p}%`).join(',');
  const { data, error } = await supabase
    .from('content_chunk')
    .select('content')
    .or(orFilter)
    .limit(count);

  if (error) {
    console.warn(`  Warning: failed to fetch chunks for ${category}: ${error.message}`);
    return [];
  }

  return (data || []).map((d: { content: string }) => d.content);
}

// ── Generation ────────────────────────────────────────────────────

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  return match ? match[1].trim() : trimmed;
}

interface GeneratedQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
}

async function generateQuestionsForCategory(
  openrouter: OpenAI,
  category: SkillCategory,
  chunks: string[],
  count: number = QUESTIONS_PER_CATEGORY
): Promise<GeneratedQuestion[]> {
  const hasChunks = chunks.length > 0;
  const contextBlock = hasChunks
    ? `\n\nКонтекст из учебных материалов:\n${chunks.slice(0, 20).map((c, i) => `[${i + 1}] ${c}`).join('\n\n')}`
    : '';

  const categorySpecific = !hasChunks
    ? `\nТема: ${CATEGORY_LABELS[category]}. Генерируй вопросы на основе общих знаний о финансах маркетплейсов: unit-экономика, ROI, маржинальность, комиссии, налоги, cash flow, точка безубыточности.`
    : '';

  const systemPrompt = `Ты — AI-генератор тестовых вопросов для образовательной платформы MPSTATS Academy (маркетплейсы Ozon, Wildberries).

Создай ровно ${count} вопросов с множественным выбором по категории "${CATEGORY_LABELS[category]}".

Требования:
- 70% практических кейсов (ситуации, расчёты, решения), 30% теория/понятия/метрики
- Каждый вопрос: РОВНО 4 варианта ответа, 1 правильный (correctIndex 0-3)
- Микс сложности: EASY, MEDIUM, HARD
- Язык: русский
- Все вопросы уникальны и проверяют разные аспекты
- explanation КРАТКО (1-2 предложения) объясняет почему ответ верен${categorySpecific}

ЗАПРЕЩЕНО генерировать вопросы:
- Про мнения, советы или рекомендации конкретных преподавателей/спикеров
- Про доступ к инструментам, VPN, регистрацию в сервисах
- Про организационные вопросы обучения
- Не относящиеся к практическим навыкам работы на маркетплейсах

Каждый вопрос должен проверять КОНКРЕТНЫЙ НАВЫК или ЗНАНИЕ, применимое в работе селлера.

Формат: JSON { "questions": [...] }`;

  const response = await openrouter.chat.completions.create(
    {
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: hasChunks
            ? `Сгенерируй ${count} вопросов на основе контекста.${contextBlock}`
            : `Сгенерируй ${count} вопросов по теме "${CATEGORY_LABELS[category]}".`,
        },
      ],
      temperature: 0.7,
      max_tokens: 8192,
      response_format: {
        type: 'json_schema' as const,
        json_schema: {
          name: 'diagnostic_questions',
          strict: true,
          schema: questionJsonSchema,
        },
      },
    },
    { timeout: 30000 }
  );

  const rawContent = response.choices[0]?.message?.content;
  if (!rawContent) throw new Error('Empty response');

  const parsed = JSON.parse(stripCodeFences(rawContent));
  const validation = questionsArraySchema.safeParse(parsed);
  if (!validation.success) {
    throw new Error(`Validation failed: ${validation.error.issues.map((i) => i.message).join(', ')}`);
  }

  return validation.data.questions;
}

// ── File writer ───────────────────────────────────────────────────

function escapeString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

function generateTypeScriptFile(
  allQuestions: Array<{ category: SkillCategory; questions: GeneratedQuestion[] }>
): string {
  const lines: string[] = [];
  lines.push("import type { DiagnosticQuestion, SkillCategory, Difficulty } from '@mpstats/shared';");
  lines.push('');
  lines.push('// AUTO-GENERATED by scripts/seed/seed-mock-questions.ts');
  lines.push(`// Generated: ${new Date().toISOString()}`);
  lines.push('// Review before renaming to questions.ts');
  lines.push('');
  lines.push('export const MOCK_QUESTIONS: DiagnosticQuestion[] = [');

  for (const { category, questions } of allQuestions) {
    lines.push(`  // ============== ${category} (${questions.length}) ==============`);
    questions.forEach((q, i) => {
      const id = `q-${category.toLowerCase()}-${i + 1}`;
      lines.push('  {');
      lines.push(`    id: '${id}',`);
      lines.push(`    question: '${escapeString(q.question)}',`);
      lines.push(`    options: [`);
      q.options.forEach((opt) => {
        lines.push(`      '${escapeString(opt)}',`);
      });
      lines.push(`    ],`);
      lines.push(`    correctIndex: ${q.correctIndex},`);
      lines.push(`    explanation: '${escapeString(q.explanation)}',`);
      lines.push(`    difficulty: '${q.difficulty}' as Difficulty,`);
      lines.push(`    skillCategory: '${category}' as SkillCategory,`);
      lines.push('  },');
    });
  }

  lines.push('];');
  lines.push('');
  lines.push('// ============== UTILITY FUNCTIONS ==============');
  lines.push('');
  lines.push('export const getQuestionsByCategory = (category: SkillCategory): DiagnosticQuestion[] => {');
  lines.push('  return MOCK_QUESTIONS.filter((q) => q.skillCategory === category);');
  lines.push('};');
  lines.push('');
  lines.push('export const getMockQuestionsForCategory = (');
  lines.push('  category: SkillCategory,');
  lines.push('  count: number');
  lines.push('): DiagnosticQuestion[] => {');
  lines.push('  const categoryQuestions = getQuestionsByCategory(category);');
  lines.push('  const shuffled = [...categoryQuestions].sort(() => Math.random() - 0.5);');
  lines.push('  return shuffled.slice(0, count);');
  lines.push('};');
  lines.push('');
  lines.push('export const getBalancedQuestions = (count: number = 15): DiagnosticQuestion[] => {');
  lines.push("  const categories: SkillCategory[] = ['ANALYTICS', 'MARKETING', 'CONTENT', 'OPERATIONS', 'FINANCE'];");
  lines.push('  const perCategory = Math.floor(count / categories.length);');
  lines.push('  const result: DiagnosticQuestion[] = [];');
  lines.push('  categories.forEach((category) => {');
  lines.push('    result.push(...getMockQuestionsForCategory(category, perCategory));');
  lines.push('  });');
  lines.push('  return result.sort(() => Math.random() - 0.5);');
  lines.push('};');
  lines.push('');

  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  console.log('=== Mock Questions Seed Script ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'WRITE'}`);
  console.log(`Output: ${OUTPUT_PATH}`);
  console.log('');

  const openrouter = getOpenRouter();
  const supabase = getSupabase();

  const allQuestions: Array<{ category: SkillCategory; questions: GeneratedQuestion[] }> = [];

  for (const category of CATEGORIES) {
    console.log(`Generating ${QUESTIONS_PER_CATEGORY} questions for ${category}...`);

    // Fetch chunks for context
    const chunks = await fetchChunksForCategory(supabase, category, 20);
    console.log(`  Fetched ${chunks.length} chunks for context`);

    try {
      // Split into batches of 10 to avoid LLM output truncation
      const BATCH_SIZE = 10;
      const batches = Math.ceil(QUESTIONS_PER_CATEGORY / BATCH_SIZE);
      const allBatchQuestions: GeneratedQuestion[] = [];

      for (let batch = 0; batch < batches; batch++) {
        const batchCount = Math.min(BATCH_SIZE, QUESTIONS_PER_CATEGORY - allBatchQuestions.length);
        console.log(`  Batch ${batch + 1}/${batches} (${batchCount} questions)...`);
        const batchQuestions = await generateQuestionsForCategory(openrouter, category, chunks, batchCount);
        allBatchQuestions.push(...batchQuestions);
      }

      console.log(`  Generated ${allBatchQuestions.length} questions`);

      // Validate difficulty distribution
      const easy = allBatchQuestions.filter((q) => q.difficulty === 'EASY').length;
      const medium = allBatchQuestions.filter((q) => q.difficulty === 'MEDIUM').length;
      const hard = allBatchQuestions.filter((q) => q.difficulty === 'HARD').length;
      console.log(`  Difficulty: EASY=${easy}, MEDIUM=${medium}, HARD=${hard}`);

      allQuestions.push({ category, questions: allBatchQuestions });
    } catch (err) {
      console.error(`  FAILED for ${category}:`, err instanceof Error ? err.message : err);
      console.error(`  Skipping ${category} — run again or add manually.`);
    }
  }

  const totalQuestions = allQuestions.reduce((sum, q) => sum + q.questions.length, 0);
  console.log(`\nTotal questions generated: ${totalQuestions}`);

  if (totalQuestions === 0) {
    console.error('No questions generated. Check API keys and connectivity.');
    process.exit(1);
  }

  const fileContent = generateTypeScriptFile(allQuestions);

  if (DRY_RUN) {
    console.log('\n=== DRY RUN — Generated file content: ===\n');
    console.log(fileContent.slice(0, 2000) + '\n... (truncated)');
  } else {
    // Ensure output directory exists
    const outputDir = path.dirname(OUTPUT_PATH);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(OUTPUT_PATH, fileContent, 'utf-8');
    console.log(`\nWritten to: ${OUTPUT_PATH}`);
    console.log('Review the output, then rename to questions.ts if satisfied.');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
