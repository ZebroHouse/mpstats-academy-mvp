# Трекинг ЧП-блока — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Захватывать показы/клики ЧП-блока по поверхностям (баннер витрины / пин решений) в day-счётчик, чтобы отдавать воронку показ→клик→CTR→открыл→досмотрел по запросу.

**Architecture:** Новая таблица-счётчик `EmergencyBlockEventDay` (калька `ReferralCodeClickDay`). tRPC-мутация `job.recordEmergencyEvent` (env-gated, upsert) вызывается fire-and-forget из клиентских компонентов баннера/пина. Отчёт — committed-скрипт (без UI).

**Tech Stack:** Next.js 14, tRPC, Prisma (Supabase), Vitest, Docker Compose.

## Global Constraints

- **Prod-safety:** миграция ТОЛЬКО аддитивная, forward-only, через **Supabase Mgmt API** (`POST https://api.supabase.com/v1/projects/saecuecevicwjkpmaoot/database/query`, токен в `.secrets/supabase-mgmt-token.md`). **`prisma migrate/push` против этой БД ЗАПРЕЩЁН.** `CREATE TABLE IF NOT EXISTS`.
- **Ветка:** `feature/emergency-block-tracking`. Не трогать master напрямую. Субагенты НЕ выполняют `git checkout/branch/switch/reset/stash` — только add+commit; если `git branch --show-current` ≠ ветке — STOP.
- **Гард от staging:** запись только при `EMERGENCY_TRACK_ENABLED === 'true'` (ставим на проде; staging делит ту же БД). Мутация при off — no-op.
- **Enum входа:** `surface ∈ {BANNER, PIN}`, `kind ∈ {IMPRESSION, CLICK}` (z.enum).
- **Client fetch:** данные/мутации только через tRPC, без server-only импортов в клиент (см. gotcha `next build`).
- **Билд перед деплоем:** `pnpm --filter web build` локально.
- **Скрипты Supabase:** `NODE_OPTIONS=--dns-result-order=ipv4first npx tsx <script>`.

---

## File Structure

- Modify `packages/db/prisma/schema.prisma` — модель `EmergencyBlockEventDay`.
- Create `scripts/migrate-emergency-block-event-day.ts` — применяет `CREATE TABLE` через Mgmt API.
- Modify `packages/api/src/routers/job.ts` — мутация `recordEmergencyEvent`.
- Create `packages/api/src/routers/__tests__/job-emergency-event.test.ts` — тесты.
- Modify `apps/web/src/components/dashboard/EmergencyBanner.tsx` — impression+click (BANNER).
- Modify `apps/web/src/components/learning/EmergencyFeaturedCard.tsx` — impression+click (PIN).
- Create `scripts/crisis-job-stats.ts` — отчёт по запросу.

---

## Task 1: Схема + прод-миграция (Mgmt API)

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `scripts/migrate-emergency-block-event-day.ts`

**Interfaces:**
- Produces: таблица `EmergencyBlockEventDay(surface, kind, day, count, createdAt)` PK `(surface,kind,day)`; Prisma-модель + сгенерированный клиент (`prisma.emergencyBlockEventDay`, where-ключ `surface_kind_day`).

- [ ] **Step 1: Добавить модель в schema.prisma**

Рядом с `ReferralCodeClickDay` (после неё) добавить:

```prisma
/// Day-bucketed счётчик показов/кликов ЧП-блока (баннер витрины / пин решений).
/// Без PII. Пишется мутацией job.recordEmergencyEvent (env-gated EMERGENCY_TRACK_ENABLED).
model EmergencyBlockEventDay {
  surface   String   // BANNER | PIN
  kind      String   // IMPRESSION | CLICK
  day       DateTime @db.Date
  count     Int      @default(0)
  createdAt DateTime @default(now())

  @@id([surface, kind, day])
  @@index([day])
}
```

- [ ] **Step 2: Сгенерировать клиент**

Run: `cd "D:/GpT_docs/mpSTATS ACADEMY ADAPTIVE LEARNING/MAAL" && npx prisma@5.22.0 generate --schema packages/db/prisma/schema.prisma`
Expected: `Generated Prisma Client`. (Версия 5.22.0 — по гоче проекта.)

- [ ] **Step 3: Скрипт миграции через Mgmt API**

