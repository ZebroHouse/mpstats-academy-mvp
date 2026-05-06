// scripts/vision-poc/run-vlm.ts
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { POC_CONFIG } from './config';

interface FrameMeta {
  seq: number;
  timecode: string;
  pts: number;
  path: string;
}
interface VideoExtraction {
  lessonId: string;
  frames: FrameMeta[];
}

interface VlmResult {
  frameId: string;
  lessonId: string;
  framePath: string;
  model: string;
  response: any;
  rawContent: string;
  tokensIn: number;
  tokensOut: number;
  costUSD: number;
  latencyMs: number;
  error?: string;
}

// Прайсинг OpenRouter на 2026-05-06 (USD per 1M токенов; image — за кадр)
const PRICING: Record<string, { in: number; out: number; image: number }> = {
  'google/gemini-2.5-flash-lite': { in: 0.10, out: 0.40, image: 0.0001 },
  'google/gemini-3.1-flash-lite-preview': { in: 0.25, out: 1.50, image: 0.00025 },
  'openai/gpt-4.1-mini': { in: 0.40, out: 1.60, image: 0 }, // image в input tokens
  'google/gemini-2.5-flash': { in: 0.30, out: 2.50, image: 0.0003 },
};

function calcCost(model: string, tokensIn: number, tokensOut: number, hasImage: boolean): number {
  const p = PRICING[model];
  if (!p) return 0;
  return (tokensIn * p.in + tokensOut * p.out) / 1_000_000 + (hasImage ? p.image : 0);
}

function imageToDataUrl(path: string): string {
  const buf = readFileSync(path);
  const b64 = buf.toString('base64');
  return `data:image/jpeg;base64,${b64}`;
}

async function callVlm(model: string, prompt: string, imagePath: string, apiKey: string): Promise<{ raw: string; tokensIn: number; tokensOut: number; latencyMs: number }> {
  const dataUrl = imageToDataUrl(imagePath);
  const t0 = Date.now();
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://platform.mpstats.academy',
      'X-Title': 'MAAL Vision PoC',
    },
    body: JSON.stringify({
      model,
      max_tokens: 800,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });
  const latencyMs = Date.now() - t0;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${model} HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content ?? '';
  const usage = data.usage ?? {};
  return {
    raw: typeof raw === 'string' ? raw : JSON.stringify(raw),
    tokensIn: usage.prompt_tokens ?? 0,
    tokensOut: usage.completion_tokens ?? 0,
    latencyMs,
  };
}

function tryParseJson(raw: string): any {
  // VLM иногда возвращает JSON в ```json блоках — выдираем
  const fenced = raw.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  const candidate = (fenced ? fenced[1] : raw).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

async function rateLimitedQueue<T, R>(items: T[], rps: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const interval = 1000 / rps;
  const out: R[] = [];
  let last = 0;
  for (const item of items) {
    const since = Date.now() - last;
    if (since < interval) await new Promise((r) => setTimeout(r, interval - since));
    last = Date.now();
    out.push(await fn(item));
  }
  return out;
}

async function main() {
  const apiKey = process.env.OPENROUTER_POC_KEY;
  if (!apiKey) {
    console.error('OPENROUTER_POC_KEY env var required');
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(join(POC_CONFIG.results_dir, 'frames-manifest.json'), 'utf8')) as { videos: VideoExtraction[] };
  const prompt = readFileSync(join('scripts/vision-poc/prompts/frame-describe.txt'), 'utf8');

  // Собираем все frame_x_lesson задачи
  type Job = { lessonId: string; frame: FrameMeta; model: string };
  const jobs: Job[] = [];
  for (const v of manifest.videos) {
    for (const f of v.frames) {
      for (const model of POC_CONFIG.vlm_models) {
        jobs.push({ lessonId: v.lessonId, frame: f, model });
      }
    }
  }
  console.log(`Всего вызовов: ${jobs.length} (${manifest.videos.length} видео × 10 кадров × ${POC_CONFIG.vlm_models.length} моделей)`);

  const results: VlmResult[] = [];
  const totalCostUSD: Record<string, number> = {};

  let i = 0;
  for (const job of jobs) {
    i++;
    const framePath = join(POC_CONFIG.results_dir, job.frame.path);
    process.stdout.write(`[${i}/${jobs.length}] ${job.model} on ${job.lessonId}/frame_${job.frame.seq}... `);
    try {
      const { raw, tokensIn, tokensOut, latencyMs } = await callVlm(job.model, prompt, framePath, apiKey);
      const parsed = tryParseJson(raw);
      const cost = calcCost(job.model, tokensIn, tokensOut, true);
      totalCostUSD[job.model] = (totalCostUSD[job.model] ?? 0) + cost;
      results.push({
        frameId: `${job.lessonId}/frame_${String(job.frame.seq).padStart(3, '0')}`,
        lessonId: job.lessonId,
        framePath: job.frame.path,
        model: job.model,
        response: parsed,
        rawContent: raw,
        tokensIn,
        tokensOut,
        costUSD: cost,
        latencyMs,
      });
      console.log(`ok ${latencyMs}ms ${tokensIn}in/${tokensOut}out $${cost.toFixed(5)}`);
    } catch (e: any) {
      console.log(`FAIL ${e.message.slice(0, 80)}`);
      results.push({
        frameId: `${job.lessonId}/frame_${String(job.frame.seq).padStart(3, '0')}`,
        lessonId: job.lessonId,
        framePath: job.frame.path,
        model: job.model,
        response: null,
        rawContent: '',
        tokensIn: 0,
        tokensOut: 0,
        costUSD: 0,
        latencyMs: 0,
        error: e.message,
      });
    }
    // rate limit
    await new Promise((r) => setTimeout(r, 1000 / POC_CONFIG.rate_limit_rps));
  }

  const out = {
    runDate: new Date().toISOString(),
    models: POC_CONFIG.vlm_models,
    totalCostUSD,
    grandTotalUSD: Object.values(totalCostUSD).reduce((a, b) => a + b, 0),
    results,
  };
  const outPath = join(POC_CONFIG.results_dir, 'vlm-runs.json');
  writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log(`\nГотово: ${outPath}`);
  console.log(`Итого: ${results.length} вызовов, $${out.grandTotalUSD.toFixed(4)}`);
  console.log(`По моделям:`, totalCostUSD);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
