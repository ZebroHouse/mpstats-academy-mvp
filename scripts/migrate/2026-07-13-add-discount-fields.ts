// scripts/migrate/2026-07-13-add-discount-fields.ts
//
// Additive migration: discount fields for promo + ambassador codes.
// Run manually at deploy time (owner-gated). Requires SUPABASE_MGMT_TOKEN
// and project ref saecuecevicwjkpmaoot.
//
// Usage: NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/migrate/2026-07-13-add-discount-fields.ts

const PROJECT_REF = 'saecuecevicwjkpmaoot';
const TOKEN = process.env.SUPABASE_MGMT_TOKEN;
if (!TOKEN) throw new Error('SUPABASE_MGMT_TOKEN not set');

const STATEMENTS = [
  `CREATE TYPE "DiscountType" AS ENUM ('PERCENT', 'FIXED');`,
  `ALTER TABLE "PromoCode" ADD COLUMN "discountType" "DiscountType", ADD COLUMN "discountValue" INTEGER;`,
  `ALTER TABLE "ReferralCode" ADD COLUMN "discountType" "DiscountType", ADD COLUMN "discountValue" INTEGER;`,
  `ALTER TABLE "Referral" ADD COLUMN "discountConsumedAt" TIMESTAMP(3);`,
];

async function runQuery(query: string): Promise<void> {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    },
  );
  if (!res.ok) throw new Error(`Query failed (${res.status}): ${await res.text()}`);
}

async function main() {
  for (const stmt of STATEMENTS) {
    console.log('Applying:', stmt);
    await runQuery(stmt);
  }
  const migrationName = '20260713000000_add_discount_fields';
  await runQuery(`
    INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
    VALUES (gen_random_uuid()::text, 'manual-mgmt-api', '${migrationName}', now(), now(), 1)
    ON CONFLICT DO NOTHING;
  `);
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
