# Продуктовая воронка на Яндекс.Метрике — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Новый таб «Продуктовая воронка» в `/admin/analytics`, показывающий верх воронки (трафик из Метрики) и сквозные шаги визит → регистрация → диагностика → урок → тарифы → триал → оплата, где поведение берётся из снапшота Метрики, а деньги и подписки — из БД.

**Architecture:** Крон раз в 6 часов дёргает Reporting API Метрики и складывает подневные значения в новую аддитивную таблицу `MetrikaSnapshot` (идемпотентный upsert). tRPC-процедуры читают только снапшот + БД, к Метрике не ходят. UI — новая страница таба по паттерну таба «AI-запросы» (v1.31).

**Tech Stack:** Next.js 14 App Router (route handler для крона), GitHub Actions (расписание), Prisma + Supabase Postgres, tRPC (`adminProcedure`), React + recharts, Vitest.

---

## Ключевые решения (приняты на основе проверки живого API, отличаются от спеки)

Спека написана до того, как API был прощупан. Ниже — расхождения и почему.

**1. Шаги воронки считаем в `ym:s:goal<id>visits`, а не в `reaches`.**
Проверено на живых данных за 30 дней с фильтром по платформе:

| Шаг | reaches | visits | users |
|---|---|---|---|
| Регистрация | 228 | 198 | 191 |
| Диагностика старт | 111 | 104 | 101 |
| Диагностика финиш | **126** | 106 | 95 |
| Открыл урок | **3899** | 535 | 176 |
| Тарифы | 309 | 225 | 151 |
| Оплата | 12 | 11 | 10 |

На `reaches` воронка ломается: финиш диагностики больше старта, а «открыл урок» даёт 3899 при 3582 визитах всего (это счётчик срабатываний — один человек открывает урок десятки раз). На `visits` порядок корректный. `visits` ещё и **аддитивны по дням**, поэтому сумма подневного снапшота за любой период точно равна прямому запросу в Метрику.

**2. `users` (уники) НЕ аддитивны — для них отдельные строки окна.**
Сумма дневных уников ≠ уникам за период (один человек в пн и вт = 2, а не 1). Поэтому в таблице есть колонка `windowDays`: строки `windowDays=1` — подневные, строки `windowDays=7|14|30|90` — периодные уники, снятые одним запросом за целое окно. UI показывает честные уники только для пресетных периодов, для произвольного диапазона — прочерк с пояснением. Это не оверинжиниринг: цифры из этой админки уходят в отчёты для внешних сторон (был отчёт для Точки), завышенные уники там недопустимы.

**3. Цель «Клик по CTA» (`540626878`) в воронку не входит — она мёртвая.**
За 30 дней 0 срабатываний. Причина найдена: константа `METRIKA_GOALS.CTA_CLICK` объявлена в `apps/web/src/lib/analytics/constants.ts:9`, но `reachGoal` с ней **нигде не вызывается** (грепом по `apps/web/src` — ноль совпадений вне файла констант). В снапшот её пишем (данные копятся, если цель когда-то подключат), в UI не показываем.

**4. Чарты — recharts, не Chart.js.** В спеке §5.4 ошибка: `apps/web` использует `recharts ^2.15.4`, Chart.js в вебе нет вообще.

**5. Крон — раз в 6 часов через GitHub Actions, не раз в час.**
В проекте нет VPS-крона для приложения: все кроны — GitHub Actions (`.github/workflows/*.yml`), и в них зафиксирован известный дрейф расписания 60–100 минут (комментарий в `notifications-cleanup/route.ts:18-19`). Почасовой крон дрейфовал бы на величину собственного интервала. Аналитика не операционная, 4 снятия в сутки достаточно.

**6. Env идут в `.env.production` на VPS, а не в `docker-compose.yml`.**
Сервис `web` подключает `env_file: - .env.production` (`docker-compose.yml:24-25`); в `environment:` лежат только фичефлаги. `YANDEX_METRIKA_*` — рантайм-секреты, правки compose-файла не требуют.

**7. Длинные диапазоны надо резать на куски.**
Проверено: запрос на 30 дней с фильтром проходит, а без фильтра тот же запрос падает с `Query is too complicated. Please reduce the date interval or sampling.` Бэкфилл истории должен идти слайсами по 60 дней, иначе упрётся в тот же лимит.

**8. Шаг «Триал» берём тем же запросом, что и существующий таб.**
`admin-analytics.ts:506-507` — `{ status: 'TRIAL', currentPeriodStart: { gte: from, lte: to } }`. Переиспользуем дословно, иначе новый таб разойдётся с табом «Триал→оплата», а это прямой критерий готовности из спеки §7.

---

## File Structure

**Создаём:**

| Файл | Ответственность |
|---|---|
| `packages/shared/src/metrika.ts` | ID целей, ключи метрик, окна — общие для крона и роутера |
| `apps/web/src/lib/metrika/query.ts` | Чистые функции: сборка query-параметров, нарезка диапазона, парсинг ответа в строки снапшота |
| `apps/web/src/lib/metrika/__tests__/query.test.ts` | Тесты чистых функций |
| `apps/web/src/lib/metrika/client.ts` | Сетевой слой: fetch с таймаутом и ретраем на 429/5xx |
| `apps/web/src/app/api/cron/metrika-snapshot/route.ts` | Крон: тянет Метрику → upsert в `MetrikaSnapshot` |
| `.github/workflows/metrika-snapshot.yml` | Расписание крона |
| `packages/api/src/utils/product-funnel.ts` | Чистая сборка воронки и конверсий из сырых чисел |
| `packages/api/src/utils/product-funnel.test.ts` | Тесты сборки воронки |
| `packages/api/src/routers/admin-analytics-funnel.ts` | tRPC sub-router: `getTrafficOverview`, `getProductFunnel` |
| `apps/web/src/app/(admin)/admin/analytics/product-funnel/page.tsx` | UI таба |

**Меняем:**

| Файл | Что |
|---|---|
| `packages/db/prisma/schema.prisma` | + модель `MetrikaSnapshot` |
| `packages/shared/src/index.ts` | + `export * from './metrika'` |
| `packages/api/src/routers/admin-analytics.ts:43` | + монтирование `funnel:` рядом с `assistant:` |
| `apps/web/src/components/admin/AnalyticsTabs.tsx:7-16` | + строка таба |
| `docs/yandex-metrika-api.md` | + раздел про метрики целей и находки |

---

## Task 1: Таблица снапшота

**Files:**
- Create: `packages/db/prisma/migrations/20260720000000_add_metrika_snapshot/migration.sql`
- Modify: `packages/db/prisma/schema.prisma`

Миграция применяется **через Supabase Management API сырым SQL**, а не `prisma db push`. Правило проекта (`MAAL/CLAUDE.md`, инцидент 2026-05-12): локальный dev смотрит в прод-Supabase, `db push`/`migrate` против неё запрещены. Порядок как в v1.32: файл миграции → SQL через Mgmt API → запись в `_prisma_migrations` → зеркалим в `schema.prisma` → `db:generate`. Таблица новая, операция строго аддитивная.

**Этот таск выполняет контроллер сессии, а не субагент** — DDL против прод-БД с 158 живыми пользователями не делегируется.

- [ ] **Step 1: Создать файл миграции**

`packages/db/prisma/migrations/20260720000000_add_metrika_snapshot/migration.sql`. Форма скопирована с `20260629010000_add_referral_code_click_day` (та же day-bucket таблица без FK):

