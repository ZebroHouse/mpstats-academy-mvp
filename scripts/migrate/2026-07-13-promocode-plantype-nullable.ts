/**
 * Additive migration: make PromoCode.planType nullable.
 * For discount codes, planType = NULL means "applies to any plan type".
 * Duration codes still set planType. All existing rows have planType set → safe.
 * (VPS has no prisma toolchain; localhost dev reads PROD Supabase → `prisma migrate/push` is FORBIDDEN.)
 *
 * Owner-gated: run manually at deploy time. Secrets come from ENV — never hardcode them here.
 * Run:
 *   SUPABASE_MGMT_TOKEN=<token> SUPABASE_PROJECT_REF=saecuecevicwjkpmaoot \
 *   NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/migrate/2026-07-13-promocode-plantype-nullable.ts
 *
 * Idempotent: DROP NOT NULL on an already-nullable column is a no-op + INSERT guarded by NOT EXISTS.
 * The DDL sent is byte-for-byte the migration.sql file below (single query), so the checksum recorded
 * in _prisma_migrations matches what was applied and `prisma migrate status` stays consistent.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const TOKEN = process.env.SUPABASE_MGMT_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF ?? 'saecuecevicwjkpmaoot';
if (!TOKEN) {
  console.error('Set SUPABASE_MGMT_TOKEN env var.');
  process.exit(1);
}
const MGMT_URL = `https://api.supabase.com/v1/projects/${REF}/database/query`;
const MIGRATION = '20260713010000_promocode_plantype_nullable';
const sqlPath = path.resolve(__dirname, `../../packages/db/prisma/migrations/${MIGRATION}/migration.sql`);
const sql = fs.readFileSync(sqlPath, 'utf-8');
const checksum = crypto.createHash('sha256').update(sql).digest('hex');

async function q(query: string): Promise<unknown> {
  const r = await fetch(MGMT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error(`Mgmt API ${r.status}: ${await r.text()}`);
  return r.json();
}

async function main() {
  console.log('Pre-flight: verifying current column state…');
  console.log(JSON.stringify(await q(`
    SELECT
      (SELECT is_nullable FROM information_schema.columns WHERE table_name='PromoCode' AND column_name='planType') AS plantype_is_nullable_before,
      EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name='${MIGRATION}') AS already_recorded;
  `), null, 2));

  console.log('Applying ALTER COLUMN … DROP NOT NULL (idempotent)…');
  await q(sql);

  console.log('Recording _prisma_migrations row (guarded)…');
  await q(`
    INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
    SELECT gen_random_uuid()::text, '${checksum}', NOW(), '${MIGRATION}', NULL, NULL, NOW(), 1
    WHERE NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = '${MIGRATION}');
  `);

  console.log('Verifying post-state…');
  console.log(JSON.stringify(await q(`
    SELECT
      (SELECT is_nullable FROM information_schema.columns WHERE table_name='PromoCode' AND column_name='planType') AS plantype_is_nullable_after,
      EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name='${MIGRATION}') AS recorded;
  `), null, 2));
  console.log(`checksum=${checksum}`);
  console.log('Done.');
}
main().catch((e) => { console.error(e.message); process.exit(1); });
