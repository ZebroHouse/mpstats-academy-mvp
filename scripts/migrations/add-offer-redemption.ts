// Аддитивно: OfferRedemption table + Subscription.offerFirstPeriodDays. Idempotent. НЕ запускать локально.
// Запуск (owner, prod): NODE_OPTIONS=--dns-result-order=ipv4first SUPABASE_MGMT_TOKEN=... npx tsx scripts/migrations/add-offer-redemption.ts
const PROJECT_REF = 'saecuecevicwjkpmaoot';
const TOKEN = process.env.SUPABASE_MGMT_TOKEN;

async function run(sql: string) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  if (!TOKEN) throw new Error('SUPABASE_MGMT_TOKEN не задан');
  await run(`ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "offerFirstPeriodDays" integer;`);
  await run(`
    CREATE TABLE IF NOT EXISTS "OfferRedemption" (
      "id" text PRIMARY KEY,
      "userId" text NOT NULL UNIQUE,
      "subscriptionId" text NOT NULL,
      "offerKey" text NOT NULL,
      "redeemedAt" timestamp(3) NOT NULL DEFAULT now()
    );
  `);
  await run(`CREATE INDEX IF NOT EXISTS "OfferRedemption_userId_idx" ON "OfferRedemption" ("userId");`);
  console.log('OK: Subscription.offerFirstPeriodDays + OfferRedemption added');
}
main().catch((e) => { console.error(e); process.exit(1); });
