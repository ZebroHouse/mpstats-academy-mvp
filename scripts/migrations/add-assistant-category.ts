// Аддитивная миграция AssistantMessage: category + navLinks. Idempotent.
// Запуск: NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/migrations/add-assistant-category.ts
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
  await run(`ALTER TABLE "AssistantMessage" ADD COLUMN IF NOT EXISTS "category" text;`);
  await run(`ALTER TABLE "AssistantMessage" ADD COLUMN IF NOT EXISTS "navLinks" jsonb NOT NULL DEFAULT '[]'::jsonb;`);
  console.log('OK: category + navLinks добавлены');
}
main().catch((e) => { console.error(e); process.exit(1); });