```typescript
// scripts/migrate-emergency-block-event-day.ts
/**
 * Аддитивная миграция: CREATE TABLE EmergencyBlockEventDay через Supabase Mgmt API.
 * Forward-only, идемпотентно (IF NOT EXISTS). Токен — из .secrets/supabase-mgmt-token.md.
 * Запуск: npx tsx scripts/migrate-emergency-block-event-day.ts
 */
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

const PROJECT_REF = 'saecuecevicwjkpmaoot';
const SQL = `
CREATE TABLE IF NOT EXISTS "EmergencyBlockEventDay" (
  "surface" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "day" DATE NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmergencyBlockEventDay_pkey" PRIMARY KEY ("surface","kind","day")
);
CREATE INDEX IF NOT EXISTS "EmergencyBlockEventDay_day_idx" ON "EmergencyBlockEventDay"("day");
`;

// Токен из .secrets (файл gitignored) — берём строку вида `token: sbp_...` или сырое значение.
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
  console.log('✅ migration applied:', body.slice(0, 200));
})().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 4: Применить миграцию к проду**

Run: `NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/migrate-emergency-block-event-day.ts`
Expected: `✅ migration applied`.

- [ ] **Step 5: Verify таблица есть**

Через Mgmt API или tsx: `SELECT to_regclass('public."EmergencyBlockEventDay"');` → не NULL. (Можно inline-tsx `prisma.emergencyBlockEventDay.count()` → 0.)

- [ ] **Step 6: Commit**

```bash
git add packages/db/prisma/schema.prisma scripts/migrate-emergency-block-event-day.ts
git commit -m "feat(db): EmergencyBlockEventDay counter + additive prod migration"
```

> ⚠️ Task 1 — прод-DDL, выполняется КОНТРОЛЛЕРОМ вручную (не слепым субагентом). Порядок: применить SQL к проду → generate → commit.

---

## Task 2: tRPC `job.recordEmergencyEvent`

**Files:**
- Modify: `packages/api/src/routers/job.ts`
- Test: `packages/api/src/routers/__tests__/job-emergency-event.test.ts`

**Interfaces:**
- Consumes: `prisma.emergencyBlockEventDay.upsert` (Task 1).
- Produces: `job.recordEmergencyEvent({ surface: 'BANNER'|'PIN', kind: 'IMPRESSION'|'CLICK' })` → `{ recorded: boolean }`.

- [ ] **Step 1: Написать падающий тест**

```typescript
// packages/api/src/routers/__tests__/job-emergency-event.test.ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import { jobRouter } from '../job';

// protectedProcedure дёргает userProfile (lastActiveAt) — мокаем, как в job.test.ts
function makeCtx() {
  const prisma = {
    userProfile: { findUnique: vi.fn().mockResolvedValue({ id: 'u1' }), update: vi.fn().mockResolvedValue({}) },
    emergencyBlockEventDay: { upsert: vi.fn().mockResolvedValue({}) },
  };
  return { caller: jobRouter.createCaller({ prisma, user: { id: 'u1' } } as any), prisma };
}