```sql
-- Подневный снапшот Яндекс.Метрики для продуктовой воронки в админке.
-- Additive; наполняется кроном /api/cron/metrika-snapshot.
-- windowDays=1 — подневные аддитивные метрики; windowDays=7|14|30|90 —
-- дедуплицированные уники за окно (users не суммируются по дням).
CREATE TABLE "MetrikaSnapshot" (
    "metricKey" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "windowDays" INTEGER NOT NULL DEFAULT 1,
    "value" INTEGER NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MetrikaSnapshot_pkey" PRIMARY KEY ("metricKey","day","windowDays")
);

CREATE INDEX "MetrikaSnapshot_day_idx" ON "MetrikaSnapshot"("day");

CREATE INDEX "MetrikaSnapshot_windowDays_day_idx" ON "MetrikaSnapshot"("windowDays","day");
```

- [ ] **Step 2: Применить SQL через Supabase Mgmt API и записать в `_prisma_migrations`**

Процедура — `.claude/memory/reference_supabase_migration_via_mgmt_api.md`. Токен Mgmt API брать оттуда, **в файлы плана и коммиты не переносить**.

Порядок: посчитать sha256 от `migration.sql` → выполнить SQL через `POST /v1/projects/saecuecevicwjkpmaoot/database/query` → вставить строку в `_prisma_migrations` с этим checksum и именем папки `20260720000000_add_metrika_snapshot`, чтобы локальный `prisma migrate status` считал миграцию применённой.

- [ ] **Step 3: Проверить, что таблица создалась**

Через тот же Mgmt API:
```sql
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'MetrikaSnapshot' ORDER BY ordinal_position;
```
Ожидаемо 5 строк: `metricKey text`, `day date`, `windowDays integer`, `value integer`, `fetchedAt timestamp without time zone`.

- [ ] **Step 4: Зеркалить модель в schema.prisma**

Дописать в конец `packages/db/prisma/schema.prisma`, рядом с `UserActivityDay` / `ReferralCodeClickDay` (у них тот же стиль: композитный `@@id`, `@db.Date`, без FK):

```prisma
/// Подневный снапшот Яндекс.Метрики. Крон пишет, tRPC только читает —
/// прямые запросы к Метрике из процедур запрещены (лимит 200 req/5min).
/// windowDays=1 — подневные значения (аддитивны, суммируются за любой период).
/// windowDays=7|14|30|90 — уники за целое окно: users НЕ аддитивны по дням,
/// сумма дневных уников завышает реальное число людей.
/// No FK (mirrors UserActivityDay).
model MetrikaSnapshot {
  metricKey  String
  day        DateTime @db.Date
  windowDays Int      @default(1)
  value      Int
  fetchedAt  DateTime @default(now())

  @@id([metricKey, day, windowDays])
  @@index([day])
  @@index([windowDays, day])
}
```

- [ ] **Step 5: Сгенерировать клиент и проверить типы**

Run: `pnpm db:generate && pnpm typecheck`
Expected: без ошибок; `prisma.metrikaSnapshot` доступен.

- [ ] **Step 6: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/20260720000000_add_metrika_snapshot/
git commit -m "feat(db): add MetrikaSnapshot table for traffic funnel

Крон будет складывать сюда подневные значения Метрики, чтобы tRPC-процедуры
читали снапшот, а не ходили в API (лимит 200 запросов / 5 минут).
windowDays разделяет аддитивные подневные метрики и периодные уники —
users не суммируются по дням без задвоения людей.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Общие константы Метрики

**Files:**
- Create: `packages/shared/src/metrika.ts`
- Modify: `packages/shared/src/index.ts`

Константы нужны и крону (`apps/web`), и роутеру (`packages/api`) — поэтому в `@mpstats/shared`. Пакет — чистый барель констант без side-effect импортов, так что гоча «server-only утёк в клиентский бандл» (см. `@mpstats/ai`) здесь не воспроизводится.

- [ ] **Step 1: Создать файл констант**

```ts
// packages/shared/src/metrika.ts

/** Счётчик стоит на ВЕСЬ домен mpstats.academy. Без этого фильтра цифра
 *  завышена примерно втрое (10 889 против 3 299 визитов за 30 дней). */
export const METRIKA_PLATFORM_FILTER = "ym:s:startURL=*'*platform.mpstats.academy*'";

/** ID целей platform_* в счётчике 94592073. Подтверждены через management API 2026-07-20. */
export const METRIKA_GOAL_IDS = {
  signup: 540626668,
  login: 540626673,
  diagnosticStart: 540626712,
  diagnosticComplete: 540626734,
  lessonOpen: 540626804,
  pricingView: 540626808,
  payment: 540626853,
  /** Цель заведена в Метрике, но reachGoal с ней нигде не вызывается —
   *  0 срабатываний за 30 дней. Пишем в снапшот, в UI не показываем. */
  ctaClick: 540626878,
} as const;

export type MetrikaGoalKey = keyof typeof METRIKA_GOAL_IDS;

/** Трафиковые метрики верхнего уровня. */
export const METRIKA_TRAFFIC_METRICS = ['visits', 'users', 'pageviews'] as const;
export type MetrikaTrafficMetric = (typeof METRIKA_TRAFFIC_METRICS)[number];

/** Окна, для которых крон снимает периодные (дедуплицированные) уники.
 *  Совпадают с пресетами DEFAULT_RANGE_DAYS в AnalyticsDateRange. */
export const METRIKA_UNIQUE_WINDOWS = [7, 14, 30, 90] as const;

/** Ключ строки снапшота для цели. `visits` — аддитивная метрика шага воронки,
 *  `users` — люди (не аддитивны по дням). `reaches` осознанно не храним:
 *  это счётчик срабатываний, он ломает порядок шагов воронки. */
export function goalMetricKey(goal: MetrikaGoalKey, kind: 'visits' | 'users'): string {
  return `goal_${METRIKA_GOAL_IDS[goal]}_${kind}`;
}

/** Метрика Reporting API для цели. */
export function goalApiMetric(goal: MetrikaGoalKey, kind: 'visits' | 'users'): string {
  return `ym:s:goal${METRIKA_GOAL_IDS[goal]}${kind}`;
}

/** Шаги воронки в порядке отображения. ctaClick исключён — цель не стреляет. */
export const FUNNEL_GOAL_STEPS: MetrikaGoalKey[] = [
  'signup',
  'diagnosticStart',
  'diagnosticComplete',
  'lessonOpen',
  'pricingView',
];
```

- [ ] **Step 2: Добавить в барель**

В `packages/shared/src/index.ts` дописать строку после `export * from './courses';`:

```ts
export * from './metrika';
```

- [ ] **Step 3: Проверить типы**

Run: `pnpm typecheck`
Expected: без ошибок.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/metrika.ts packages/shared/src/index.ts
git commit -m "feat(shared): add Metrika goal ids and metric key helpers

Крон и tRPC-роутер должны одинаково называть строки снапшота, иначе запись
и чтение разъедутся молча. Держим ключи в одном месте.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Чистый слой запросов к Метрике (TDD)

**Files:**
- Create: `apps/web/src/lib/metrika/query.ts`
- Test: `apps/web/src/lib/metrika/__tests__/query.test.ts`

Здесь только чистые функции — сборка параметров, нарезка диапазона, парсинг ответа. Сеть в Task 4. Такое разделение делает самую хрупкую часть (парсинг формата Метрики) тестируемой без моков fetch.

