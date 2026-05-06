// scripts/vision-poc/analyze.ts
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { POC_CONFIG } from './config';

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
interface OcrResult {
  frameId: string;
  framePath: string;
  rawText: string;
  extractedUrls: string[];
  extractedNumbers: string[];
}

function summary(r: VlmResult): string {
  if (r.error) return `❌ ERROR: ${r.error.slice(0, 100)}`;
  if (!r.response) return `⚠ Не парсится JSON: ${r.rawContent.slice(0, 100)}`;
  const ext = r.response.extracted ?? {};
  const parts = [
    `**type:** ${r.response.type ?? '?'}`,
    `**summary:** ${r.response.summary ?? ''}`,
  ];
  if (ext.urls?.length) parts.push(`**urls:** ${ext.urls.join(' | ')}`);
  if (ext.numbers?.length) parts.push(`**numbers:** ${ext.numbers.join(' | ')}`);
  if (ext.tools?.length) parts.push(`**tools:** ${ext.tools.join(' | ')}`);
  return parts.join('<br>');
}

async function main() {
  const vlm = JSON.parse(readFileSync(join(POC_CONFIG.results_dir, 'vlm-runs.json'), 'utf8'));
  const ocrRaw = JSON.parse(readFileSync(join(POC_CONFIG.results_dir, 'ocr-runs.json'), 'utf8'));
  const ocr: OcrResult[] = Array.isArray(ocrRaw) ? ocrRaw : (ocrRaw.entries ?? ocrRaw.results ?? []);
  const ocrMap = new Map(ocr.map((o) => [o.frameId, o]));

  // Группируем VLM по frameId
  const byFrame = new Map<string, VlmResult[]>();
  for (const r of vlm.results as VlmResult[]) {
    if (!byFrame.has(r.frameId)) byFrame.set(r.frameId, []);
    byFrame.get(r.frameId)!.push(r);
  }

  const lines: string[] = [];
  lines.push(`# VLM PoC Comparison — DRAFT`);
  lines.push('');
  lines.push(`**Сгенерировано:** ${new Date().toISOString()}`);
  lines.push(`**Дата прогона VLM:** ${vlm.runDate}`);
  lines.push('');
  lines.push(`## Затраты`);
  lines.push('');
  for (const [m, c] of Object.entries(vlm.totalCostUSD)) {
    lines.push(`- **${m}:** $${(c as number).toFixed(5)}`);
  }
  lines.push(`- **Итого:** $${vlm.grandTotalUSD.toFixed(5)}`);
  lines.push('');
  lines.push(`## Per-frame сравнение`);
  lines.push('');
  lines.push(`Заполни колонку «Hallucination?» руками: y/n/partial. Колонка «Best?» — пометить лучшую модель на этом кадре.`);
  lines.push('');

  for (const [frameId, runs] of byFrame) {
    const ocrRow = ocrMap.get(frameId);
    lines.push(`### ${frameId}`);
    lines.push('');
    lines.push(`![frame](${runs[0].framePath})`);
    lines.push('');
    if (ocrRow) {
      lines.push(`**OCR raw text (первые 300 ch):** \`${ocrRow.rawText.replace(/\s+/g, ' ').slice(0, 300)}\``);
      if (ocrRow.extractedUrls.length) lines.push(`**OCR URLs:** ${ocrRow.extractedUrls.join(' | ')}`);
      if (ocrRow.extractedNumbers.length) lines.push(`**OCR numbers (first 10):** ${ocrRow.extractedNumbers.slice(0, 10).join(' | ')}`);
      lines.push('');
    }
    lines.push(`| Модель | Описание | Hallucination? | Best? |`);
    lines.push(`|---|---|---|---|`);
    for (const r of runs) {
      lines.push(`| ${r.model} | ${summary(r)} | | |`);
    }
    lines.push('');
  }

  lines.push(`## Hallucination rate per model (заполнить руками после ручной разметки)`);
  lines.push('');
  for (const m of POC_CONFIG.vlm_models) {
    lines.push(`- **${m}:** ___ / 30 (___%)`);
  }
  lines.push('');
  lines.push(`## SC5: OCR vs VLM на URL/числах`);
  lines.push('');
  lines.push(`Заполнить после ручной сверки 10 кадров с явными URL/таблицами:`);
  lines.push(`- OCR URL accuracy: ___% (___ из ___ URL извлечены корректно)`);
  lines.push(`- VLM URL accuracy (best model): ___%`);
  lines.push(`- Решение: [ ] объединять OCR+VLM в Sprint 2 / [ ] VLM-only достаточно`);
  lines.push('');
  lines.push(`## Выбор best model`);
  lines.push('');
  lines.push(`Best model по итогам ручного анализа: **___**`);
  lines.push('');
  lines.push(`Обоснование: ___`);

  const outPath = join(POC_CONFIG.results_dir, 'comparison.md');
  writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.log(`Готово: ${outPath}`);
  console.log(`⚠ Это ЧЕРНОВИК. Открой и заполни руками колонки Hallucination/Best, hallucination rate, SC5, best model.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