describe('job.recordEmergencyEvent', () => {
  const OLD = process.env.EMERGENCY_TRACK_ENABLED;
  afterEach(() => { process.env.EMERGENCY_TRACK_ENABLED = OLD; });

  it('флаг off → no-op, upsert не вызван', async () => {
    process.env.EMERGENCY_TRACK_ENABLED = 'false';
    const { caller, prisma } = makeCtx();
    const r = await caller.recordEmergencyEvent({ surface: 'BANNER', kind: 'IMPRESSION' });
    expect(r).toEqual({ recorded: false });
    expect(prisma.emergencyBlockEventDay.upsert).not.toHaveBeenCalled();
  });

  it('флаг on → upsert инкрементит нужный ключ', async () => {
    process.env.EMERGENCY_TRACK_ENABLED = 'true';
    const { caller, prisma } = makeCtx();
    const r = await caller.recordEmergencyEvent({ surface: 'PIN', kind: 'CLICK' });
    expect(r).toEqual({ recorded: true });
    expect(prisma.emergencyBlockEventDay.upsert).toHaveBeenCalledTimes(1);
    const arg = prisma.emergencyBlockEventDay.upsert.mock.calls[0][0];
    expect(arg.where.surface_kind_day).toMatchObject({ surface: 'PIN', kind: 'CLICK' });
    expect(arg.create).toMatchObject({ surface: 'PIN', kind: 'CLICK', count: 1 });
    expect(arg.update).toEqual({ count: { increment: 1 } });
  });

  it('невалидный surface → zod reject', async () => {
    process.env.EMERGENCY_TRACK_ENABLED = 'true';
    const { caller } = makeCtx();
    await expect(caller.recordEmergencyEvent({ surface: 'X' as any, kind: 'CLICK' })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @mpstats/api test job-emergency-event`
Expected: FAIL (`recordEmergencyEvent is not a function`).

- [ ] **Step 3: Реализовать мутацию в job.ts**

В `jobRouter` (после `getEmergencyFeatured`) добавить:

```typescript
  // Захват показов/кликов ЧП-блока (spec 2026-07-27). Env-gated: пишем только на
  // проде (EMERGENCY_TRACK_ENABLED=true), т.к. staging делит ту же БД. off → no-op.
  recordEmergencyEvent: protectedProcedure
    .input(z.object({
      surface: z.enum(['BANNER', 'PIN']),
      kind: z.enum(['IMPRESSION', 'CLICK']),
    }))
    .mutation(async ({ ctx, input }) => {
      if (process.env.EMERGENCY_TRACK_ENABLED !== 'true') return { recorded: false as const };
      const now = new Date();
      const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      await ctx.prisma.emergencyBlockEventDay.upsert({
        where: { surface_kind_day: { surface: input.surface, kind: input.kind, day } },
        create: { surface: input.surface, kind: input.kind, day, count: 1 },
        update: { count: { increment: 1 } },
      });
      return { recorded: true as const };
    }),
```

(Использует существующий `z` и `protectedProcedure` в `job.ts`.)

- [ ] **Step 4: Verify GREEN**

Run: `pnpm --filter @mpstats/api test job-emergency-event`
Expected: PASS (3 теста).

- [ ] **Step 5: Регресс job**

Run: `pnpm --filter @mpstats/api test job`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/routers/job.ts packages/api/src/routers/__tests__/job-emergency-event.test.ts
git commit -m "feat(api): job.recordEmergencyEvent counter mutation (env-gated)"
```

---

## Task 3: Проставить события в баннере и пине

**Files:**
- Modify: `apps/web/src/components/dashboard/EmergencyBanner.tsx`
- Modify: `apps/web/src/components/learning/EmergencyFeaturedCard.tsx`

**Interfaces:**
- Consumes: `trpc.job.recordEmergencyEvent` (Task 2).

- [ ] **Step 1: EmergencyBanner — impression на маунте + click**

В `apps/web/src/components/dashboard/EmergencyBanner.tsx`:
- Добавить импорты: `import { useEffect, useRef } from 'react';` и `import { trpc } from '@/lib/trpc/client';`
- Внутри компонента, до `return`:

```tsx
  const track = trpc.job.recordEmergencyEvent.useMutation();
  const impressionFired = useRef(false);
  useEffect(() => {
    if (impressionFired.current) return; // guard от double-invoke (React 18 StrictMode)
    impressionFired.current = true;
    track.mutate({ surface: 'BANNER', kind: 'IMPRESSION' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```
- На корневой `<Link>` добавить: `onClick={() => track.mutate({ surface: 'BANNER', kind: 'CLICK' })}`

- [ ] **Step 2: EmergencyFeaturedCard — то же с surface=PIN**

В `apps/web/src/components/learning/EmergencyFeaturedCard.tsx` — идентично Step 1, но `surface: 'PIN'` в обоих вызовах (`IMPRESSION` в useEffect, `CLICK` в onClick).

- [ ] **Step 3: Verify build**

Run: `cd "D:/GpT_docs/mpSTATS ACADEMY ADAPTIVE LEARNING/MAAL" && pnpm --filter web build`
Expected: билд успешен (страницы `/dashboard`, `/learn/solutions` компилируются).

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/components/dashboard/EmergencyBanner.tsx" "apps/web/src/components/learning/EmergencyFeaturedCard.tsx"
git commit -m "feat(web): fire impression/click events from emergency banner + pin"
```

---

## Task 4: Отчётный скрипт `scripts/crisis-job-stats.ts`

**Files:**
- Create: `scripts/crisis-job-stats.ts`

**Interfaces:**
- Consumes: `EmergencyBlockEventDay` (Task 1), `LessonProgress` (существует).

- [ ] **Step 1: Написать скрипт**

```typescript
// scripts/crisis-job-stats.ts
/**
 * Срез по ЧП-джобе wb-warehouse-crisis-2026: воронка показ→клик→CTR (по поверхностям)
 * + открыл→досмотрел (LessonProgress, не-test). Запуск по запросу.
 * NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/crisis-job-stats.ts
 */
import { PrismaClient } from '@prisma/client';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();
const LESSONS: Record<string, string> = {
  '04_workshops_w12_jul26_crisis_001': 'Вебинар',
  '04_workshops_text_d1db18c6-7275-4e16-ab16-8ca58117cd50': 'Текст: ущерб',
  '04_workshops_text_3bd9fe05-4195-41f8-a507-96fde377ec91': 'Текст: компенсация',
};
const IDS = Object.keys(LESSONS);

async function main() {
  // Показы/клики по поверхностям
  const events = await prisma.emergencyBlockEventDay.groupBy({
    by: ['surface', 'kind'], _sum: { count: true },
  });
  const val = (s: string, k: string) => events.find((e) => e.surface === s && e.kind === k)?._sum.count ?? 0;
  console.log('\n=== ЧП-блок: показы → клики → CTR ===');
  for (const s of ['BANNER', 'PIN'] as const) {
    const imp = val(s, 'IMPRESSION'); const clk = val(s, 'CLICK');
    const ctr = imp ? `${Math.round((clk / imp) * 1000) / 10}%` : '—';
    console.log(`  ${s.padEnd(7)} показов: ${imp} · кликов: ${clk} · CTR: ${ctr}`);
  }

  // Открыл → досмотрел (не-test)
  const progress = await prisma.lessonProgress.findMany({
    where: { lessonId: { in: IDS } },
    select: { lessonId: true, status: true, watchedPercent: true, path: { select: { userId: true } } },
  });
  const uids = [...new Set(progress.map((p) => p.path.userId))];
  const tests = new Set((await prisma.userProfile.findMany({ where: { id: { in: uids }, isTest: true }, select: { id: true } })).map((u) => u.id));
  const real = progress.filter((p) => !tests.has(p.path.userId));
  console.log('\n=== Уроки джобы: открыл → досмотрел (не-test) ===');
  for (const id of IDS) {
    const rows = real.filter((r) => r.lessonId === id);
    const opened = rows.filter((r) => r.status !== 'NOT_STARTED');
    const done = rows.filter((r) => r.status === 'COMPLETED').length;
    const avg = opened.length ? Math.round(opened.reduce((s, r) => s + r.watchedPercent, 0) / opened.length) : 0;
    console.log(`  ${LESSONS[id].padEnd(20)} открыли: ${opened.length} · досмотрели: ${done} · ср: ${avg}%`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Smoke-run (таблица пустая — нули, но не падает)**

Run: `NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/crisis-job-stats.ts`
Expected: печатает секции; показы/клики = 0 (событий ещё нет), прогресс — текущие цифры.

- [ ] **Step 3: Commit**

```bash
git add scripts/crisis-job-stats.ts
git commit -m "chore(scripts): on-demand emergency block funnel report"
```

---

## Task 5: Раскатка (staging → prod + флаг трекинга)

**Files:** нет (ops).

- [ ] **Step 1: Полная проверка**

Run:
```bash
cd "D:/GpT_docs/mpSTATS ACADEMY ADAPTIVE LEARNING/MAAL"
pnpm --filter @mpstats/api test
pnpm typecheck
pnpm --filter web build
```
Expected: зелёно.

- [ ] **Step 2: Push + staging deploy**

Добавить в `docker-compose.staging.yml` (рядом с `EMERGENCY_BANNER_ENABLED`): `EMERGENCY_TRACK_ENABLED: "true"` — коммит в ветку. Push. Затем vps-ops-manager: checkout ветки на сервере, `docker compose -p maal-staging -f docker-compose.staging.yml build --no-cache web && up -d web`. Проверить: клик/показ на staging пишет в `EmergencyBlockEventDay` (запустить `crisis-job-stats.ts` — но помни: staging И прод пишут в одну БД, так что на staging трекинг ВКЛючён и будет мешать чистоте прод-цифр).

  > ⚠️ Уточнение по staging: т.к. БД общая, staging с `EMERGENCY_TRACK_ENABLED=true` завышает боевой счётчик. Для чистоты — либо не включать трекинг на staging (проверить только сборку/отсутствие ошибок), либо принять шум. Рекомендую: на staging трекинг НЕ включать (оставить var off), проверить лишь что клиент не падает; включить только на проде. Решение — с owner на шаге деплоя.

- [ ] **Step 3: `git checkout master` на сервере, merge, prod deploy**

Merge ветки в master, prod redeploy (`build --no-cache web && up -d web`). Затем выставить на проде `EMERGENCY_TRACK_ENABLED=true` в `.env.production` + `docker compose up -d web`.

- [ ] **Step 4: Verify на проде**

Открыть `/dashboard` и `/learn/solutions` (WB) под обычным аккаунтом (импрешены), кликнуть; затем `npx tsx scripts/crisis-job-stats.ts` → показы/клики > 0.

---

## Self-Review

- **Spec §Хранилище:** Task 1. ✅ Аддитивная миграция через Mgmt API, `prisma migrate/push` не используется.
- **Spec §Запись (мутация, env-gate, zod, upsert):** Task 2. ✅
- **Spec §Запись (компоненты, impression+click, double-fire guard):** Task 3. ✅
- **Spec §Отчёт (вариант A, скрипт):** Task 4. ✅
- **Spec §Раскатка + гард staging:** Task 5 (с уточнением про общую БД — трекинг на staging не включать). ✅
- Типы согласованы: `recordEmergencyEvent({surface,kind})` из Task 2 зовётся идентично в Task 3; ключ `surface_kind_day` из PK Task 1 используется в Task 2.
- Плейсхолдеров нет; код полный.
