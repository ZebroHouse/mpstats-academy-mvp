# Тумблер «партнёрский трафик» в аналитике — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить в админ-аналитику тумблер, исключающий партнёрский трафик (регистрации на бесплатный курс инструментов MPSTATS) из воронки и реестра клиентов, чтобы не раздувать верх воронки и не занижать trial→paid.

**Architecture:** Зеркалим durable-метку `auth.users.raw_user_meta_data->>'partner_source'='mpstats'` в аддитивную колонку `UserProfile.isPartnerEntry Boolean @default(false)` (по образцу `isTest`). Партнёр-вход её проставляет. Аналитические процедуры получают опциональный `includePartner` (default false); когда false — к DB-запросам добавляется `isPartnerEntry: false` через общий unit-тестируемый хелпер `partnerFilter`. UI — общий чип-тумблер, локальный state на каждой из трёх страниц (воронка / продуктовая воронка / клиенты), общего провайдера нет.

**Tech Stack:** Next.js 14 (App Router, client components), tRPC, Prisma (Postgres/Supabase), Zod, Vitest. Миграция — аддитивным tsx через Supabase Management API.

**Охват (решено owner'ом 2026-07-28):** тумблер режет ТОЛЬКО процедуры, где уже есть `isTest`-фильтр: `getConversionFunnel`, `getTrialConversion`, `getProductFunnel` (DB-шаги), `getClientRegistry` + CSV. DAU/WAU/MAU (`getActiveUserStats`) и счётчики «Обзора» (`getAnalytics`) **НЕ трогаем** — там сырой SQL по `UserActivityDay`, тесты там тоже не режутся, партнёрский фильтр был бы асимметрией.

## Global Constraints

- Миграция — ТОЛЬКО аддитивным tsx через Mgmt API (localhost смотрит в прод-Supabase). `prisma migrate` / `db push` — НИКОГДА. Порядок: миграция → `pnpm db:generate` → код. Токен: `.secrets/supabase-mgmt-token.md`. Project ref: `saecuecevicwjkpmaoot`.
- Локальные Supabase-скрипты: `NODE_OPTIONS=--dns-result-order=ipv4first npx tsx <script>`.
- Перед сдачей — `pnpm --filter web build` (не только `pnpm typecheck`): ловит server-only-в-client.
- Колонка — `BOOLEAN NOT NULL DEFAULT false` (зеркалит Prisma `Boolean @default(false)`, non-null как у `isTest`).
- Семантика тумблера: `includePartner` default **false** = партнёрский трафик НЕ учитывается (добавляется `isPartnerEntry: false`). `true` = учитываются все (фильтр не добавляется).
- Не трогать ветку `feature/emergency-warehouse-crisis-block` (параллельная работа).
- «cancel anytime» / отмена — запрещено вне FAQ (к этой задаче не относится, но правило действует).

---

### Task 1: Аддитивная миграция — колонка `isPartnerEntry` + бэкфилл (Mgmt API tsx)

**Files:**
- Create: `scripts/migrate-add-partner-entry.ts`

**Interfaces:**
- Produces: колонка `"UserProfile"."isPartnerEntry" BOOLEAN NOT NULL DEFAULT false` в прод-Supabase, партнёрские строки проставлены в `true`.

Зеркалит существующий шаблон `scripts/migrate-emergency-block-event-day.ts` (Mgmt API, forward-only, идемпотентно). Скрипт печатает dry-run count (сколько партнёрских в `auth.users`) ДО апдейта и count проставленных ПОСЛЕ — для сверки с ожидаемым ~232.

- [ ] **Step 1: Написать скрипт миграции**

Create `scripts/migrate-add-partner-entry.ts`:

```typescript
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
```

- [ ] **Step 2: Запустить миграцию**

Run: `NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/migrate-add-partner-entry.ts`
Expected: печатает `column added`, `partner users in auth.users: [...n:~232...]`, `backfill applied`, `isPartnerEntry=true: [...n:~232...]`. Dry-run count и after count должны совпасть (~232 на момент написания — сверить с фактом, точное число не критично).

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-add-partner-entry.ts
git commit -m "feat(db): add UserProfile.isPartnerEntry column + backfill partner users

Зеркалит durable-метку auth.users.raw_user_meta_data->>'partner_source'='mpstats'
в BOOLEAN-колонку, чтобы аналитика (Prisma по UserProfile) могла фильтровать
партнёрский трафик одной строкой рядом с isTest. Аддитивно через Mgmt API."
```

---

### Task 2: Задекларировать колонку в schema.prisma + regenerate

**Files:**
- Modify: `packages/db/prisma/schema.prisma:33` (модель `UserProfile`, после `isTest`)

**Interfaces:**
- Produces: поле `isPartnerEntry` в сгенерированном Prisma-клиенте — без него `where: { isPartnerEntry: false }` в задачах 5–7 не типизируется.

- [ ] **Step 1: Добавить поле в модель UserProfile**

В `packages/db/prisma/schema.prisma` сразу после строки `isTest`:

```prisma
  isTest                  Boolean   @default(false) // Phase 63: excludes user from revenue/funnel analytics
  isPartnerEntry          Boolean   @default(false) // 2026-07: partner-course arrivals (mirrors auth.users partner_source); analytics toggle excludes them
```

- [ ] **Step 2: Перегенерировать Prisma-клиент**

Run: `pnpm db:generate`
Expected: `Generated Prisma Client` без ошибок.

- [ ] **Step 3: Проверить типизацию**

Run: `pnpm typecheck`
Expected: PASS (код ещё не использует поле — просто убеждаемся, что схема валидна и клиент собрался).

- [ ] **Step 4: Commit**

```bash
git add packages/db/prisma/schema.prisma
git commit -m "feat(db): declare UserProfile.isPartnerEntry in prisma schema

Колонка уже создана в проде (Task 1); объявляем в schema.prisma, чтобы
сгенерированный клиент типизировал where-фильтры аналитики."
```

---

### Task 3: Проставлять `isPartnerEntry: true` при партнёрском входе

**Files:**
- Modify: `apps/web/src/app/api/partner/mpstats/enter/route.ts:138-144` (`upsertPartnerProfile`)

**Interfaces:**
- Consumes: поле `isPartnerEntry` из Task 2.

`upsertPartnerProfile` вызывается во всех трёх ветках partner-entry (trusted / untrusted-existing вызывает не его, а magic-link; но create-ветки — да). Проставляем `true` и в `create`, и в `update` — чтобы существующий юзер, впервые пришедший партнёрским входом, тоже пометился.

- [ ] **Step 1: Добавить флаг в create и update**

Заменить тело `upsertPartnerProfile`:

```typescript
async function upsertPartnerProfile(userId: string, name: string | undefined, phone: string | undefined): Promise<void> {
  await prisma.userProfile.upsert({
    where: { id: userId },
    update: { isPartnerEntry: true, ...(phone ? { phone } : {}) },
    create: { id: userId, name: name ?? null, phone: phone ?? null, isPartnerEntry: true },
  }).catch((e) => Sentry.captureException(e, { tags: { area: 'partner-entry', stage: 'profile-upsert' } }));
}
```

- [ ] **Step 2: Проверить типизацию**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/partner/mpstats/enter/route.ts
git commit -m "feat(partner): flag UserProfile.isPartnerEntry on partner entry

Каждый партнёрский вход помечает профиль, чтобы аналитический тумблер
исключал этих юзеров без обращения к auth.users."
```

---

### Task 4: Общий хелпер `partnerFilter` + unit-тест (TDD-якорь)

**Files:**
- Create: `packages/api/src/utils/analytics-filters.ts`
- Test: `packages/api/src/utils/analytics-filters.test.ts`

**Interfaces:**
- Produces: `partnerFilter(includePartner: boolean): { isPartnerEntry: false } | Record<string, never>` — спредуемый фрагмент для Prisma `where`. Импортируется в Task 5–7.

Единая точка правды семантики тумблера: `false → { isPartnerEntry: false }`, `true → {}`. Это единственный unit-тестируемый кусок; процедуры ниже — тонкие Prisma-where поверх него, проверяются build'ом + сверкой SQL на staging.

- [ ] **Step 1: Написать падающий тест**

Create `packages/api/src/utils/analytics-filters.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { partnerFilter } from './analytics-filters';

describe('partnerFilter', () => {
  it('excludes partner entries when includePartner is false', () => {
    expect(partnerFilter(false)).toEqual({ isPartnerEntry: false });
  });

  it('adds no filter when includePartner is true', () => {
    expect(partnerFilter(true)).toEqual({});
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `pnpm --filter @mpstats/api test -- analytics-filters`
Expected: FAIL — `Cannot find module './analytics-filters'`.

- [ ] **Step 3: Реализовать хелпер**

Create `packages/api/src/utils/analytics-filters.ts`:

```typescript
/**
 * Фрагмент Prisma-where для тумблера «партнёрский трафик» в админ-аналитике.
 * includePartner=false (дефолт) → исключить партнёрские регистрации (курс инструментов
 * MPSTATS): вернуть { isPartnerEntry: false } для спреда рядом с isTest: false.
 * includePartner=true → учитывать всех: пустой фрагмент.
 * Спредить в top-level where (UserProfile-запросы) либо под `user:` (relation-запросы).
 */
export function partnerFilter(includePartner: boolean): { isPartnerEntry: false } | Record<string, never> {
  return includePartner ? {} : { isPartnerEntry: false };
}
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `pnpm --filter @mpstats/api test -- analytics-filters`
Expected: PASS (2 теста).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/utils/analytics-filters.ts packages/api/src/utils/analytics-filters.test.ts
git commit -m "feat(analytics): add partnerFilter where-fragment helper

Единая семантика тумблера партнёрского трафика для всех аналитических
процедур: includePartner=false → { isPartnerEntry: false }, true → {}."
```

---

### Task 5: Применить фильтр в `getConversionFunnel` + `getTrialConversion`

**Files:**
- Modify: `packages/api/src/routers/admin-analytics.ts:449-493` (`getConversionFunnel`), `:496-549` (`getTrialConversion`)

**Interfaces:**
- Consumes: `partnerFilter` из Task 4.
- Produces: обе процедуры принимают `includePartner: z.boolean().default(false)`.

- [ ] **Step 1: Импортировать хелпер**

В шапке `packages/api/src/routers/admin-analytics.ts` рядом с прочими локальными импортами добавить:

```typescript
import { partnerFilter } from '../utils/analytics-filters';
```

- [ ] **Step 2: `getConversionFunnel` — расширить input и where**

Заменить `.input(...)` (строки 450–454) на:

```typescript
    .input(z.object({
      days: z.number().int().min(1).max(90).default(30),
      from: z.date().optional(),
      to: z.date().optional(),
      includePartner: z.boolean().default(false),
    }))
```

Заменить запрос `registered` (строки 463–466) на:

```typescript
        const registered = await ctx.prisma.userProfile.findMany({
          where: { createdAt: { gte: from, lte: to }, isTest: false, ...partnerFilter(input.includePartner) },
          select: { id: true },
        });
```

(шаги диагностики и оплат считаются по `ids` из `registered` — партнёрские уже отсечены транзитивно, отдельно их не фильтруем.)

- [ ] **Step 3: `getTrialConversion` — расширить input и where обоих запросов**

Заменить `.input(...)` (строки 497–501) на:

```typescript
    .input(z.object({
      days: z.number().int().min(1).max(90).default(90),
      from: z.date().optional(),
      to: z.date().optional(),
      includePartner: z.boolean().default(false),
    }))
```

Заменить where запроса `trials` (строка 511) на:

```typescript
          where: { status: 'TRIAL', currentPeriodStart: { gte: from, lte: to }, user: partnerFilter(input.includePartner) },
```

Заменить where запроса `payments` (строка 522) на:

```typescript
          where: { status: 'COMPLETED', subscription: { user: partnerFilter(input.includePartner) } },
```

(`user: {}` при `includePartner=true` — безвредный фильтр по обязательной relation; фильтр по `isTest` по-прежнему делает `deriveTrialConversion` через selected-поля, его не трогаем.)

- [ ] **Step 4: Проверить типизацию**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/admin-analytics.ts
git commit -m "feat(analytics): partner toggle in getConversionFunnel + getTrialConversion

includePartner (default false) исключает партнёрские регистрации/триалы
из старого таба «Воронка»."
```

---

### Task 6: Применить фильтр в `getProductFunnel` (DB-шаги)

**Files:**
- Modify: `packages/api/src/routers/admin-analytics-funnel.ts:189-240` (`getProductFunnel`)

**Interfaces:**
- Consumes: `partnerFilter` из Task 4.
- Produces: `getProductFunnel` принимает `includePartner`. Шаги из Метрики (визиты/цели) НЕ меняются — только DB-шаги (триал/оплата).

- [ ] **Step 1: Импортировать хелпер**

В шапке `packages/api/src/routers/admin-analytics-funnel.ts` рядом с `import { buildFunnel, ... }` добавить:

```typescript
import { partnerFilter } from '../utils/analytics-filters';
```

- [ ] **Step 2: Дать процедуре собственный input (не трогая общий rangeInput)**

`rangeInput` используется ещё и в `getTrafficOverview` (Метрика, без DB-фильтра) — расширять его нельзя. Заменить `.input(rangeInput)` у `getProductFunnel` (строка 189) на:

```typescript
  getProductFunnel: adminProcedure.input(rangeInput.extend({ includePartner: z.boolean().default(false) })).query(async ({ ctx, input }) => {
```

- [ ] **Step 3: Добавить фильтр в оба DB-запроса**

Заменить where запроса `trialRows` (строки 208–213) на:

```typescript
        where: {
          status: 'TRIAL',
          currentPeriodStart: { gte: eff.from, lte: eff.to },
          user: { isTest: false, ...partnerFilter(input.includePartner) },
          plan: { hidden: false },
        },
```

Заменить where запроса `paidRows` (строки 222–226) на:

```typescript
        where: {
          status: 'COMPLETED',
          paidAt: { gte: eff.from, lte: eff.to },
          subscription: { user: { isTest: false, ...partnerFilter(input.includePartner) }, plan: { hidden: false } },
        },
```

- [ ] **Step 4: Проверить типизацию**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/admin-analytics-funnel.ts
git commit -m "feat(analytics): partner toggle in getProductFunnel DB steps

includePartner исключает партнёрские триалы/оплаты из шагов «Триал» и
«Оплата». Шаги из Метрики не меняются — партнёрский вход минует клиентскую
регистрацию, где стреляют цели Метрики."
```

---

### Task 7: Применить фильтр в реестре клиентов (`fetchClientRegistry` + процедура + CSV)

**Files:**
- Modify: `packages/api/src/services/sales-registry.ts:11-21,26-59` (`RegistryRange` + `fetchClientRegistry`)
- Modify: `packages/api/src/routers/admin-analytics.ts:723-744` (`getClientRegistry`)
- Modify: `apps/web/src/app/api/admin/client-registry/route.ts` (CSV export)

**Interfaces:**
- Consumes: `partnerFilter` из Task 4.
- Produces: `RegistryRange.includePartner?: boolean`; `getClientRegistry` и CSV-роут принимают `includePartner`.

- [ ] **Step 1: Расширить `RegistryRange` и оба ветвления `fetchClientRegistry`**

В `packages/api/src/services/sales-registry.ts` добавить импорт хелпера в шапку:

```typescript
import { partnerFilter } from '../utils/analytics-filters';
```

В интерфейс `RegistryRange` (после `dateField`) добавить:

```typescript
  /** false (дефолт) — исключить партнёрские регистрации (курс инструментов MPSTATS). */
  includePartner?: boolean;
```

В ветке `dateField === 'payment'`: заменить where запроса `payments` и `userProfile.findMany` так, чтобы партнёрский фильтр применился в обоих. Заменить блок (строки 35–51) на:

```typescript
    const payments = await prisma.payment.findMany({
      where: {
        status: 'COMPLETED',
        paidAt: { gte: range.from, lte: range.to },
        subscription: { user: { isTest: false, ...partnerFilter(range.includePartner ?? false) } },
      },
      select: { subscription: { select: { userId: true } } },
    });
    const payerIds = [...new Set(payments.map((p) => p.subscription.userId))];
    profiles = payerIds.length
      ? await prisma.userProfile.findMany({
          where: { id: { in: payerIds }, isTest: false, ...partnerFilter(range.includePartner ?? false) },
          select: { id: true, name: true, phone: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: MAX_REGISTRY_ROWS,
        })
      : [];
```

В ветке `else` (регистрация): заменить where (строка 54) на:

```typescript
      where: { createdAt: { gte: range.from, lte: range.to }, isTest: false, ...partnerFilter(range.includePartner ?? false) },
```

- [ ] **Step 2: Прокинуть `includePartner` в `getClientRegistry`**

В `packages/api/src/routers/admin-analytics.ts` заменить `.input(...)` процедуры `getClientRegistry` (строки 724–730) на:

```typescript
    .input(
      z.object({
        from: z.date().optional(),
        to: z.date().optional(),
        dateField: z.enum(['registration', 'payment']).optional(),
        includePartner: z.boolean().default(false),
      }),
    )
```

Заменить вызов `fetchClientRegistry` (строка 739) на:

```typescript
        const rows = await fetchClientRegistry(ctx.prisma, { from, to, dateField: input.dateField, includePartner: input.includePartner });
```

- [ ] **Step 3: Прокинуть `includePartner` в CSV-роут**

В `apps/web/src/app/api/admin/client-registry/route.ts` после парсинга `dateField` добавить:

```typescript
    const includePartner = searchParams.get('includePartner') === 'true';
```

и заменить вызов `fetchClientRegistry` на:

```typescript
    const rows = await fetchClientRegistry(prisma, { from, to, dateField, includePartner });
```

- [ ] **Step 4: Проверить типизацию**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/sales-registry.ts packages/api/src/routers/admin-analytics.ts apps/web/src/app/api/admin/client-registry/route.ts
git commit -m "feat(analytics): partner toggle in client registry + CSV export

includePartner исключает партнёрские регистрации/оплаты из реестра клиентов
и его CSV-выгрузки (данные идентичны экранной таблице)."
```

---

### Task 8: Общий UI-компонент `PartnerTrafficToggle`

**Files:**
- Create: `apps/web/src/components/admin/PartnerTrafficToggle.tsx`

**Interfaces:**
- Produces: `<PartnerTrafficToggle value={boolean} onChange={(next: boolean) => void} />`. `value` = `includePartner`. Используется в Task 9–11.

Стиль — чип-группа как `dateField`-переключатель в `clients/page.tsx:51-63` (единый визуальный язык с `AnalyticsDateRange`).

- [ ] **Step 1: Создать компонент**

Create `apps/web/src/components/admin/PartnerTrafficToggle.tsx`:

```tsx
'use client';

import { cn } from '@/lib/utils';

interface PartnerTrafficToggleProps {
  /** true = учитывать партнёрский трафик (includePartner). */
  value: boolean;
  onChange: (next: boolean) => void;
}

/**
 * Чип-переключатель «Партнёрский трафик: не учитывать / учитывать» для строки
 * фильтров админ-аналитики. По умолчанию выключен (не учитывать) — метрики
 * показывают органику, а не бесплатный курс инструментов MPSTATS.
 */
export function PartnerTrafficToggle({ value, onChange }: PartnerTrafficToggleProps) {
  return (
    <div>
      <label className="text-xs text-mp-gray-500 block mb-1">Партнёрский трафик</label>
      <div className="flex items-center gap-1 bg-mp-gray-100 rounded-lg p-1">
        {([[false, 'Не учитывать'], [true, 'Учитывать']] as const).map(([val, label]) => (
          <button
            key={String(val)}
            type="button"
            onClick={() => onChange(val)}
            className={cn(
              'px-3 py-1 text-body-sm font-medium rounded-md transition-all duration-200',
              value === val ? 'bg-white text-mp-blue-600 shadow-sm' : 'text-mp-gray-600 hover:text-mp-gray-900',
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Проверить сборку компонента**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/admin/PartnerTrafficToggle.tsx
git commit -m "feat(analytics): add PartnerTrafficToggle chip control

Общий чип-переключатель партнёрского трафика для строки фильтров аналитики,
единый визуальный язык с AnalyticsDateRange."
```

---

### Task 9: Встроить тумблер в страницу «Воронка»

**Files:**
- Modify: `apps/web/src/app/(admin)/admin/analytics/funnel/page.tsx`

**Interfaces:**
- Consumes: `PartnerTrafficToggle` (Task 8); `includePartner` в `getConversionFunnel`/`getTrialConversion` (Task 5).

- [ ] **Step 1: Добавить state, тумблер и прокинуть параметр**

В `funnel/page.tsx`:

Добавить импорт после строки 6:

```tsx
import { PartnerTrafficToggle } from '@/components/admin/PartnerTrafficToggle';
```

После `const [range, setRange] = useState(presetRange(30));` (строка 14) добавить:

```tsx
  const [includePartner, setIncludePartner] = useState(false);
```

Заменить строки запросов воронки и триала (16–17) на:

```tsx
  const funnel = trpc.admin.analytics.getConversionFunnel.useQuery({ from, to, includePartner });
  const trial = trpc.admin.analytics.getTrialConversion.useQuery({ from, to, includePartner });
```

Заменить строку `<AnalyticsDateRange value={range} onChange={setRange} />` (33) на:

```tsx
        <div className="flex items-end gap-3 flex-wrap">
          <PartnerTrafficToggle value={includePartner} onChange={setIncludePartner} />
          <AnalyticsDateRange value={range} onChange={setRange} />
        </div>
```

Обновить подпись под заголовком (строка 31) на:

```tsx
          <p className="text-body-sm text-mp-gray-500 mt-1">Конверсия, trial→paid, отток, источники (без тестовых{includePartner ? '' : ', без партнёрских'})</p>
```

- [ ] **Step 2: Проверить типизацию**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(admin)/admin/analytics/funnel/page.tsx"
git commit -m "feat(analytics): wire partner toggle into funnel page"
```

---

### Task 10: Встроить тумблер в страницу «Продуктовая воронка»

**Files:**
- Modify: `apps/web/src/app/(admin)/admin/analytics/product-funnel/page.tsx`

**Interfaces:**
- Consumes: `PartnerTrafficToggle` (Task 8); `includePartner` в `getProductFunnel` (Task 6).

- [ ] **Step 1: Добавить state, тумблер, параметр и поясняющую сноску**

В `product-funnel/page.tsx`:

Добавить импорт после строки 13 (`import { Skeleton } ...`):

```tsx
import { PartnerTrafficToggle } from '@/components/admin/PartnerTrafficToggle';
```

После `const [range, setRange] = useState(presetRange(30));` (строка 119) добавить:

```tsx
  const [includePartner, setIncludePartner] = useState(false);
```

Заменить строку запроса воронки (123) на:

```tsx
  const funnel = trpc.admin.analytics.productFunnel.getProductFunnel.useQuery({ from, to, includePartner });
```

(`getTrafficOverview` НЕ меняем — Метрика тумблером не управляется.)

Заменить `<AnalyticsDateRange value={range} onChange={setRange} />` (141) на:

```tsx
        <div className="flex items-end gap-3 flex-wrap">
          <PartnerTrafficToggle value={includePartner} onChange={setIncludePartner} />
          <AnalyticsDateRange value={range} onChange={setRange} />
        </div>
```

В блок пояснительных сносок под таблицей воронки (после `<Note>` про «Источник», строка 321–325) добавить ещё одну `<Note>`:

```tsx
          <Note>
            Тумблер «Партнёрский трафик» меняет только шаги из базы — «Триал» и «Оплата».
            Шаги из Метрики (визиты, регистрация) он не трогает: партнёрский вход создаёт
            пользователя на сервере, минуя страницу регистрации, где считаются цели Метрики.
          </Note>
```

- [ ] **Step 2: Проверить типизацию**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(admin)/admin/analytics/product-funnel/page.tsx"
git commit -m "feat(analytics): wire partner toggle into product-funnel page

Тумблер режет только DB-шаги (триал/оплата); подписано сноской, что шаги
Метрики он не меняет."
```

---

### Task 11: Встроить тумблер в страницу «Клиенты» (+ CSV)

**Files:**
- Modify: `apps/web/src/app/(admin)/admin/analytics/clients/page.tsx`

**Interfaces:**
- Consumes: `PartnerTrafficToggle` (Task 8); `includePartner` в `getClientRegistry` + CSV-роуте (Task 7).

- [ ] **Step 1: Добавить state, тумблер, параметр в query и в csvHref**

В `clients/page.tsx`:

Добавить импорт после строки 5:

```tsx
import { PartnerTrafficToggle } from '@/components/admin/PartnerTrafficToggle';
```

После `const [dateField, setDateField] = useState<...>('registration');` (строка 30) добавить:

```tsx
  const [includePartner, setIncludePartner] = useState(false);
```

Заменить строку запроса реестра (35) на:

```tsx
  const q = trpc.admin.analytics.getClientRegistry.useQuery({ ...bounds, dateField, includePartner });
```

Заменить строку `csvHref` (38) на:

```tsx
  const csvHref = `/api/admin/client-registry?from=${encodeURIComponent(bounds.from.toISOString())}&to=${encodeURIComponent(bounds.to.toISOString())}&dateField=${dateField}&includePartner=${includePartner}`;
```

В строке фильтров, перед `<AnalyticsDateRange ... />` (строка 64), добавить тумблер:

```tsx
          <PartnerTrafficToggle value={includePartner} onChange={setIncludePartner} />
          <AnalyticsDateRange value={range} onChange={setRange} />
```

- [ ] **Step 2: Проверить типизацию**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(admin)/admin/analytics/clients/page.tsx"
git commit -m "feat(analytics): wire partner toggle into clients page + CSV"
```

---

### Task 12: Финальная верификация (build + unit + сверка на staging)

**Files:** —

- [ ] **Step 1: Полный typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 2: Unit-тесты**

Run: `pnpm test`
Expected: PASS, включая новые `analytics-filters` тесты; прежние 0 failures.

- [ ] **Step 3: Прод-сборка web (обязательно, ловит server-only-в-client)**

Run: `pnpm --filter web build`
Expected: build успешен.

- [ ] **Step 4: Сверка чисел (после деплоя на staging)**

Ручная проверка на staging (basic auth `team`), за период 1–23 июля:
- Воронка, тумблер «Не учитывать» → «Регистрации» ≈ 228 (органика).
- Тумблер «Учитывать» → «Регистрации» ≈ 460 (всего).
- Разница ≈ 232 = число партнёрских (сверить с `SELECT count(*) FROM auth.users WHERE raw_user_meta_data->>'partner_source'='mpstats'`).
- Новый партнёрский вход (или существующий партнёр) → `isPartnerEntry=true` в `UserProfile`.

(Точные числа — гипотеза на момент написания; критично, что ON−OFF = числу партнёрских и OFF < ON.)

- [ ] **Step 5: Финальный commit (если остались несклеенные изменения)**

Обычно всё уже закоммичено по задачам. Если нет:

```bash
git add -A && git commit -m "chore(analytics): finalize partner traffic toggle"
```

---

## Self-Review

**Spec coverage:**
- §19–25 (зеркальная колонка + миграция + бэкфилл + проставление в partner-entry) → Tasks 1, 2, 3. ✅
- §29–33 (тумблер в UI, локальный state, default OFF) → Tasks 8–11. ✅
- §36–41 (фильтр в процедурах; нюанс «Метрика-шаги не меняются») → Tasks 5, 6 (+ сноска в Task 10), 7. ✅
- §39 упоминает `getActiveUserStats` — **сознательно исключён** решением owner'а (охват «воронка+клиенты»); зафиксировано в шапке плана. ✅
- §43 «выручку не трогаем» → `getRevenueOverview`/`getAttribution`/`getActualRevenue` не в списке задач. ✅
- §49–51 (открытый вопрос охвата) → решён owner'ом: «Воронка + клиенты». ✅
- §53–58 (проверка) → Task 12. ✅

**Placeholder scan:** нет TBD/«add error handling»/«similar to Task N» — весь код приведён дословно. ✅

**Type consistency:** `partnerFilter(includePartner: boolean)` определён в Task 4, потреблён с тем же именем/сигнатурой в Tasks 5–7. `PartnerTrafficToggle` prop `value: boolean` + `onChange: (next: boolean) => void` — согласованы между Task 8 и потребителями 9–11. `RegistryRange.includePartner?: boolean` (Task 7) согласован с вызовами. ✅
