// scripts/vision-ingest/embed-and-insert.ts
import { Client } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';
import { INGEST_CONFIG } from './config';

interface VlmRunResult {
  frameId: string;
  lessonId: string;
  framePath: string;
  pts: number;
  timecode: string;
  response: { type?: string; summary?: string; extracted?: { urls?: string[]; numbers?: string[]; tools?: string[]; other?: string[]; } } | null;
  error?: string;
}

function buildContent(r: VlmRunResult): string {
  if (!r.response) return '';
  const ext = r.response.extracted ?? {};
  const parts = [`[ЭКРАН @ ${r.timecode}] ${r.response.summary ?? ''}`];
  if (ext.urls?.length) parts.push(`URLs: ${ext.urls.join(' | ')}`);
  if (ext.numbers?.length) parts.push(`Numbers: ${ext.numbers.join(' | ')}`);
  if (ext.tools?.length) parts.push(`Tools: ${ext.tools.join(' | ')}`);
  if (ext.other?.length) parts.push(`Other: ${ext.other.join(' | ')}`);
  return parts.join('. ');
}

function buildEmbeddingText(r: VlmRunResult): string {
  if (!r.response) return '';
  const ext = r.response.extracted ?? {};
  const parts = [r.response.summary ?? ''];
  if (ext.urls?.length) parts.push(`URLs: ${ext.urls.join(' | ')}`);
  if (ext.numbers?.length) parts.push(`Numbers: ${ext.numbers.join(' | ')}`);
  if (ext.tools?.length) parts.push(`Tools: ${ext.tools.join(' | ')}`);
  if (ext.other?.length) parts.push(`Other: ${ext.other.join(' | ')}`);
  return parts.filter(Boolean).join('. ');
}

async function embedBatch(texts: string[], apiKey: string): Promise<number[][]> {
  const res = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://platform.mpstats.academy',
      'X-Title': 'MAAL Vision Ingest',
    },
    body: JSON.stringify({ model: INGEST_CONFIG.embedding_model, input: texts }),
  });
  if (!res.ok) throw new Error(`Embed HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.data.map((d: any) => d.embedding);
}

async function main() {
  const apiKey = process.env.OPENROUTER_VISION_KEY;
  if (!apiKey) throw new Error('OPENROUTER_VISION_KEY required');
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL required');

  const SUFFIX = process.env.INGEST_SUFFIX?.trim() || '';
  const vlmRunsFile = SUFFIX ? `vlm-runs-${SUFFIX}.json` : 'vlm-runs.json';
  const runs = JSON.parse(readFileSync(join(INGEST_CONFIG.results_dir, vlmRunsFile), 'utf8')).results as VlmRunResult[];
  const valid = runs.filter((r) => !r.error && r.response);
  console.log(`${valid.length}/${runs.length} VLM responses valid (will embed and insert)`);

  const contents = valid.map(buildContent);
  const embeddingTexts = valid.map(buildEmbeddingText);
  const embeddings: number[][] = [];
  for (let i = 0; i < embeddingTexts.length; i += INGEST_CONFIG.embedding_batch_size) {
    const batch = embeddingTexts.slice(i, i + INGEST_CONFIG.embedding_batch_size);
    process.stdout.write(`Embedding ${i + 1}-${i + batch.length}/${embeddingTexts.length}... `);
    const embs = await embedBatch(batch, apiKey);
    embeddings.push(...embs);
    console.log('ok');
    await new Promise((r) => setTimeout(r, INGEST_CONFIG.embedding_rate_limit_delay_ms));
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  let inserted = 0;
  for (let i = 0; i < valid.length; i++) {
    const r = valid[i];
    const emb = embeddings[i];
    const tokenCount = Math.ceil(contents[i].length / 4);
    const metadata = {
      frame_path: `lesson-frames/${r.lessonId}/frame_${r.frameId.split('_frame_')[1].padStart(3, '0')}_${r.timecode.replace(':', '-')}.jpg`,
      pts: r.pts,
      vlm_model: INGEST_CONFIG.vlm_model,
      vlm_response: r.response,
    };

    await client.query(
      `INSERT INTO content_chunk (id, lesson_id, content, embedding, timecode_start, timecode_end, token_count, metadata, source_type, trust_tier, created_at)
       VALUES ($1, $2, $3, $4::vector, $5, $6, $7, $8, $9, $10, NOW())
       ON CONFLICT (id) DO UPDATE SET
         content = EXCLUDED.content,
         embedding = EXCLUDED.embedding,
         metadata = EXCLUDED.metadata`,
      [
        r.frameId,
        r.lessonId,
        contents[i],
        `[${emb.join(',')}]`,
        Math.round(r.pts),
        Math.round(r.pts),
        tokenCount,
        JSON.stringify(metadata),
        'academy_video_frame',
        1,
      ],
    );
    inserted++;
    if (inserted % 20 === 0) console.log(`  ${inserted}/${valid.length} inserted`);
  }

  await client.end();
  console.log(`\nInserted ${inserted} frame chunks`);
}

main().catch((e) => { console.error(e); process.exit(1); });