Формат ответа `/stat/v1/data/bytime`, снятый с живого API:
```json
{
  "time_intervals": [["2026-07-13","2026-07-13"], ["2026-07-14","2026-07-14"]],
  "totals": [[260, 276], [216, 228]],
  "data": [ { "dimensions": [], "metrics": [[260,276],[216,228]] } ]
}
```
`totals` — массив по метрикам, каждый элемент — массив значений по интервалам, в том же порядке, в котором метрики перечислены в запросе. Парсим `totals`, а не `data`: при пустой выборке `data` может быть `[]`, а форма `totals` стабильна.

- [ ] **Step 1: Написать падающий тест**

```ts
// apps/web/src/lib/metrika/__tests__/query.test.ts
import { describe, expect, it } from 'vitest';
import { buildByTimeParams, parseByTimeResponse, splitRange, toDateKey } from '../query';

describe('toDateKey', () => {
  it('форматирует дату в YYYY-MM-DD по UTC', () => {
    expect(toDateKey(new Date('2026-07-13T22:30:00.000Z'))).toBe('2026-07-13');
  });
});

describe('splitRange', () => {
  it('возвращает один кусок, если диапазон короче лимита', () => {
    expect(splitRange('2026-07-01', '2026-07-10', 60)).toEqual([
      { date1: '2026-07-01', date2: '2026-07-10' },
    ]);
  });

  it('режет длинный диапазон на куски не длиннее лимита', () => {
    // Метрика отвечает "Query is too complicated" на длинных окнах —
    // проверено на 30 днях без фильтра.
    const chunks = splitRange('2026-01-01', '2026-03-01', 30);
    expect(chunks).toEqual([
      { date1: '2026-01-01', date2: '2026-01-30' },
      { date1: '2026-01-31', date2: '2026-03-01' },
    ]);
  });

  it('покрывает диапазон без дыр и без нахлёста', () => {
    const chunks = splitRange('2026-01-01', '2026-04-15', 30);
    expect(chunks[0].date1).toBe('2026-01-01');
    expect(chunks[chunks.length - 1].date2).toBe('2026-04-15');
    for (let i = 1; i < chunks.length; i++) {
      const prevEnd = new Date(chunks[i - 1].date2 + 'T00:00:00.000Z').getTime();
      const nextStart = new Date(chunks[i].date1 + 'T00:00:00.000Z').getTime();
      expect(nextStart - prevEnd).toBe(86_400_000);
    }
  });
});

describe('buildByTimeParams', () => {
  it('всегда ставит фильтр по платформе и группировку по дням', () => {
    const p = buildByTimeParams({
      counterId: '94592073',
      metrics: ['ym:s:visits', 'ym:s:users'],
      date1: '2026-07-01',
      date2: '2026-07-07',
    });
    expect(p.get('ids')).toBe('94592073');
    expect(p.get('metrics')).toBe('ym:s:visits,ym:s:users');
    expect(p.get('group')).toBe('day');
    expect(p.get('filters')).toBe("ym:s:startURL=*'*platform.mpstats.academy*'");
  });
});

describe('parseByTimeResponse', () => {
  const response = {
    time_intervals: [
      ['2026-07-13', '2026-07-13'],
      ['2026-07-14', '2026-07-14'],
    ],
    totals: [
      [260, 276],
      [216, 228],
    ],
  };

  it('раскладывает totals в строки снапшота', () => {
    expect(parseByTimeResponse(response, ['visits', 'users'])).toEqual([
      { metricKey: 'visits', day: '2026-07-13', value: 260 },
      { metricKey: 'visits', day: '2026-07-14', value: 276 },
      { metricKey: 'users', day: '2026-07-13', value: 216 },
      { metricKey: 'users', day: '2026-07-14', value: 228 },
    ]);
  });

  it('округляет дробные значения до целого', () => {
    const r = { time_intervals: [['2026-07-13', '2026-07-13']], totals: [[12.7]] };
    expect(parseByTimeResponse(r, ['visits'])[0].value).toBe(13);
  });

  it('возвращает пустой массив, если Метрика не вернула интервалов', () => {
    expect(parseByTimeResponse({ time_intervals: [], totals: [] }, ['visits'])).toEqual([]);
  });

  it('падает, если число серий не совпало с числом запрошенных ключей', () => {
    // Молчаливое рассогласование записало бы визиты под ключом уников.
    expect(() => parseByTimeResponse(response, ['visits'])).toThrow(/2 серий.*1 ключ/);
  });
});
```

- [ ] **Step 2: Запустить тест, убедиться что падает**

Run: `pnpm --filter web test -- query.test`
Expected: FAIL — `Cannot find module '../query'`

- [ ] **Step 3: Реализовать**

```ts
// apps/web/src/lib/metrika/query.ts
import { METRIKA_PLATFORM_FILTER } from '@mpstats/shared';

export interface RangeChunk {
  date1: string;
  date2: string;
}

export interface SnapshotRow {
  metricKey: string;
  day: string;
  value: number;
}

const DAY_MS = 86_400_000;

export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDateKey(key: string): number {
  return new Date(`${key}T00:00:00.000Z`).getTime();
}

/**
 * Метрика отвечает "Query is too complicated" на длинных окнах с большим
 * числом метрик, поэтому бэкфилл идёт слайсами.
 */
export function splitRange(date1: string, date2: string, maxDays: number): RangeChunk[] {
  const start = parseDateKey(date1);
  const end = parseDateKey(date2);
  const chunks: RangeChunk[] = [];

  for (let cursor = start; cursor <= end; cursor += maxDays * DAY_MS) {
    const chunkEnd = Math.min(cursor + (maxDays - 1) * DAY_MS, end);
    chunks.push({
      date1: toDateKey(new Date(cursor)),
      date2: toDateKey(new Date(chunkEnd)),
    });
  }

  return chunks;
}

export function buildByTimeParams(args: {
  counterId: string;
  metrics: string[];
  date1: string;
  date2: string;
}): URLSearchParams {
  return new URLSearchParams({
    ids: args.counterId,
    metrics: args.metrics.join(','),
    filters: METRIKA_PLATFORM_FILTER,
    date1: args.date1,
    date2: args.date2,
    group: 'day',
  });
}

export function buildTotalsParams(args: {
  counterId: string;
  metrics: string[];
  date1: string;
  date2: string;
}): URLSearchParams {
  return new URLSearchParams({
    ids: args.counterId,
    metrics: args.metrics.join(','),
    filters: METRIKA_PLATFORM_FILTER,
    date1: args.date1,
    date2: args.date2,
  });
}

interface ByTimeResponse {
  time_intervals: string[][];
  totals: number[][];
}

/**
 * `totals` в /bytime — массив по метрикам, внутри значения по интервалам,
 * в порядке запрошенных метрик. Парсим его, а не `data`: при пустой выборке
 * `data` приходит пустым массивом, а форма `totals` стабильна.
 */
export function parseByTimeResponse(response: ByTimeResponse, metricKeys: string[]): SnapshotRow[] {
  const intervals = response.time_intervals ?? [];
  if (intervals.length === 0) return [];

  const totals = response.totals ?? [];
  if (totals.length !== metricKeys.length) {
    throw new Error(
      `Метрика вернула ${totals.length} серий на ${metricKeys.length} ключей — порядок метрик разъехался`,
    );
  }

  const rows: SnapshotRow[] = [];
  totals.forEach((series, metricIndex) => {
    series.forEach((value, intervalIndex) => {
      const interval = intervals[intervalIndex];
      if (!interval) return;
      rows.push({
        metricKey: metricKeys[metricIndex],
        day: interval[0],
        value: Math.round(value ?? 0),
      });
    });
  });

  return rows;
}

interface TotalsResponse {
  totals: number[];
}

/** Ответ /stat/v1/data (без bytime): totals — плоский массив по метрикам. */
export function parseTotalsResponse(response: TotalsResponse, metricKeys: string[]): number[] {
  const totals = response.totals ?? [];
  if (totals.length !== metricKeys.length) {
    throw new Error(
      `Метрика вернула ${totals.length} значений на ${metricKeys.length} ключей — порядок метрик разъехался`,
    );
  }
  return totals.map((v) => Math.round(v ?? 0));
}
```

