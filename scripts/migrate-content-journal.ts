/**
 * Аддитивная миграция журнала контента через Supabase Mgmt API:
 *   ContentView, UserDeviceDay, DiagnosticSession.device
 * Forward-only, идемпотентно (IF NOT EXISTS). Токен — из .secrets/supabase-mgmt-token.md.
 * Запуск: NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/migrate-content-journal.ts
 */
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

const PROJECT_REF = 'saecuecevicwjkpmaoot';
const SQL = `
CREATE TABLE IF NOT EXISTS "ContentView" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "lessonId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "device" TEXT NOT NULL,
  "activeSeconds" INTEGER NOT NULL DEFAULT 0,
  "maxPercent" INTEGER NOT NULL DEFAULT 0,
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContentView_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ContentView_lessonId_startedAt_idx" ON "ContentView"("lessonId","startedAt");
CREATE INDEX IF NOT EXISTS "ContentView_courseId_startedAt_idx" ON "ContentView"("courseId","startedAt");
CREATE INDEX IF NOT EXISTS "ContentView_userId_startedAt_idx" ON "ContentView"("userId","startedAt");
CREATE INDEX IF NOT EXISTS "ContentView_startedAt_idx" ON "ContentView"("startedAt");

CREATE TABLE IF NOT EXISTS "UserDeviceDay" (
  "userId" TEXT NOT NULL,
  "day" DATE NOT NULL,
  "device" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserDeviceDay_pkey" PRIMARY KEY ("userId","day","device")
);
CREATE INDEX IF NOT EXISTS "UserDeviceDay_day_idx" ON "UserDeviceDay"("day");

ALTER TABLE "DiagnosticSession" ADD COLUMN IF NOT EXISTS "device" TEXT;
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
