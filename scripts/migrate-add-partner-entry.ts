/**
 * Аддитивная миграция: колонка UserProfile.isPartnerEntry + бэкфилл партнёрских.
 * Forward-only, идемпотентно (IF NOT EXISTS). Токен — из .secrets/supabase-mgmt-token.md.
 * Зеркалит auth.users.raw_user_meta_data->>'partner_source'='mpstats' в BOOLEAN-колонку,
 * чтобы аналитика (Prisma по UserProfile) фильтровала партнёрский трафик одной строкой.
 * Запуск: NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/migrate-add-partner-entry.ts
 */
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

const PROJECT_REF = 'saecuecevicwjkpmaoot';
const MGMT_URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

function readMgmtToken(): string {
  const raw = readFileSync(path.resolve(__dirname, '../.secrets/supabase-mgmt-token.md'), 'utf8');
  const m = raw.match(/sbp_[A-Za-z0-9]+/);
  if (!m) throw new Error('Mgmt token (sbp_...) не найден в .secrets/supabase-mgmt-token.md');
  return m[0];
}

async function runSql(token: string, query: string): Promise<unknown> {
  const res = await fetch(MGMT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Mgmt API ${res.status}: ${body.slice(0, 300)}`);
  return body ? JSON.parse(body) : null;
}

(async () => {
  const token = readMgmtToken();

  // 1. Аддитивно добавить колонку (существующие строки получат false).
  await runSql(token, `ALTER TABLE "UserProfile" ADD COLUMN IF NOT EXISTS "isPartnerEntry" BOOLEAN NOT NULL DEFAULT false;`);
  console.log('✅ column added (IF NOT EXISTS)');

  // 2. Dry-run: сколько партнёрских помечено в auth.users.
  const dry = await runSql(token, `SELECT count(*)::int AS n FROM auth.users WHERE raw_user_meta_data->>'partner_source'='mpstats';`);
  console.log('ℹ️ partner users in auth.users:', JSON.stringify(dry));

  // 3. Бэкфилл: проставить isPartnerEntry=true партнёрским (id::text — auth.users.id uuid vs наш text).
  await runSql(token, `
    UPDATE "UserProfile" SET "isPartnerEntry"=true
    WHERE id IN (SELECT id::text FROM auth.users WHERE raw_user_meta_data->>'partner_source'='mpstats');
  `);
  console.log('✅ backfill applied');

  // 4. Проверка: сколько строк теперь помечено.
  const after = await runSql(token, `SELECT count(*)::int AS n FROM "UserProfile" WHERE "isPartnerEntry"=true;`);
  console.log('✅ UserProfile with isPartnerEntry=true:', JSON.stringify(after));
})().catch((e) => { console.error(e); process.exit(1); });