- [ ] **Step 4: Запустить тест, убедиться что проходит**

Run: `pnpm --filter web test -- query.test`
Expected: PASS.

Тесты на `parseTotalsResponse` и `buildTotalsParams` обязательны наравне с остальными: обе несут живую логику (throw на рассогласовании, округление, критичный фильтр по платформе), и без них половина парс-поверхности осталась бы непокрытой. `splitRange` должна бросать на `maxDays < 1` — иначе `cursor += 0` вешает крон-роут насмерть, без ошибки и без лога.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/metrika/
git commit -m "feat(metrika): add pure query builders and response parser

Формат ответа Метрики — самая хрупкая часть интеграции, поэтому парсинг
вынесен в чистые функции и покрыт тестами без моков сети. Рассогласование
числа серий и ключей падает явно: иначе визиты молча записались бы под
ключом уников.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Сетевой клиент Метрики

**Files:**
- Create: `apps/web/src/lib/metrika/client.ts`

Паттерн взят из `apps/web/src/lib/auth/oauth-providers.ts:31-54` (`fetchWithRetry` — тот самый, что упомянут в CLAUDE.md как лекарство от IPv6-гочи на VPS). Отличие: там ретраятся только сетевые исключения, а Метрика отдаёт 429 при превышении лимита — его тоже надо ретраить.

- [ ] **Step 1: Реализовать клиент**

```ts
// apps/web/src/lib/metrika/client.ts
import 'server-only';

const BY_TIME_URL = 'https://api-metrika.yandex.net/stat/v1/data/bytime';
const TOTALS_URL = 'https://api-metrika.yandex.net/stat/v1/data';
const TIMEOUT_MS = 20_000;
const ATTEMPTS = 3;

export class MetrikaError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'MetrikaError';
  }
}

export interface MetrikaCredentials {
  counterId: string;
  token: string;
}

/** null, если env не проставлены — вызывающий решает, это ошибка или no-op. */
export function metrikaCredentials(): MetrikaCredentials | null {
  const counterId = process.env.YANDEX_METRIKA_COUNTER_ID;
  const token = process.env.YANDEX_METRIKA_OAUTH_TOKEN;
  if (!counterId || !token) return null;
  return { counterId, token };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function requestJson(url: string, params: URLSearchParams, token: string): Promise<unknown> {
  let lastError: unknown;

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(`${url}?${params.toString()}`, {
        headers: { Authorization: `OAuth ${token}` },
        signal: controller.signal,
        cache: 'no-store',
      });

      // 429 — лимит 200 запросов / 5 минут, 5xx — временная беда на их стороне.
      // Оба лечатся ожиданием, остальные 4xx — нет (протухший токен, кривой запрос).
      if (res.status === 429 || res.status >= 500) {
        lastError = new MetrikaError(`Метрика ответила ${res.status}`, res.status);
        await sleep(1000 * (attempt + 1));
        continue;
      }

      if (!res.ok) {
        const body = await res.text();
        throw new MetrikaError(`Метрика ответила ${res.status}: ${body.slice(0, 200)}`, res.status);
      }

      return await res.json();
    } catch (error) {
      if (error instanceof MetrikaError && error.status && error.status < 500 && error.status !== 429) {
        throw error;
      }
      lastError = error;
      await sleep(250 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new MetrikaError('Метрика недоступна после ретраев');
}

export function fetchByTime(params: URLSearchParams, token: string): Promise<unknown> {
  return requestJson(BY_TIME_URL, params, token);
}

export function fetchTotals(params: URLSearchParams, token: string): Promise<unknown> {
  return requestJson(TOTALS_URL, params, token);
}
```

- [ ] **Step 2: Проверить типы**

Run: `pnpm typecheck`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/metrika/client.ts
git commit -m "feat(metrika): add HTTP client with retry on 429 and 5xx

Метрика режет по 200 запросов за 5 минут и отдаёт 429 — его надо переждать,
а не падать. Остальные 4xx (протухший токен, кривой запрос) ретраить
бессмысленно, поэтому они пробрасываются сразу.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Cron-эндпоинт

**Files:**
- Create: `apps/web/src/app/api/cron/metrika-snapshot/route.ts`

Защита — строгий вариант из `notifications-cleanup/route.ts:26-29` (падает closed при отсутствии `CRON_SECRET`, в отличие от слабого варианта в `check-subscriptions`, который при пустом секрете сравнивает с `Bearer undefined`).

- [ ] **Step 1: Реализовать роут**

