// Plain-text extraction + chunking for indexing TEXT/INTERACTIVE lesson bodies.
import { embedQuery } from './embeddings';

type JSONNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: JSONNode[];
};

// Block-level nodes whose extracted text should be separated by a newline.
const BLOCK_TYPES = new Set([
  'paragraph', 'heading', 'listItem', 'blockquote',
  'tableCell', 'tableHeader', 'callout',
]);

export function extractPlainText(doc: JSONNode | null | undefined): string {
  if (!doc) return '';
  const blocks: string[] = [];

  const walk = (node: JSONNode): string => {
    if (node.type === 'text') return node.text ?? '';
    // Surface a checkpoint option's button label as its own block so the
    // branch answers are searchable / visible to the AI chat.
    if (node.type === 'checkpointOption' && typeof node.attrs?.label === 'string') {
      const label = (node.attrs.label as string).trim();
      if (label) blocks.push(label);
    }
    let inline = '';
    if (node.content) for (const child of node.content) inline += walk(child);
    if (node.type && BLOCK_TYPES.has(node.type)) {
      const trimmed = inline.trim();
      if (trimmed) blocks.push(trimmed);
      return '';
    }
    return inline;
  };

  walk(doc);
  return blocks.join('\n');
}

export function chunkText(text: string, maxLen = 1500): string[] {
  const clean = text.trim();
  if (!clean) return [];
  if (clean.length <= maxLen) return [clean];

  const words = clean.split(/\s+/);
  const chunks: string[] = [];
  let current = '';
  for (const word of words) {
    if (current && current.length + 1 + word.length > maxLen) {
      chunks.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

type IndexArgs = {
  prisma: {
    $executeRawUnsafe: (sql: string, ...args: unknown[]) => Promise<number>;
  };
  lessonId: string;
  skillCategory: string | null;
  doc: JSONNode | null;
};

const TEXT_SOURCE_TYPE = 'academy_text';

export async function indexLessonText(args: IndexArgs): Promise<{ chunks: number }> {
  const { prisma, lessonId, skillCategory, doc } = args;

  // Idempotent: clear this lesson's existing text chunks first.
  await prisma.$executeRawUnsafe(
    `DELETE FROM content_chunk WHERE lesson_id = $1 AND source_type = $2`,
    lessonId,
    TEXT_SOURCE_TYPE,
  );

  const chunks = chunkText(extractPlainText(doc));
  if (chunks.length === 0) return { chunks: 0 };

  for (let i = 0; i < chunks.length; i++) {
    const content = chunks[i];
    const embedding = await embedQuery(content);
    const vectorLiteral = `[${embedding.join(',')}]`;
    const chunkId = `${lessonId}_text_chunk_${String(i).padStart(3, '0')}`;
    const skillSql = skillCategory ? `$5::"SkillCategory"` : `NULL`;
    const params: unknown[] = [chunkId, lessonId, content, vectorLiteral];
    if (skillCategory) params.push(skillCategory);

    await prisma.$executeRawUnsafe(
      `INSERT INTO content_chunk
         (id, lesson_id, content, embedding, timecode_start, timecode_end,
          token_count, source_type, trust_tier, ${skillCategory ? 'skill_category, ' : ''}created_at)
       VALUES
         ($1, $2, $3, $4::vector(1536), 0, 0, NULL, '${TEXT_SOURCE_TYPE}', 1, ${skillCategory ? skillSql + ', ' : ''}now())
       ON CONFLICT (id) DO UPDATE SET
         content = EXCLUDED.content,
         embedding = EXCLUDED.embedding,
         token_count = EXCLUDED.token_count`,
      ...params,
    );
  }

  return { chunks: chunks.length };
}
