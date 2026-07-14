// Калибровка порога/K концьержа против карты.
// Запуск: NODE_OPTIONS=--dns-result-order=ipv4first npx tsx --conditions=react-server scripts/concierge-eval/run.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { embedQuery } from '../../packages/ai/src/embeddings';
import { matchTopK } from '../../packages/ai/src/assistant/concierge/concierge-match';
import { MAP_EMBEDDINGS } from '../../packages/ai/src/assistant/concierge/platform-map.embeddings';

const EMB = MAP_EMBEDDINGS;
const CASES = JSON.parse(readFileSync(join(__dirname, 'cases.json'), 'utf8')) as { query: string; expect: string }[];

const THRESHOLD = Number(process.env.TH ?? '0.35');

async function main() {
  let pass = 0;
  for (const c of CASES) {
    const vec = await embedQuery(c.query);
    const top = matchTopK(vec, EMB, { k: 4, threshold: THRESHOLD });
    const got = top[0]?.id ?? 'MISS';
    const ok = c.expect === 'MISS' ? top.length === 0 : top.some((m) => m.id === c.expect);
    if (ok) pass++;
    console.log(`${ok ? 'PASS' : 'FAIL'} [${c.query}] expect=${c.expect} got=${got} score=${top[0]?.score?.toFixed(2) ?? '-'}`);
  }
  console.log(`\n${pass}/${CASES.length} (threshold=${THRESHOLD})`);
}
main().catch((e) => { console.error(e); process.exit(1); });