```ts
// apps/web/src/app/api/cron/metrika-snapshot/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@mpstats/db/client';
import { Prisma } from '@mpstats/db';
import {
  METRIKA_GOAL_IDS,
  METRIKA_TRAFFIC_METRICS,
  METRIKA_UNIQUE_WINDOWS,
  goalApiMetric,
  goalMetricKey,
  type MetrikaGoalKey,
} from '@mpstats/shared';
import { fetchByTime, fetchTotals, metrikaCredentials } from '@/lib/metrika/client';
import {
  buildByTimeParams,
  buildTotalsParams,
  parseByTimeResponse,
  parseTotalsResponse,
  splitRange,
  toDateKey,
  type SnapshotRow,
} from '@/lib/metrika/query';

export const dynamic = 'force-dynamic';

/** Метрика доуточняет вчерашние цифры ещё несколько дней — перезаписываем окно. */
const DEFAULT_WINDOW_DAYS = 8;
const MAX_WINDOW_DAYS = 400;
/** Длинные окна с 16 метриками ловят "Query is too complicated". */
const CHUNK_DAYS = 60;

const GOAL_KEYS = Object.keys(METRIKA_GOAL_IDS) as MetrikaGoalKey[];
/** Батч на один INSERT. Бэкфилл за год — это 19 ключей × 365 дней ≈ 7000 строк;
 *  построчный upsert по удалённой Supabase не уложится в таймаут крона. */
const UPSERT_CHUNK = 500;

interface UpsertRow {
  metricKey: string;
  day: string;
  windowDays: number;
  value: number;
}

/** Идемпотентная запись пачками: повторный прогон крона перезаписывает
 *  значения, а не плодит дубли (первичный ключ — metricKey+day+windowDays). */
async function upsertSnapshotRows(rows: UpsertRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const values = chunk.map(
      (r) => Prisma.sql`(${r.metricKey}, ${r.day}::date, ${r.windowDays}, ${r.value}, NOW())`,
    );
    await prisma.$executeRaw`
      INSERT INTO "MetrikaSnapshot" ("metricKey", "day", "windowDays", "value", "fetchedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("metricKey", "day", "windowDays")
      DO UPDATE SET "value" = EXCLUDED."value", "fetchedAt" = EXCLUDED."fetchedAt"
    `;
  }
}

async function handle(request: Request) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const creds = metrikaCredentials();
  if (!creds) {
    return NextResponse.json(
      { error: 'YANDEX_METRIKA_COUNTER_ID / YANDEX_METRIKA_OAUTH_TOKEN не заданы' },
      { status: 500 },
    );
  }

  const requested = Number(new URL(request.url).searchParams.get('days') ?? DEFAULT_WINDOW_DAYS);
  const windowDays = Math.min(Math.max(Number.isFinite(requested) ? requested : DEFAULT_WINDOW_DAYS, 1), MAX_WINDOW_DAYS);

  const today = new Date();
  const date2 = toDateKey(today);
  const date1 = toDateKey(new Date(today.getTime() - (windowDays - 1) * 86_400_000));

  try {
    const rows: SnapshotRow[] = [];

    // Два запроса вместо одного: лимит Метрики — 20 метрик на запрос,
    // трафик (3) + цели (16) = 19 упирается в потолок вплотную.
    const trafficMetrics = METRIKA_TRAFFIC_METRICS.map((m) => `ym:s:${m}`);
    const trafficKeys = [...METRIKA_TRAFFIC_METRICS];

    const goalMetrics: string[] = [];
    const goalKeys: string[] = [];
    for (const goal of GOAL_KEYS) {
      for (const kind of ['visits', 'users'] as const) {
        goalMetrics.push(goalApiMetric(goal, kind));
        goalKeys.push(goalMetricKey(goal, kind));
      }
    }

    for (const chunk of splitRange(date1, date2, CHUNK_DAYS)) {
      const traffic = await fetchByTime(
        buildByTimeParams({ counterId: creds.counterId, metrics: trafficMetrics, ...chunk }),
        creds.token,
      );
      rows.push(...parseByTimeResponse(traffic as never, trafficKeys));

      const goals = await fetchByTime(
        buildByTimeParams({ counterId: creds.counterId, metrics: goalMetrics, ...chunk }),
        creds.token,
      );
      rows.push(...parseByTimeResponse(goals as never, goalKeys));
    }

    await upsertSnapshotRows(rows.map((r) => ({ ...r, windowDays: 1 })));

    // Периодные уники: users не аддитивны по дням, поэтому для пресетных окон
    // снимаем дедуплицированное значение отдельным запросом за целый период.
    const yesterday = new Date(today.getTime() - 86_400_000);
    const uniqueDayKey = toDateKey(yesterday);
    const periodRows: UpsertRow[] = [];

    for (const period of METRIKA_UNIQUE_WINDOWS) {
      const periodStart = toDateKey(new Date(yesterday.getTime() - (period - 1) * 86_400_000));
      const response = await fetchTotals(
        buildTotalsParams({
          counterId: creds.counterId,
          metrics: ['ym:s:users', 'ym:s:visits'],
          date1: periodStart,
          date2: toDateKey(yesterday),
        }),
        creds.token,
      );
      const [users, visits] = parseTotalsResponse(response as never, ['users', 'visits']);

      periodRows.push(
        { metricKey: 'users', day: uniqueDayKey, windowDays: period, value: users },
        { metricKey: 'visits', day: uniqueDayKey, windowDays: period, value: visits },
      );
    }

    await upsertSnapshotRows(periodRows);

    return NextResponse.json({
      ok: true,
      from: date1,
      to: date2,
      dailyRows: rows.length,
      uniqueRows: periodRows.length,
    });
  } catch (error) {
    // Падение Метрики не должно ронять крон: снапшот остаётся прежним,
    // админка покажет последние успешные данные с отметкой даты.
    const message = error instanceof Error ? error.message : 'unknown';
    console.error('[cron/metrika-snapshot] failed:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
```

- [ ] **Step 2: Проверить типы**

Run: `pnpm typecheck`
Expected: без ошибок.

- [ ] **Step 3: Прогнать крон локально и проверить, что снапшот наполнился**

```bash
pnpm dev
# в другом терминале, CRON_SECRET взять из .env
curl -s -H "Authorization: Bearer $CRON_SECRET" 'http://localhost:3000/api/cron/metrika-snapshot?days=8'
```
Expected: `{"ok":true,"from":"...","to":"...","dailyRows":152,"uniqueRows":8}` (19 ключей × 8 дней = 152).

- [ ] **Step 4: Проверить идемпотентность**

Прогнать ту же команду второй раз, затем посчитать строки:
```bash
node -e "const{prisma}=require('./packages/db/src/client');prisma.metrikaSnapshot.count({where:{windowDays:1}}).then(c=>{console.log('daily rows:',c);return prisma.\$disconnect()})"
```
Expected: то же число, что после первого прогона — повторный запуск не плодит дубли.

- [ ] **Step 5: Сверить с Метрикой вручную**

Сравнить сумму `visits` за 7 дней из снапшота с прямым запросом (критерий готовности §7 спеки):
```bash
node -e "
require('dotenv').config({path:'.env'});
const{prisma}=require('./packages/db/src/client');
const t=process.env.YANDEX_METRIKA_OAUTH_TOKEN,c=process.env.YANDEX_METRIKA_COUNTER_ID;
const d2=new Date(Date.now()-86400000).toISOString().slice(0,10);
const d1=new Date(Date.now()-7*86400000).toISOString().slice(0,10);
prisma.metrikaSnapshot.aggregate({_sum:{value:true},where:{metricKey:'visits',windowDays:1,day:{gte:new Date(d1+'T00:00:00Z'),lte:new Date(d2+'T00:00:00Z')}}}).then(async r=>{
  const p=new URLSearchParams({ids:c,metrics:'ym:s:visits',filters:\"ym:s:startURL=*'*platform.mpstats.academy*'\",date1:d1,date2:d2});
  const j=await fetch('https://api-metrika.yandex.net/stat/v1/data?'+p,{headers:{Authorization:'OAuth '+t}}).then(x=>x.json());
  console.log('snapshot:',r._sum.value,' metrika:',j.totals[0]);
  await prisma.\$disconnect();
});"
```
Expected: числа совпадают.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/cron/metrika-snapshot/
git commit -m "feat(cron): snapshot Yandex Metrika traffic and goals into DB

Прямые запросы к Метрике из tRPC невозможны: лимит 200 запросов / 5 минут
и латентность в секунды на каждый рендер админки. Крон перезаписывает окно
в 8 дней, потому что Метрика доуточняет свежие цифры задним числом.
Ошибка Метрики возвращает 200 с ok:false — крон не должен падать и будить
алерты, снапшот просто остаётся прежним.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Расписание крона

**Files:**
- Create: `.github/workflows/metrika-snapshot.yml`

- [ ] **Step 1: Создать workflow**

Шаблон повторяет `.github/workflows/notifications-cleanup.yml:12-19`.

```yaml
name: Metrika snapshot

on:
  schedule:
    # Раз в 6 часов. Почасовой крон бессмысленен: GitHub Actions дрейфует
    # на 60-100 минут под нагрузкой (см. MAAL-PLATFORM-1), то есть на величину
    # собственного интервала. Аналитика не операционная, 4 снятия в сутки хватает.
    - cron: '0 */6 * * *'
  workflow_dispatch:
    inputs:
      days:
        description: 'Сколько дней назад перезаписать (бэкфилл, максимум 400)'
        required: false
        default: '8'

jobs:
  snapshot:
    runs-on: ubuntu-latest
    steps:
      - name: Fetch Metrika snapshot
        run: |
          curl -fsSL --max-time 600 \
            -H "Authorization: Bearer $CRON_SECRET" \
            "$SITE_URL/api/cron/metrika-snapshot?days=${DAYS:-8}" \
            || echo "Warning: metrika-snapshot failed"
        env:
          SITE_URL: ${{ secrets.SITE_URL }}
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
          DAYS: ${{ github.event.inputs.days }}
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/metrika-snapshot.yml
git commit -m "chore(ci): schedule Metrika snapshot every 6 hours

workflow_dispatch с параметром days нужен для разового бэкфилла истории,
чтобы таб не открывался пустым в первый день.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Чистая сборка воронки (TDD)

**Files:**
- Create: `packages/api/src/utils/product-funnel.ts`
- Test: `packages/api/src/utils/product-funnel.test.ts`

Вся арифметика конверсий — чистая, по образцу `packages/api/src/utils/revenue-metrics.ts`. Роутер только достаёт данные и передаёт сюда.

- [ ] **Step 1: Написать падающий тест**

```ts
// packages/api/src/utils/product-funnel.test.ts
import { describe, expect, it } from 'vitest';
import { buildFunnel, sumDaily, type DailyPoint } from './product-funnel';

const daily: DailyPoint[] = [
  { metricKey: 'visits', day: '2026-07-13', value: 260 },
  { metricKey: 'visits', day: '2026-07-14', value: 276 },
  { metricKey: 'goal_540626668_visits', day: '2026-07-13', value: 10 },
  { metricKey: 'goal_540626668_visits', day: '2026-07-14', value: 12 },
];

describe('sumDaily', () => {
  it('суммирует значения одного ключа', () => {
    expect(sumDaily(daily, 'visits')).toBe(536);
  });

  it('возвращает 0 для отсутствующего ключа', () => {
    expect(sumDaily(daily, 'goal_999_visits')).toBe(0);
  });
});

describe('buildFunnel', () => {
  it('считает конверсию каждого шага от предыдущего и от вершины', () => {
    const funnel = buildFunnel({
      visits: 1000,
      goalVisits: {
        signup: 200,
        diagnosticStart: 100,
        diagnosticComplete: 80,
        lessonOpen: 60,
        pricingView: 40,
      },
      trials: 30,
      payments: 3,
    });

    expect(funnel.map((s) => s.key)).toEqual([
      'visits',
      'signup',
      'diagnosticStart',
      'diagnosticComplete',
      'lessonOpen',
      'pricingView',
      'trials',
      'payments',
    ]);

    expect(funnel[0]).toMatchObject({ value: 1000, fromPrev: null, fromTop: 100 });
    expect(funnel[1]).toMatchObject({ value: 200, fromPrev: 20, fromTop: 20 });
    expect(funnel[2]).toMatchObject({ value: 100, fromPrev: 50, fromTop: 10 });
    expect(funnel[7]).toMatchObject({ value: 3, fromPrev: 10, fromTop: 0.3 });
  });

  it('помечает источник каждого шага, чтобы UI не выдавал Метрику за БД', () => {
    const funnel = buildFunnel({
      visits: 10,
      goalVisits: { signup: 5, diagnosticStart: 4, diagnosticComplete: 3, lessonOpen: 2, pricingView: 1 },
      trials: 1,
      payments: 1,
    });
    expect(funnel.find((s) => s.key === 'signup')?.source).toBe('metrika');
    expect(funnel.find((s) => s.key === 'trials')?.source).toBe('db');
    expect(funnel.find((s) => s.key === 'payments')?.source).toBe('db');
  });

  it('не делит на ноль: при пустом периоде конверсии равны нулю', () => {
    const funnel = buildFunnel({
      visits: 0,
      goalVisits: { signup: 0, diagnosticStart: 0, diagnosticComplete: 0, lessonOpen: 0, pricingView: 0 },
      trials: 0,
      payments: 0,
    });
    // Вершина всегда 100% (это доля от себя самой, а не деление).
    expect(funnel[0].fromTop).toBe(100);
    expect(funnel[0].fromPrev).toBeNull();
    // Все остальные шаги — нули, без NaN и без Infinity.
    for (const step of funnel.slice(1)) {
      expect(step.fromTop).toBe(0);
      expect(step.fromPrev).toBe(0);
      expect(Number.isFinite(step.fromPrev as number)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Запустить тест, убедиться что падает**

Run: `pnpm --filter @mpstats/api test -- product-funnel`
Expected: FAIL — `Cannot find module './product-funnel'`

- [ ] **Step 3: Реализовать**

```ts
// packages/api/src/utils/product-funnel.ts

export interface DailyPoint {
  metricKey: string;
  day: string;
  value: number;
}

export type FunnelStepKey =
  | 'visits'
  | 'signup'
  | 'diagnosticStart'
  | 'diagnosticComplete'
  | 'lessonOpen'
  | 'pricingView'
  | 'trials'
  | 'payments';

export interface FunnelStep {
  key: FunnelStepKey;
  label: string;
  value: number;
  /** Конверсия от предыдущего шага, %. null у вершины. */
  fromPrev: number | null;
  /** Конверсия от визитов, %. */
  fromTop: number;
  /** Откуда цифра: Метрика (поведение) или БД (деньги и подписки). */
  source: 'metrika' | 'db';
}

const LABELS: Record<FunnelStepKey, string> = {
  visits: 'Визиты',
  signup: 'Регистрация',
  diagnosticStart: 'Начал диагностику',
  diagnosticComplete: 'Завершил диагностику',
  lessonOpen: 'Открыл урок',
  pricingView: 'Посмотрел тарифы',
  trials: 'Триал',
  payments: 'Оплата',
};

export function sumDaily(points: DailyPoint[], metricKey: string): number {
  return points.reduce((acc, p) => (p.metricKey === metricKey ? acc + p.value : acc), 0);
}

function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

export function buildFunnel(input: {
  visits: number;
  goalVisits: Record<'signup' | 'diagnosticStart' | 'diagnosticComplete' | 'lessonOpen' | 'pricingView', number>;
  trials: number;
  payments: number;
}): FunnelStep[] {
  const raw: Array<{ key: FunnelStepKey; value: number; source: 'metrika' | 'db' }> = [
    { key: 'visits', value: input.visits, source: 'metrika' },
    { key: 'signup', value: input.goalVisits.signup, source: 'metrika' },
    { key: 'diagnosticStart', value: input.goalVisits.diagnosticStart, source: 'metrika' },
    { key: 'diagnosticComplete', value: input.goalVisits.diagnosticComplete, source: 'metrika' },
    { key: 'lessonOpen', value: input.goalVisits.lessonOpen, source: 'metrika' },
    { key: 'pricingView', value: input.goalVisits.pricingView, source: 'metrika' },
    { key: 'trials', value: input.trials, source: 'db' },
    { key: 'payments', value: input.payments, source: 'db' },
  ];

  return raw.map((step, index) => ({
    key: step.key,
    label: LABELS[step.key],
    value: step.value,
    fromPrev: index === 0 ? null : percent(step.value, raw[index - 1].value),
    fromTop: index === 0 ? 100 : percent(step.value, input.visits),
    source: step.source,
  }));
}
```

Контракт вершины воронки: `fromPrev: null` (предыдущего шага нет), `fromTop: 100` при любых визитах, включая ноль — это доля от себя самой, а не деление. Тесты выше проверяют ровно это.

- [ ] **Step 4: Запустить тест, убедиться что проходит**

Run: `pnpm --filter @mpstats/api test -- product-funnel`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/utils/product-funnel.ts packages/api/src/utils/product-funnel.test.ts
git commit -m "feat(api): add pure product funnel assembly

Поле source на каждом шаге не косметика: воронка склеивает две системы,
и UI обязан честно показывать, где цифра из Метрики (поведение), а где
из БД (деньги). Без этого расхождение с табом выручки выглядело бы багом.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: tRPC-процедуры

**Files:**
- Create: `packages/api/src/routers/admin-analytics-funnel.ts`
- Modify: `packages/api/src/routers/admin-analytics.ts:43`

Стиль — как в `admin-analytics-assistant.ts` (обязательный `{from, to}` без `days`, `assertRange`). Исключение тестовых аккаунтов — Prisma-фильтром `user: { isTest: false }, plan: { hidden: false }`, как в `admin-analytics.ts:474`.

- [ ] **Step 1: Реализовать sub-router**

```ts
// packages/api/src/routers/admin-analytics-funnel.ts
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  FUNNEL_GOAL_STEPS,
  METRIKA_UNIQUE_WINDOWS,
  goalMetricKey,
} from '@mpstats/shared';
import { adminProcedure, router } from '../trpc';
import { handleDatabaseError } from '../utils/db-errors';
import { buildFunnel, sumDaily, type DailyPoint } from '../utils/product-funnel';

const rangeInput = z.object({ from: z.date(), to: z.date() });

function assertRange(from: Date, to: Date) {
  if ((to.getTime() - from.getTime()) / 86_400_000 > 366) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Диапазон не больше 366 дней' });
  }
}

/** Подневные строки снапшота за период. */
async function loadDaily(prisma: any, from: Date, to: Date): Promise<DailyPoint[]> {
  const rows = await prisma.metrikaSnapshot.findMany({
    where: { windowDays: 1, day: { gte: from, lte: to } },
    select: { metricKey: true, day: true, value: true },
    orderBy: { day: 'asc' },
  });
  return rows.map((r: { metricKey: string; day: Date; value: number }) => ({
    metricKey: r.metricKey,
    day: r.day.toISOString().slice(0, 10),
    value: r.value,
  }));
}

export const adminAnalyticsFunnelRouter = router({
  /** Трафик по дням + отметка свежести снапшота. */
  getTrafficOverview: adminProcedure.input(rangeInput).query(async ({ ctx, input }) => {
    try {
      assertRange(input.from, input.to);
      const daily = await loadDaily(ctx.prisma, input.from, input.to);

      const byDay = new Map<string, { day: string; visits: number; users: number; pageviews: number }>();
      for (const point of daily) {
        if (!['visits', 'users', 'pageviews'].includes(point.metricKey)) continue;
        const entry = byDay.get(point.day) ?? { day: point.day, visits: 0, users: 0, pageviews: 0 };
        (entry as never as Record<string, number>)[point.metricKey] = point.value;
        byDay.set(point.day, entry);
      }

      // Уники за период берём только из окна нужной длины: сумма дневных
      // уников задваивает людей, вернувшихся на следующий день.
      const spanDays = Math.round((input.to.getTime() - input.from.getTime()) / 86_400_000) + 1;
      const matchedWindow = METRIKA_UNIQUE_WINDOWS.find((w) => Math.abs(w - spanDays) <= 1) ?? null;
      let periodUsers: number | null = null;
      if (matchedWindow) {
        const row = await ctx.prisma.metrikaSnapshot.findFirst({
          where: { metricKey: 'users', windowDays: matchedWindow },
          orderBy: { day: 'desc' },
        });
        periodUsers = row?.value ?? null;
      }

      const freshest = await ctx.prisma.metrikaSnapshot.findFirst({
        orderBy: { fetchedAt: 'desc' },
        select: { fetchedAt: true },
      });

      return {
        series: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)),
        totals: {
          visits: sumDaily(daily, 'visits'),
          pageviews: sumDaily(daily, 'pageviews'),
          /** null = период не совпал с пресетным окном, честных уников нет. */
          periodUsers,
        },
        snapshotAt: freshest?.fetchedAt ?? null,
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      handleDatabaseError(error);
    }
  }),

  /** Сквозная воронка: поведение из снапшота, триал и оплаты из БД. */
  getProductFunnel: adminProcedure.input(rangeInput).query(async ({ ctx, input }) => {
    try {
      assertRange(input.from, input.to);
      const daily = await loadDaily(ctx.prisma, input.from, input.to);

      const goalVisits = Object.fromEntries(
        FUNNEL_GOAL_STEPS.map((goal) => [goal, sumDaily(daily, goalMetricKey(goal, 'visits'))]),
      ) as Record<(typeof FUNNEL_GOAL_STEPS)[number], number>;

      // Тот же запрос, что в getTrialConversion (admin-analytics.ts:506-507),
      // иначе новый таб разойдётся с существующим табом «Триал→оплата».
      const trials = await ctx.prisma.subscription.count({
        where: {
          status: 'TRIAL',
          currentPeriodStart: { gte: input.from, lte: input.to },
          user: { isTest: false },
          plan: { hidden: false },
        },
      });

      // Деньги — только из БД: клиентская цель platform_payment ловит
      // 10-12 оплат за 30 дней там, где БД знает реальное число.
      const paidRows = await ctx.prisma.payment.findMany({
        where: {
          status: 'COMPLETED',
          paidAt: { gte: input.from, lte: input.to },
          subscription: { user: { isTest: false }, plan: { hidden: false } },
        },
        select: { subscription: { select: { userId: true } } },
      });
      const payments = new Set(paidRows.map((p: { subscription: { userId: string } }) => p.subscription.userId)).size;

      const freshest = await ctx.prisma.metrikaSnapshot.findFirst({
        orderBy: { fetchedAt: 'desc' },
        select: { fetchedAt: true },
      });

      return {
        steps: buildFunnel({ visits: sumDaily(daily, 'visits'), goalVisits, trials, payments }),
        snapshotAt: freshest?.fetchedAt ?? null,
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      handleDatabaseError(error);
    }
  }),
});
```

- [ ] **Step 2: Подмонтировать в admin-analytics.ts**

Рядом с `assistant:` (строка 43) добавить импорт вверху файла:
```ts
import { adminAnalyticsFunnelRouter } from './admin-analytics-funnel';
```
и в объект роутера:
```ts
  funnel: adminAnalyticsFunnelRouter,
```

Клиентский namespace станет `trpc.admin.analytics.funnel.*`.

- [ ] **Step 3: Проверить типы и тесты**

Run: `pnpm typecheck && pnpm test`
Expected: без ошибок, все тесты зелёные.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/routers/admin-analytics-funnel.ts packages/api/src/routers/admin-analytics.ts
git commit -m "feat(api): add product funnel and traffic tRPC procedures

Процедуры читают только снапшот и БД — к Метрике не ходят, иначе каждый
рендер админки съедал бы квоту 200 запросов / 5 минут.
Шаг «Триал» повторяет запрос getTrialConversion дословно, чтобы новый таб
не разошёлся с существующим.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: UI таба

**Files:**
- Create: `apps/web/src/app/(admin)/admin/analytics/product-funnel/page.tsx`
- Modify: `apps/web/src/components/admin/AnalyticsTabs.tsx:7-16`

Паттерн — `apps/web/src/app/(admin)/admin/analytics/assistant/page.tsx:63-85`: `useState(presetRange(30))` → `rangeToBounds` → `<AnalyticsDateRange>`.

- [ ] **Step 1: Зарегистрировать таб**

В `apps/web/src/components/admin/AnalyticsTabs.tsx` в массив `TABS` добавить после строки с «AI-запросы»:

```ts
  { label: 'Продуктовая воронка', href: '/admin/analytics/product-funnel' },
```

- [ ] **Step 2: Создать страницу**

```tsx
// apps/web/src/app/(admin)/admin/analytics/product-funnel/page.tsx
'use client';

import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AnalyticsDateRange, presetRange, rangeToBounds } from '@/components/admin/AnalyticsDateRange';
import { StatCard } from '@/components/admin/StatCard';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { trpc } from '@/lib/trpc';
import { Eye, TrendingDown, Users } from 'lucide-react';

function SnapshotStamp({ at }: { at: Date | null | undefined }) {
  if (!at) {
    return <p className="text-sm text-amber-600">Снапшот Метрики пуст — крон ещё не отработал.</p>;
  }
  return (
    <p className="text-sm text-gray-500">
      Данные Метрики на {new Date(at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}
    </p>
  );
}

export default function ProductFunnelPage() {
  const [range, setRange] = useState(presetRange(30));
  const { from, to } = rangeToBounds(range);

  const traffic = trpc.admin.analytics.funnel.getTrafficOverview.useQuery({ from, to });
  const funnel = trpc.admin.analytics.funnel.getProductFunnel.useQuery({ from, to });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Продуктовая воронка</h1>
        <AnalyticsDateRange value={range} onChange={setRange} />
      </div>

      <SnapshotStamp at={traffic.data?.snapshotAt} />

      {traffic.isLoading ? (
        <Skeleton className="h-28 w-full" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard title="Визиты" value={traffic.data?.totals.visits ?? 0} icon={Eye} color="blue" />
          <StatCard
            title="Уникальные посетители"
            value={traffic.data?.totals.periodUsers ?? '—'}
            icon={Users}
            color="green"
          />
          <StatCard title="Просмотры страниц" value={traffic.data?.totals.pageviews ?? 0} icon={Eye} color="gray" />
        </div>
      )}

      {traffic.data?.totals.periodUsers == null && (
        <p className="text-xs text-gray-500">
          Уникальные посетители считаются только для периодов 7, 14, 30 и 90 дней: посетители не
          суммируются по дням без задвоения одних и тех же людей.
        </p>
      )}

      <Card className="p-4">
        <h2 className="mb-4 text-lg font-medium">Трафик платформы по дням</h2>
        {traffic.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={traffic.data?.series ?? []}>
              <defs>
                <linearGradient id="visitsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="day" tick={{ fill: '#6b7280', fontSize: 12 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="visits" name="Визиты" stroke="#2563eb" fill="url(#visitsFill)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="mb-1 text-lg font-medium">Сквозная воронка</h2>
        <p className="mb-4 text-sm text-gray-500">
          Поведенческие шаги — визиты с достижением цели в Метрике. Триал и оплата — из базы,
          тестовые аккаунты и скрытый тариф исключены.
        </p>
        {funnel.isLoading ? (
          <Skeleton className="h-80 w-full" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2">Шаг</th>
                  <th className="py-2 text-right">Значение</th>
                  <th className="py-2 text-right">От предыдущего</th>
                  <th className="py-2 text-right">От визитов</th>
                  <th className="py-2 text-right">Источник</th>
                </tr>
              </thead>
              <tbody>
                {(funnel.data?.steps ?? []).map((step) => (
                  <tr key={step.key} className="border-b last:border-0">
                    <td className="py-2 font-medium">{step.label}</td>
                    <td className="py-2 text-right tabular-nums">{step.value.toLocaleString('ru-RU')}</td>
                    <td className="py-2 text-right tabular-nums text-gray-600">
                      {step.fromPrev === null ? '—' : `${step.fromPrev}%`}
                    </td>
                    <td className="py-2 text-right tabular-nums text-gray-600">{step.fromTop}%</td>
                    <td className="py-2 text-right text-xs text-gray-400">
                      {step.source === 'db' ? 'база' : 'Метрика'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Проверить типы и сборку**

Run: `pnpm typecheck && pnpm --filter web build`
Expected: без ошибок. Сборку гоняем обязательно: `next build` ловит утечку `server-only` в клиентский бандл, а `tsc --noEmit` — нет (гоча из CLAUDE.md). Здесь риск реальный — страница клиентская и импортирует `@mpstats/shared`.

- [ ] **Step 4: Проверить глазами**

```bash
pnpm dev
```
Открыть `http://localhost:3000/admin/analytics/product-funnel` под админом. Проверить: таб виден в шапке, переключение периода перерисовывает и трафик, и воронку, при периоде «30 дней» уники — число, при произвольном диапазоне — прочерк с пояснением.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/\(admin\)/admin/analytics/product-funnel/ apps/web/src/components/admin/AnalyticsTabs.tsx
git commit -m "feat(admin): add product funnel analytics tab

Между «зарегистрировался» и «оплатил» был чёрный ящик: по июльскому
эксперименту видно 3,8% триал→оплата, но не видно, доходят ли люди до
тарифов вообще. Таб показывает шаги и разводит гипотезы.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Бэкфилл истории и раскатка

**Files:**
- Modify: `docs/yandex-metrika-api.md`

- [ ] **Step 1: Добавить env на прод**

На VPS дописать в `/home/deploy/maal/.env.production` (файл в git не лежит, `docker-compose.yml:24-25` подключает его через `env_file`; правки самого compose-файла не нужны):

```
YANDEX_METRIKA_COUNTER_ID=94592073
YANDEX_METRIKA_OAUTH_TOKEN=<реальный токен из локального .env>
```

Перезапустить контейнер: `docker compose up -d web`

- [ ] **Step 2: Проверить, что контейнер видит переменные**

```bash
ssh deploy@89.208.106.208 'cd /home/deploy/maal && docker compose exec web sh -c "echo \$YANDEX_METRIKA_COUNTER_ID"'
```
Expected: `94592073`

- [ ] **Step 3: Прогнать бэкфилл истории**

GitHub → Actions → «Metrika snapshot» → Run workflow → days = `365`.
Крон нарежет диапазон слайсами по 60 дней (`CHUNK_DAYS`) — упереться в «Query is too complicated» не должен.

- [ ] **Step 4: Убедиться, что снапшот наполнился**

Открыть `/admin/analytics/product-funnel` на проде, выбрать период 90 дней. Ожидаемо: график трафика без дыр, воронка с ненулевыми шагами, отметка «Данные Метрики на \<сегодня\>».

- [ ] **Step 5: Сверить критерии готовности спеки §7**

- Визиты за 30 дней из таба = прямой запрос в Метрику с фильтром по `platform.` (команда сверки — Task 5 Step 5).
- Число оплат в воронке = число оплат в табе «Выручка» за тот же период.
- Повторный прогон workflow не меняет число строк в `MetrikaSnapshot`.

- [ ] **Step 6: Обновить документацию**

В `docs/yandex-metrika-api.md` дописать раздел «Метрики целей»: список ID, разницу `reaches`/`visits`/`users` с таблицей из шапки этого плана, факт мёртвой цели `platform_cta_click`, и что снапшот живёт в `MetrikaSnapshot`.

- [ ] **Step 7: Commit**

```bash
git add docs/yandex-metrika-api.md
git commit -m "docs(metrika): document goal metrics and reaches-vs-visits trap

reaches ломает воронку: он считает срабатывания, а не людей — открытие
урока даёт 3899 при 3582 визитах всего. Фиксируем, чтобы следующий
не наступил.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Открытые вопросы для владельца (не блокеры)

1. **Мёртвая цель `platform_cta_click`.** Завести вызов `reachGoal(METRIKA_GOALS.CTA_CLICK)` на главных CTA — отдельная маленькая задача. Пока шага в воронке нет.
2. **Личный OAuth-токен.** Для прода надёжнее сервисный аккаунт с гостевым доступом «только просмотр» (спека §6). Пока живём на личном; отметка «Данные Метрики на \<дата\>» в UI сделает протухание видимым, а не молчаливым.
3. **Шаг «дошёл до платёжного виджета».** В БД уже есть `CheckoutAttempt` (лог CloudPayments `check`, `schema.prisma:346-354`). Он точнее клиентской цели и закрыл бы разрыв между «посмотрел тарифы» и «оплатил». В этот план не включён — сначала посмотрим на базовую воронку.
