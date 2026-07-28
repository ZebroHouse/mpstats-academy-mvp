/**
 * Тарифы 2.0 (Task 1a/1b) — PLATFORM 3/6 месяцев + снос COURSE.
 *
 * 🔴 C1 (rollout-safe order, см. docs/superpowers/plans/2026-07-28-pricing-2.0-multimonth.md):
 * задеплоенный прод-код ещё резолвит `findFirst({type:'PLATFORM', isActive:true})` без
 * ordering — пока код не задеплоен, НИКОГДА не делать новые PLATFORM-строки `isActive:true`
 * (иначе клиент, целящийся в 2990, может списаться по произвольной строке — 7990/13990).
 *
 * --phase=insert (Task 1a, безопасно уже сейчас):
 *   Идемпотентный INSERT двух новых PLATFORM-строк:
 *     - intervalDays=90,  price=7990,  name="Полный доступ — 3 месяца"
 *     - intervalDays=180, price=13990, name="Полный доступ — 6 месяцев"
 *   Обе isActive=false (тёмные), hidden=false. COURE НЕ трогается.
 *   Идемпотентность — по паре (type, intervalDays): если строка уже есть, insert скипается.
 *
 * --phase=activate (Task 1b, owner-only, ТОЛЬКО после верификации деплоя нового кода):
 *   Один UPDATE: новые 2 PLATFORM-строки → isActive=true, И COURSE → isActive=false.
 *   Откат — флип новых строк обратно в isActive=false (см. план, §Rollback).
 *
 * Форма зеркалит scripts/migrate-add-partner-entry.ts (Mgmt API, tsx, .secrets токен).
 * Запуск: NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/migrate-pricing-2.0-plans.ts --phase=insert
 */
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

const PROJECT_REF = 'saecuecevicwjkpmaoot';
const MGMT_URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

type NewPlanDef = {
  intervalDays: number;
  price: number;
  name: string;
};

const NEW_PLATFORM_PLANS: NewPlanDef[] = [
  { intervalDays: 90, price: 7990, name: 'Полный доступ — 3 месяца' },
  { intervalDays: 180, price: 13990, name: 'Полный доступ — 6 месяцев' },
];

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
  if (!res.ok) throw new Error(`Mgmt API ${res.status}: ${body.slice(0, 500)}`);
  return body ? JSON.parse(body) : null;
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function printPlans(token: string, label: string): Promise<void> {
  const rows = await runSql(
    token,
    `SELECT "id", "type", "name", "price", "intervalDays", "hidden", "isActive"
     FROM "SubscriptionPlan"
     WHERE "type" IN ('COURSE','PLATFORM')
     ORDER BY "type" ASC, "intervalDays" ASC;`,
  );
  console.log(`\n--- ${label} ---`);
  console.log(JSON.stringify(rows, null, 2));
}

async function phaseInsert(token: string): Promise<void> {
  await printPlans(token, 'BEFORE insert');

  for (const plan of NEW_PLATFORM_PLANS) {
    const existing = await runSql(
      token,
      `SELECT "id" FROM "SubscriptionPlan" WHERE "type"='PLATFORM' AND "intervalDays"=${plan.intervalDays};`,
    );
    const existingRows = Array.isArray(existing) ? existing : [];
    if (existingRows.length > 0) {
      console.log(`⏭️  skip: PLATFORM intervalDays=${plan.intervalDays} already exists (id=${(existingRows[0] as { id: string }).id})`);
      continue;
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    await runSql(
      token,
      `INSERT INTO "SubscriptionPlan" ("id","type","name","price","intervalDays","hidden","isActive","createdAt","updatedAt")
       VALUES (${sqlLiteral(id)}, 'PLATFORM', ${sqlLiteral(plan.name)}, ${plan.price}, ${plan.intervalDays}, false, false, ${sqlLiteral(now)}, ${sqlLiteral(now)});`,
    );
    console.log(`✅ inserted (DARK, isActive=false): PLATFORM intervalDays=${plan.intervalDays} price=${plan.price} id=${id}`);
  }

  await printPlans(token, 'AFTER insert');

  const activeCount = await runSql(
    token,
    `SELECT count(*)::int AS n FROM "SubscriptionPlan" WHERE "type"='PLATFORM' AND "isActive"=true;`,
  );
  console.log('\nℹ️ active PLATFORM plans count (must stay 1 until Task 1b):', JSON.stringify(activeCount));
}

async function phaseActivate(token: string): Promise<void> {
  await printPlans(token, 'BEFORE activate');

  console.log('\n🔴 --phase=activate: Task 1b — ТОЛЬКО после верификации деплоя нового кода. Продолжаю...');

  await runSql(
    token,
    `UPDATE "SubscriptionPlan"
     SET "isActive"=true, "updatedAt"=${sqlLiteral(new Date().toISOString())}
     WHERE "type"='PLATFORM' AND "intervalDays" IN (${NEW_PLATFORM_PLANS.map((p) => p.intervalDays).join(',')});`,
  );
  await runSql(
    token,
    `UPDATE "SubscriptionPlan"
     SET "isActive"=false, "updatedAt"=${sqlLiteral(new Date().toISOString())}
     WHERE "type"='COURSE' AND "isActive"=true;`,
  );

  console.log('✅ activated: new PLATFORM plans isActive=true; COURSE isActive=false');

  await printPlans(token, 'AFTER activate');
}

(async () => {
  const phaseArg = process.argv.find((a) => a.startsWith('--phase='));
  const phase = phaseArg ? phaseArg.split('=')[1] : undefined;

  if (phase !== 'insert' && phase !== 'activate') {
    console.error('Usage: tsx scripts/migrate-pricing-2.0-plans.ts --phase=insert|activate');
    process.exit(1);
  }

  const token = readMgmtToken();

  if (phase === 'insert') {
    await phaseInsert(token);
  } else {
    await phaseActivate(token);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
