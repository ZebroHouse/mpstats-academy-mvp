// Аддитивно: Material.embedding vector(1536) + ivfflat index. Idempotent. НЕ запускать локально.
// Запуск (owner, staging/prod): NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/migrations/add-material-embedding.ts
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
  await run(`ALTER TABLE "Material" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);`);
  await run(
    `CREATE INDEX IF NOT EXISTS "Material_embedding_idx" ON "Material" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 50);`,
  );
  console.log('OK: Material.embedding + index добавлены');
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
