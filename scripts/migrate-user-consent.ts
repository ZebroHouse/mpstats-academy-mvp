/**
 * Аддитивная миграция: enums ConsentKind/ConsentSource + таблица UserConsent через Supabase Mgmt API.
 * Forward-only, идемпотентно (guarded DO $$ для enums, IF NOT EXISTS для таблицы/индексов).
 * Токен — из .secrets/supabase-mgmt-token.md. Enum creation и table creation — отдельные вызовы
 * (использование значения enum не может делить транзакцию с его созданием).
 * Запуск: NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/migrate-user-consent.ts
 */
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

const PROJECT_REF = 'saecuecevicwjkpmaoot';

const SQL_ENUMS = `
DO $$ BEGIN
  IF to_regtype('"ConsentKind"') IS NULL THEN
    CREATE TYPE "ConsentKind" AS ENUM ('OFFER', 'PDN', 'ADV');
  END IF;
END $$;

DO $$ BEGIN
  IF to_regtype('"ConsentSource"') IS NULL THEN
    CREATE TYPE "ConsentSource" AS ENUM ('REGISTER', 'OAUTH_YANDEX', 'OAUTH_TOCHKA', 'PARTNER_ENTRY', 'CHECKOUT', 'ONBOARDING', 'BACKFILL');
  END IF;
END $$;
`;

const SQL_TABLE = `
CREATE TABLE IF NOT EXISTS "UserConsent" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" "ConsentKind" NOT NULL,
  "version" TEXT NOT NULL,
  "source" "ConsentSource" NOT NULL,
  "acceptedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "ip" TEXT,
  "userAgent" TEXT,
  CONSTRAINT "UserConsent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "UserConsent_userId_kind_idx" ON "UserConsent"("userId", "kind");
CREATE INDEX IF NOT EXISTS "UserConsent_acceptedAt_idx" ON "UserConsent"("acceptedAt");
`;

const SQL_STATE_CHECK = `
SELECT
  (CASE WHEN to_regtype('"ConsentKind"') IS NULL THEN 0 ELSE 1 END) AS has_consentkind,
  (CASE WHEN to_regtype('"ConsentSource"') IS NULL THEN 0 ELSE 1 END) AS has_consentsource,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'UserConsent') AS has_userconsent_table,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public') AS total_tables_public;
`;

function readMgmtToken(): string {
  const raw = readFileSync(path.resolve(__dirname, '../.secrets/supabase-mgmt-token.md'), 'utf8');
  const m = raw.match(/sbp_[A-Za-z0-9]+/);
  if (!m) throw new Error('Mgmt token (sbp_...) не найден в .secrets/supabase-mgmt-token.md');
  return m[0];
}

async function runQuery(token: string, query: string): Promise<string> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Mgmt API ${res.status}: ${body.slice(0, 300)}`);
  return body;
}

(async () => {
  const token = readMgmtToken();

  console.log('--- STATE BEFORE ---');
  console.log(await runQuery(token, SQL_STATE_CHECK));

  console.log('--- CREATING ENUMS (ConsentKind, ConsentSource) ---');
  console.log(await runQuery(token, SQL_ENUMS));

  console.log('--- CREATING TABLE (UserConsent) + indexes ---');
  console.log(await runQuery(token, SQL_TABLE));

  console.log('--- STATE AFTER ---');
  console.log(await runQuery(token, SQL_STATE_CHECK));

  console.log('✅ migration applied.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
