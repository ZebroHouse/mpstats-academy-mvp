/**
 * Additive migration: discount fields for promo + ambassador codes.
 * DiscountType enum + nullable discount columns on PromoCode/ReferralCode + Referral.discountConsumedAt.
 * (VPS has no prisma toolchain; localhost dev reads PROD Supabase → `prisma migrate/push` is FORBIDDEN.)
 *
 * Owner-gated: run manually at deploy time. Secrets come from ENV — never hardcode them here.
 * Run:
 *   SUPABASE_MGMT_TOKEN=<token> SUPABASE_PROJECT_REF=saecuecevicwjkpmaoot \
 *   NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/migrate/2026-07-13-add-discount-fields.ts
 *
 * Idempotent: guarded enum create (DO block) + ALTER ... ADD COLUMN IF NOT EXISTS + INSERT guarded by NOT EXISTS.
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
const MIGRATION = '20260713000000_add_discount_fields';
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
      EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DiscountType') AS enum_before,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='PromoCode' AND column_name='discountType') AS promo_before,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ReferralCode' AND column_name='discountType') AS refcode_before,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Referral' AND column_name='discountConsumedAt') AS referral_before,
      EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name='${MIGRATION}') AS already_recorded;
  `), null, 2));

  console.log('Applying enum + ALTER TABLE … ADD COLUMN IF NOT EXISTS (additive, idempotent)…');
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
      EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DiscountType') AS enum_ok,
      (SELECT data_type FROM information_schema.columns WHERE table_name='PromoCode' AND column_name='discountValue') AS promo_value_type,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ReferralCode' AND column_name='discountType') AS refcode_ok,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Referral' AND column_name='discountConsumedAt') AS referral_ok,
      EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name='${MIGRATION}') AS recorded;
  `), null, 2));
  console.log(`checksum=${checksum}`);
  console.log('Done.');
}
main().catch((e) => { console.error(e.message); process.exit(1); });
