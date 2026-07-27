/**
 * Аддитивная миграция: CREATE TABLE EmergencyBlockEventDay через Supabase Mgmt API.
 * Forward-only, идемпотентно (IF NOT EXISTS). Токен — из .secrets/supabase-mgmt-token.md.
 * Запуск: NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/migrate-emergency-block-event-day.ts
 */
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

const PROJECT_REF = 'saecuecevicwjkpmaoot';
const SQL = `
CREATE TABLE IF NOT EXISTS "EmergencyBlockEventDay" (
  "surface" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "day" DATE NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmergencyBlockEventDay_pkey" PRIMARY KEY ("surface","kind","day")
);
CREATE INDEX IF NOT EXISTS "EmergencyBlockEventDay_day_idx" ON "EmergencyBlockEventDay"("day");
`;

function readMgmtToken(): string {
  const raw = readFileSync(path.resolve(__dirname, '../.secrets/supabase-mgmt-token.md'), 'utf8');
  const m = raw.match(/sbp_[A-Za-z0-9]+/);
  if (!m) throw new Error('Mgmt token (sbp_...) не найден в .secrets/supabase-mgmt-token.md');
  return m[0];
}

(async () => {
  const token = readMgmtToken();
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: SQL }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Mgmt API ${res.status}: ${body.slice(0, 300)}`);
  console.log('✅ migration applied. Response:', body.slice(0, 200) || '(empty)');
})().catch((e) => { console.error(e); process.exit(1); });
