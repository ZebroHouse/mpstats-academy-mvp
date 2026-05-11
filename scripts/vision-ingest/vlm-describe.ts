// scripts/vision-ingest/vlm-describe.ts
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { INGEST_CONFIG } from './config';

interface FrameMeta { seq: number; timecode: string; pts: number; path: string; }
interface VideoExtraction { lessonId: string; frames: FrameMeta[]; }

interface VlmExtracted {
  urls?: string[];
  numbers?: string[];
  tools?: string[];
  other?: string[];
}
interface VlmResponse {
  type?: string;
  summary?: string;
  extracted?: VlmExtracted;
}

interface VlmRunResult {
  frameId: string;
  lessonId: string;
  framePath: string;
  pts: number;
  timecode: string;
  response: VlmResponse | null;
  rawContent: string;
  tokensIn: number;
  tokensOut: number;
  costUSD: number;
  latencyMs: number;
  error?: string;
}

const PRICING_GPT41_MINI = { in: 0.40 / 1_000_000, out: 1.60 / 1_000_000 };

function imageToDataUrl(path: string): string {
  return `data:image/jpeg;base64,${readFileSync(path).toString('base64')}`;
}

function tryParseJson(raw: string): VlmResponse | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  const candidate = (fenced ? fenced[1] : raw).trim();
  try { return JSON.parse(candidate); } catch { return null; }
}

async function callVlm(prompt: string, imagePath: string, apiKey: string, model: string): Promise<{ raw: string; tokensIn: number; tokensOut: number; latencyMs: number }> {
  const dataUrl = imageToDataUrl(imagePath);
  const t0 = Date.now();
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://platform.mpstats.academy',
      'X-Title': 'MAAL Vision Ingest',
    },
    body: JSON.stringify({
      model,
      max_tokens: INGEST_CONFIG.vlm_max_tokens,
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
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const raw = typeof data.choices?.[0]?.message?.content === 'string' ? data.choices[0].message.content : JSON.stringify(data.choices?.[0]?.message?.content);
  return {
    raw,
    tokensIn: data.usage?.prompt_tokens ?? 0,
    tokensOut: data.usage?.completion_tokens ?? 0,
    latencyMs,
  };
}

async function main() {
  const apiKey = process.env.OPENROUTER_VISION_KEY;
  if (!apiKey) throw new Error('OPENROUTER_VISION_KEY required');
  const SUFFIX = process.env.INGEST_SUFFIX?.trim() || '';
  const manifestFile = SUFFIX ? `frames-manifest-${SUFFIX}.json` : 'frames-manifest.json';
  const vlmRunsFile = SUFFIX ? `vlm-runs-${SUFFIX}.json` : 'vlm-runs.json';
  const manifest = JSON.parse(readFileSync(join(INGEST_CONFIG.results_dir, manifestFile), 'utf8')) as { videos: VideoExtraction[] };
  const prompt = readFileSync(join('scripts/vision-ingest/prompts/frame-describe.txt'), 'utf8');

  type Job = { lessonId: string; frame: FrameMeta };
  const jobs: Job[] = [];
  for (const v of manifest.videos) for (const f of v.frames) jobs.push({ lessonId: v.lessonId, frame: f });
  console.log(`Total VLM calls: ${jobs.length}`);

  const results: VlmRunResult[] = [];
  let totalCost = 0;
  let i = 0;
  for (const job of jobs) {
    i++;
    const framePath = join(INGEST_CONFIG.results_dir, job.frame.path);
    const frameId = `${job.lessonId}_frame_${String(job.frame.seq).padStart(3, '0')}`;
    process.stdout.write(`[${i}/${jobs.length}] ${frameId}... `);
    let res: any = null, error: string | undefined;
    try {
      res = await callVlm(prompt, framePath, apiKey, INGEST_CONFIG.vlm_model);
      let parsed = tryParseJson(res.raw);
      if (!parsed) {
        const retryPrompt = prompt + '\n\nВНИМАНИЕ: верни СТРОГО JSON, без markdown-блоков, без пояснений.';
        const res2 = await callVlm(retryPrompt, framePath, apiKey, INGEST_CONFIG.vlm_model);
        parsed = tryParseJson(res2.raw);
        res.raw = res2.raw;
        res.tokensIn += res2.tokensIn;
        res.tokensOut += res2.tokensOut;
      }
      const cost = res.tokensIn * PRICING_GPT41_MINI.in + res.tokensOut * PRICING_GPT41_MINI.out;
      totalCost += cost;
      results.push({
        frameId, lessonId: job.lessonId, framePath: job.frame.path,
        pts: job.frame.pts, timecode: job.frame.timecode,
        response: parsed, rawContent: res.raw,
        tokensIn: res.tokensIn, tokensOut: res.tokensOut,
        costUSD: cost, latencyMs: res.latencyMs,
      });
      console.log(`ok ${res.latencyMs}ms $${cost.toFixed(5)}`);
    } catch (e: any) {
      error = e.message;
      results.push({
        frameId, lessonId: job.lessonId, framePath: job.frame.path,
        pts: job.frame.pts, timecode: job.frame.timecode,
        response: null, rawContent: '',
        tokensIn: 0, tokensOut: 0, costUSD: 0, latencyMs: 0, error,
      });
      console.log(`FAIL ${error?.slice(0, 80)}`);
    }
    await new Promise((r) => setTimeout(r, 1000 / INGEST_CONFIG.vlm_rate_limit_rps));
  }

  writeFileSync(
    join(INGEST_CONFIG.results_dir, vlmRunsFile),
    JSON.stringify({ runDate: new Date().toISOString(), model: INGEST_CONFIG.vlm_model, totalCostUSD: totalCost, results }, null, 2),
    'utf8',
  );
  console.log(`\nDone: ${results.length} calls, $${totalCost.toFixed(4)}, ${results.filter(r => r.error).length} errors, ${results.filter(r => !r.error && !r.response).length} parse-fails`);
}

main().catch((e) => { console.error(e); process.exit(1); });
