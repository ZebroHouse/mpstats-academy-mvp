# Content Journal + Device Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Начать собирать журнал заходов в уроки и тип устройства пользователя, чтобы дашборды (спеки B и C) получили данные, которых сейчас в базе нет вообще.

**Architecture:** Две новые аддитивные таблицы (`ContentView` — строка на заход в урок, `UserDeviceDay` — устройства пользователя по дням) и одна необязательная колонка (`DiagnosticSession.device`). Устройство определяется чистой функцией из `ctx.userAgent` и пишется в существующем хартбите `protectedProcedure`. Просмотры пишутся отдельной парой мутаций `contentView.startView` / `contentView.pingView`, независимой от логики прогресса. Всё под рубильником `CONTENT_JOURNAL_ENABLED`, все отказы проглатываются.

**Tech Stack:** TypeScript, Next.js 14 App Router, tRPC v11, Prisma 5.22, Supabase Postgres, Vitest, pnpm workspaces.

**Спека:** `docs/superpowers/specs/2026-08-06-content-journal-device-tracking-design.md`
**Ветка:** `feature/content-device-analytics` (от `origin/master` = `d57c7ad`)

## Global Constraints

- **Никакого UI.** Дашборды — спеки B и C. Эта спека только собирает данные.
- **`prisma db push` / `prisma migrate` против этой базы ЗАПРЕЩЕНЫ.** Миграция — только аддитивным tsx-скриптом через Supabase Management API. База `saecuecevicwjkpmaoot` — живой прод, 800+ пользователей. См. `MAAL/CLAUDE.md` → «PROD DATABASE SAFETY».
- **Порядок деплоя обратный привычному: сначала миграция, потом код.** Наоборот нельзя — код сразу начнёт писать в несуществующую таблицу.
- **Локальный dev читает ПРОД Supabase.** Поэтому миграция нужна до локального прогона чего-либо, что ходит в новые таблицы. Юнит-тесты мокают Prisma и БД не трогают.
- **Никаких FK на новых таблицах.** Как в `UserActivityDay` — защита от каскадов на общей прод-базе.
- **`device` и `contentType` — `String`, не Prisma-`enum`.** Добавление значения в enum это DDL против прода; в строковую колонку — обычный деплой. Валидация в zod.
- **Все значения устройства — ровно эти четыре:** `MOBILE`, `TABLET`, `DESKTOP`, `UNKNOWN`.
- **Рубильник — `CONTENT_JOURNAL_ENABLED`.** Значение `'true'` (строка) включает запись; любое другое значение и отсутствие переменной = выключено. Сравнение строгое: `process.env.CONTENT_JOURNAL_ENABLED !== 'true'`.
- **Журнал не имеет права уронить урок.** Каждая запись в try/catch, ошибки в `console.error`, наружу не пробрасываются.
- **Тестовых пользователей на записи НЕ фильтруем.** Исключение `isTest` — на чтении, в спеках B и C.
- **Не хранить IP и полный User-Agent.** Только производный тип устройства.
- **Prisma на VPS — только `npx prisma@5.22.0`.** Локально `pnpm db:generate`.
- Перед коммитом: `git branch --show-current` должен быть `feature/content-device-analytics`.

---

### Task 1: Определение типа устройства

Чистая функция, разбирающая User-Agent на четыре значения. Отдельная задача, потому что её результат — единственный источник поля `device` во всех трёх местах записи, и ошибка здесь испортит весь блок аналитики по устройствам молча.

**Files:**
- Create: `packages/shared/src/device.ts`
- Create: `packages/shared/src/__tests__/device.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: ничего
- Produces:
  - `type DeviceType = 'MOBILE' | 'TABLET' | 'DESKTOP' | 'UNKNOWN'`
  - `parseDeviceType(userAgent: string | null | undefined): DeviceType`

Оба экспортируются из барреля `@mpstats/shared`.

- [ ] **Step 1: Написать падающий тест**

Создать `packages/shared/src/__tests__/device.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseDeviceType } from '../device';

describe('parseDeviceType', () => {
  it('iPhone → MOBILE', () => {
    expect(parseDeviceType(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    )).toBe('MOBILE');
  });

  it('Android-телефон (содержит Mobile) → MOBILE', () => {
    expect(parseDeviceType(
      'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36'
    )).toBe('MOBILE');
  });

  it('iPad → TABLET', () => {
    expect(parseDeviceType(
      'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    )).toBe('TABLET');
  });

  it('Android-планшет (без Mobile) → TABLET', () => {
    expect(parseDeviceType(
      'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    )).toBe('TABLET');
  });

  it('Windows-десктоп → DESKTOP', () => {
    expect(parseDeviceType(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    )).toBe('DESKTOP');
  });

  it('macOS-десктоп → DESKTOP', () => {
    expect(parseDeviceType(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
    )).toBe('DESKTOP');
  });

  it('null → UNKNOWN', () => {
    expect(parseDeviceType(null)).toBe('UNKNOWN');
  });

  it('undefined → UNKNOWN', () => {
    expect(parseDeviceType(undefined)).toBe('UNKNOWN');
  });

  it('пустая строка и пробелы → UNKNOWN', () => {
    expect(parseDeviceType('')).toBe('UNKNOWN');
    expect(parseDeviceType('   ')).toBe('UNKNOWN');
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `pnpm --filter @mpstats/shared test -- device`
Expected: FAIL — `Failed to resolve import "../device"` (файла ещё нет).

- [ ] **Step 3: Реализовать**

Создать `packages/shared/src/device.ts`:

```ts
/**
 * Тип устройства из User-Agent. Четыре значения, без версий и моделей —
 * библиотеки парсинга UA тянут таблицы моделей телефонов, которые нам не нужны.
 *
 * Известное ограничение: iPadOS 13+ по умолчанию представляется как Macintosh,
 * такие заходы попадут в DESKTOP. Лечится только client hints; для наших целей
 * (доля мобильных vs десктоп) погрешность приемлема.
 */
export type DeviceType = 'MOBILE' | 'TABLET' | 'DESKTOP' | 'UNKNOWN';

/** Планшет проверяем первым: у iPad в UA есть и "ipad", и "mobile". */
const TABLET_RE = /\b(ipad|tablet|playbook|silk)\b|android(?!.*\bmobile\b)/i;
const MOBILE_RE = /\b(iphone|ipod|windows phone|blackberry|bb10|opera mini|iemobile)\b|android.*\bmobile\b/i;

export function parseDeviceType(userAgent: string | null | undefined): DeviceType {
  if (!userAgent || !userAgent.trim()) return 'UNKNOWN';
  const ua = userAgent.toLowerCase();
  if (TABLET_RE.test(ua)) return 'TABLET';
  if (MOBILE_RE.test(ua)) return 'MOBILE';
  return 'DESKTOP';
}
```

- [ ] **Step 4: Экспортировать из барреля**

В `packages/shared/src/index.ts` добавить строку после `export * from './legal-versions';`:

```ts
export * from './device';
```

- [ ] **Step 5: Прогнать тесты**

Run: `pnpm --filter @mpstats/shared test`
Expected: PASS, 9 тестов в `device.test.ts`.

- [ ] **Step 6: Коммит**

```bash
git add packages/shared/src/device.ts packages/shared/src/__tests__/device.test.ts packages/shared/src/index.ts
git commit -m "feat(analytics): parseDeviceType helper for content journal

Единственный источник поля device во всех трёх местах записи журнала.
Без зависимости: библиотеки парсинга UA тянут таблицы моделей ради
различения телефонов, которое нам не нужно."
```

---

### Task 2: Накопитель активного времени

Чистая функция, превращающая поток «позиция плеера + сколько прошло по часам» в честное активное время. Отдельная задача по той же причине, что и Task 1: ошибка тихая, всплывёт через месяц кривой метрикой «среднее время просмотра».

Смысл алгоритма: секунда засчитывается, только если позиция плеера сдвинулась вперёд — это автоматически отсекает паузу, свёрнутую вкладку и перемотку назад. Прибавляем при этом время по настенным часам, а не сдвиг позиции: на скорости 2× десятиминутный урок отсматривается за пять минут, и активное время должно быть пять, а не десять.

**Files:**
- Create: `packages/shared/src/active-time.ts`
- Create: `packages/shared/src/__tests__/active-time.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: ничего
- Produces:
  - `accumulateActiveSeconds(params: { prevPosition: number; nextPosition: number; elapsedMs: number; prevActiveSeconds: number }): number`
  - `MAX_TICK_SECONDS: number` (= 2)

- [ ] **Step 1: Написать падающий тест**

Создать `packages/shared/src/__tests__/active-time.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { accumulateActiveSeconds } from '../active-time';

describe('accumulateActiveSeconds', () => {
  it('обычный тик: позиция сдвинулась на секунду → +1', () => {
    expect(accumulateActiveSeconds({
      prevPosition: 10, nextPosition: 11, elapsedMs: 1000, prevActiveSeconds: 5,
    })).toBe(6);
  });

  it('пауза: позиция не сдвинулась → без изменений', () => {
    expect(accumulateActiveSeconds({
      prevPosition: 10, nextPosition: 10, elapsedMs: 1000, prevActiveSeconds: 5,
    })).toBe(5);
  });

  it('перемотка назад → без изменений', () => {
    expect(accumulateActiveSeconds({
      prevPosition: 10, nextPosition: 4, elapsedMs: 1000, prevActiveSeconds: 5,
    })).toBe(5);
  });

  it('скорость 2x: позиция +2, часы +1 → засчитываем 1 (настенное время)', () => {
    expect(accumulateActiveSeconds({
      prevPosition: 10, nextPosition: 12, elapsedMs: 1000, prevActiveSeconds: 5,
    })).toBe(6);
  });

  it('перемотка вперёд на минуту за один тик → не больше потолка', () => {
    expect(accumulateActiveSeconds({
      prevPosition: 10, nextPosition: 70, elapsedMs: 1000, prevActiveSeconds: 5,
    })).toBe(6);
  });

  it('замороженный таймер (вкладка в фоне 60с) → прибавка обрезана потолком', () => {
    expect(accumulateActiveSeconds({
      prevPosition: 10, nextPosition: 11, elapsedMs: 60_000, prevActiveSeconds: 5,
    })).toBe(7);
  });

  it('микросдвиг ниже порога (дрожание опроса) → без изменений', () => {
    expect(accumulateActiveSeconds({
      prevPosition: 10, nextPosition: 10.05, elapsedMs: 1000, prevActiveSeconds: 5,
    })).toBe(5);
  });

  it('нулевое или отрицательное время между тиками → без изменений', () => {
    expect(accumulateActiveSeconds({
      prevPosition: 10, nextPosition: 11, elapsedMs: 0, prevActiveSeconds: 5,
    })).toBe(5);
    expect(accumulateActiveSeconds({
      prevPosition: 10, nextPosition: 11, elapsedMs: -100, prevActiveSeconds: 5,
    })).toBe(5);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `pnpm --filter @mpstats/shared test -- active-time`
Expected: FAIL — `Failed to resolve import "../active-time"`.

- [ ] **Step 3: Реализовать**

Создать `packages/shared/src/active-time.ts`:

```ts
/**
 * Активное время просмотра: секунда засчитывается, только если позиция плеера
 * сдвинулась вперёд. Пауза, свёрнутая вкладка и перемотка назад времени не
 * набирают.
 *
 * Прибавляем настенное время, а не сдвиг позиции: на скорости 2x позиция растёт
 * вдвое быстрее часов, но человек потратил именно столько минут, сколько прошло.
 */

/** Потолок прибавки за один тик. Гасит перемотку вперёд и замороженный в фоне таймер. */
export const MAX_TICK_SECONDS = 2;

/** Ниже этого сдвига считаем, что плеер стоит (дрожание опроса getCurrentTime). */
const MIN_POSITION_DELTA = 0.1;

export function accumulateActiveSeconds(params: {
  prevPosition: number;
  nextPosition: number;
  elapsedMs: number;
  prevActiveSeconds: number;
}): number {
  const { prevPosition, nextPosition, elapsedMs, prevActiveSeconds } = params;
  if (elapsedMs <= 0) return prevActiveSeconds;
  if (nextPosition - prevPosition < MIN_POSITION_DELTA) return prevActiveSeconds;
  return prevActiveSeconds + Math.min(elapsedMs / 1000, MAX_TICK_SECONDS);
}
```

- [ ] **Step 4: Экспортировать из барреля**

В `packages/shared/src/index.ts` добавить после `export * from './device';`:

```ts
export * from './active-time';
```

- [ ] **Step 5: Прогнать тесты**

Run: `pnpm --filter @mpstats/shared test`
Expected: PASS, 8 новых тестов в `active-time.test.ts`, старые не сломаны.

- [ ] **Step 6: Коммит**

```bash
git add packages/shared/src/active-time.ts packages/shared/src/__tests__/active-time.test.ts packages/shared/src/index.ts
git commit -m "feat(analytics): active watch time accumulator

Считает настенное время, засчитывая только тики, где позиция плеера
сдвинулась вперёд — пауза, фон и перемотка назад времени не набирают.
Настенное, а не сдвиг позиции: на 2x человек тратит вдвое меньше минут."
```

---

### Task 3: Схема и миграция

Две таблицы и одна колонка. Задача заканчивается фактически применённой миграцией на прод-базе, потому что локальный dev читает ту же базу — без применения ничего дальше не заработает даже локально.

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `scripts/migrate-content-journal.ts`

**Interfaces:**
- Consumes: ничего
- Produces: Prisma-модели `ContentView`, `UserDeviceDay`, поле `DiagnosticSession.device`. Далее используются как `ctx.prisma.contentView`, `ctx.prisma.userDeviceDay`.

⚠️ **Шаг 5 выполняет DDL против живой прод-базы.** Операции строго аддитивные и идемпотентные (`IF NOT EXISTS`), но перед запуском нужно явное «да» от владельца.

- [ ] **Step 1: Добавить модели в схему**

В `packages/db/prisma/schema.prisma`, рядом с `UserActivityDay` / `ReferralCodeClickDay` / `EmergencyBlockEventDay` (примерно строка 830, после `EmergencyBlockEventDay`), добавить:

```prisma
/// Журнал заходов в урок. Строка на каждое открытие, а не на пару юзер-урок —
/// в отличие от LessonProgress, который хранит только конечное состояние.
/// Без FK — как UserActivityDay: защита от каскадов на общей прод-БД.
/// courseId и contentType денормализованы намеренно: почти каждый запрос
/// аналитики группирует по курсу, а копия ещё и фиксирует исторический факт
/// (урок мог переехать в другой курс или сменить тип уже после просмотра).
model ContentView {
  id            String   @id @default(cuid())
  userId        String // = UserProfile.id
  lessonId      String
  courseId      String
  contentType   String // VIDEO | TEXT | INTERACTIVE — снимок на момент захода
  device        String // MOBILE | TABLET | DESKTOP | UNKNOWN
  activeSeconds Int      @default(0)
  maxPercent    Int      @default(0)
  completed     Boolean  @default(false)
  startedAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([lessonId, startedAt])
  @@index([courseId, startedAt])
  @@index([userId, startedAt])
  @@index([startedAt])
}

/// Устройства пользователя по дням. Несколько строк за день на одного человека —
/// это и есть сигнал «переходы между устройствами». Отдельная таблица, а не
/// колонка в UserActivityDay: там PK (userId, day), устройство сломало бы его.
model UserDeviceDay {
  userId    String
  day       DateTime @db.Date
  device    String // MOBILE | TABLET | DESKTOP | UNKNOWN
  createdAt DateTime @default(now())

  @@id([userId, day, device])
  @@index([day])
}
```

- [ ] **Step 2: Добавить колонку в DiagnosticSession**

В той же схеме, в модель `DiagnosticSession` (строка 126), после `questions Json?` добавить:

```prisma
  device          String? // MOBILE | TABLET | DESKTOP | UNKNOWN — устройство на старте диагностики
```

- [ ] **Step 3: Сгенерировать клиент и проверить типы**

```bash
pnpm db:generate
pnpm typecheck
```
Expected: обе команды проходят. `prisma generate` печатает `Generated Prisma Client`.

⚠️ Только `generate`. **Не запускать** `db:push`, `migrate dev`, `migrate deploy`.

- [ ] **Step 4: Написать скрипт миграции**

Создать `scripts/migrate-content-journal.ts` (шаблон — `scripts/migrate-emergency-block-event-day.ts`):

```ts
/**
 * Аддитивная миграция журнала контента через Supabase Mgmt API:
 *   ContentView, UserDeviceDay, DiagnosticSession.device
 * Forward-only, идемпотентно (IF NOT EXISTS). Токен — из .secrets/supabase-mgmt-token.md.
 * Запуск: NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/migrate-content-journal.ts
 */
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

const PROJECT_REF = 'saecuecevicwjkpmaoot';
const SQL = `
CREATE TABLE IF NOT EXISTS "ContentView" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "lessonId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "device" TEXT NOT NULL,
  "activeSeconds" INTEGER NOT NULL DEFAULT 0,
  "maxPercent" INTEGER NOT NULL DEFAULT 0,
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContentView_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ContentView_lessonId_startedAt_idx" ON "ContentView"("lessonId","startedAt");
CREATE INDEX IF NOT EXISTS "ContentView_courseId_startedAt_idx" ON "ContentView"("courseId","startedAt");
CREATE INDEX IF NOT EXISTS "ContentView_userId_startedAt_idx" ON "ContentView"("userId","startedAt");
CREATE INDEX IF NOT EXISTS "ContentView_startedAt_idx" ON "ContentView"("startedAt");

CREATE TABLE IF NOT EXISTS "UserDeviceDay" (
  "userId" TEXT NOT NULL,
  "day" DATE NOT NULL,
  "device" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserDeviceDay_pkey" PRIMARY KEY ("userId","day","device")
);
CREATE INDEX IF NOT EXISTS "UserDeviceDay_day_idx" ON "UserDeviceDay"("day");

ALTER TABLE "DiagnosticSession" ADD COLUMN IF NOT EXISTS "device" TEXT;
`;

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
  console.log('✅ migration applied. Response:', body.slice(0, 200) || '(empty)');
})().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 5: Проверить SQL глазами и применить**

Сначала убедиться, что в скрипте нет разрушительных операций:

```bash
grep -nE "DROP|TRUNCATE|ALTER COLUMN|DELETE FROM" scripts/migrate-content-journal.ts
```
Expected: пусто. Если что-то нашлось — **остановиться и разобраться**, не запускать.

**Спросить у владельца подтверждение на применение DDL к проду.** После «да»:

```bash
NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/migrate-content-journal.ts
```
Expected: `✅ migration applied.`

- [ ] **Step 6: Проверить, что объекты появились**

```bash
NODE_OPTIONS=--dns-result-order=ipv4first npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  console.log('ContentView rows:', await p.contentView.count());
  console.log('UserDeviceDay rows:', await p.userDeviceDay.count());
  const s = await p.diagnosticSession.findFirst({ select: { id: true, device: true } });
  console.log('DiagnosticSession.device доступна:', s === null || 'device' in s);
  await p.\$disconnect();
})();
"
```
Expected: обе таблицы существуют и пусты (`0`), колонка `device` читается.

- [ ] **Step 7: Коммит**

```bash
git add packages/db/prisma/schema.prisma scripts/migrate-content-journal.ts
git commit -m "feat(db): ContentView + UserDeviceDay tables, DiagnosticSession.device

Аддитивная миграция через Mgmt API — prisma db push против этой базы
запрещён (инцидент 2026-05-12). Без FK, как UserActivityDay: каскады на
общей прод-базе однажды уже стоили 24 таблицы. Применена до кода, иначе
хартбит начал бы писать в несуществующую таблицу у каждого юзера."
```

---

### Task 4: Запись устройства в хартбите

Второй upsert рядом с существующим `UserActivityDay`. Место выбрано потому, что там уже есть дебаунс в пять минут и уже есть изоляция ошибок — добавление не меняет ни поведения, ни профиля нагрузки, и не требует ни строчки на клиенте.

**Files:**
- Modify: `packages/api/src/trpc.ts:60-71`
- Create: `packages/api/src/__tests__/heartbeat-device.test.ts`

**Interfaces:**
- Consumes: `parseDeviceType` из `@mpstats/shared` (Task 1), модель `userDeviceDay` (Task 3)
- Produces: строки в `UserDeviceDay`. Ничего не экспортирует.

- [ ] **Step 1: Написать падающий тест**

Создать `packages/api/src/__tests__/heartbeat-device.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { router, protectedProcedure } from '../trpc';

/**
 * Хартбит — fire-and-forget внутри middleware, поэтому проверяем его через
 * реальную процедуру и микрозадачную паузу, а не напрямую.
 */
function makeHarness(userAgent: string | null, opts: { failDeviceUpsert?: boolean } = {}) {
  const userDeviceDay = {
    upsert: vi.fn().mockImplementation(() =>
      opts.failDeviceUpsert ? Promise.reject(new Error('boom')) : Promise.resolve({})
    ),
  };
  const prisma = {
    userProfile: {
      findUnique: vi.fn().mockResolvedValue({ lastActiveAt: null }),
      update: vi.fn().mockResolvedValue({}),
    },
    userActivityDay: { upsert: vi.fn().mockResolvedValue({}) },
    userDeviceDay,
  };
  const testRouter = router({
    ping: protectedProcedure.query(() => 'pong'),
  });
  const caller = testRouter.createCaller({
    prisma, user: { id: 'u1' }, ip: null, userAgent,
  } as any);
  return { caller, prisma };
}

const flush = () => new Promise((r) => setTimeout(r, 10));

describe('heartbeat: запись устройства', () => {
  it('десктопный UA → upsert с device DESKTOP', async () => {
    const { caller, prisma } = makeHarness(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    );
    expect(await caller.ping()).toBe('pong');
    await flush();
    expect(prisma.userDeviceDay.upsert).toHaveBeenCalledTimes(1);
    const arg = prisma.userDeviceDay.upsert.mock.calls[0][0];
    expect(arg.create).toMatchObject({ userId: 'u1', device: 'DESKTOP' });
    expect(arg.update).toEqual({});
  });

  it('мобильный UA → device MOBILE', async () => {
    const { caller, prisma } = makeHarness(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    );
    await caller.ping();
    await flush();
    expect(prisma.userDeviceDay.upsert.mock.calls[0][0].create).toMatchObject({ device: 'MOBILE' });
  });

  it('без UA → device UNKNOWN', async () => {
    const { caller, prisma } = makeHarness(null);
    await caller.ping();
    await flush();
    expect(prisma.userDeviceDay.upsert.mock.calls[0][0].create).toMatchObject({ device: 'UNKNOWN' });
  });

  it('упавшая запись устройства не роняет запрос и не мешает lastActiveAt', async () => {
    const { caller, prisma } = makeHarness('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', { failDeviceUpsert: true });
    expect(await caller.ping()).toBe('pong');
    await flush();
    expect(prisma.userProfile.update).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `pnpm --filter @mpstats/api test -- heartbeat-device`
Expected: FAIL — `prisma.userDeviceDay.upsert` вызван 0 раз.

- [ ] **Step 3: Реализовать**

В `packages/api/src/trpc.ts` добавить импорт в шапку файла:

```ts
import { parseDeviceType } from '@mpstats/shared';
```

Затем в `protectedProcedure`, сразу после блока `try { ctx.prisma.userActivityDay.upsert(...) } catch (...)` и **до** `return ctx.prisma.userProfile.update(...)`, вставить:

```ts
      // Тип устройства за день. Отдельная таблица (PK userId+day+device):
      // несколько строк за день на человека — это и есть сигнал «переходы
      // между устройствами». Своя изоляция ошибок, как у userActivityDay.
      try {
        const device = parseDeviceType(ctx.userAgent);
        ctx.prisma.userDeviceDay.upsert({
          where: { userId_day_device: { userId, day, device } },
          create: { userId, day, device },
          update: {},
        }).catch(err => {
          console.error('[tRPC] userDeviceDay upsert failed:', err);
        });
      } catch (err) {
        console.error('[tRPC] userDeviceDay upsert threw:', err);
      }
```

- [ ] **Step 4: Прогнать тесты**

Run: `pnpm --filter @mpstats/api test -- heartbeat-device`
Expected: PASS, 4 теста.

- [ ] **Step 5: Убедиться, что ничего не сломано**

Run: `pnpm --filter @mpstats/api test`
Expected: PASS, все существующие тесты зелёные.

- [ ] **Step 6: Коммит**

```bash
git add packages/api/src/trpc.ts packages/api/src/__tests__/heartbeat-device.test.ts
git commit -m "feat(analytics): record device type in existing heartbeat

Рядом с userActivityDay: там уже дебаунс 5 минут и уже изоляция ошибок,
поэтому второй upsert не меняет профиль нагрузки и не требует правок
на клиенте — ctx.userAgent уже есть в контексте tRPC."
```

---

### Task 5: Роутер журнала просмотров

Пара мутаций в своём неймспейсе. Намеренно не встраивается в `learning.saveWatchProgress`: у того логика «без регрессий» — он держит максимум процента и не откатывает `COMPLETED`, что верно для состояния и неверно для журнала. Журналу нужен честный факт каждого захода, включая тот, где посмотрели меньше, чем в прошлый раз.

**Files:**
- Create: `packages/api/src/routers/content-view.ts`
- Create: `packages/api/src/routers/__tests__/content-view.test.ts`
- Modify: `packages/api/src/root.ts`

**Interfaces:**
- Consumes: `parseDeviceType` из `@mpstats/shared` (Task 1), модель `contentView` (Task 3)
- Produces: роутер `contentViewRouter`, подключённый в `appRouter` под ключом `contentView`. Клиент вызывает:
  - `contentView.startView({ lessonId: string }) → { viewId: string | null }`
  - `contentView.pingView({ viewId: string, activeSeconds: number, percent: number, completed?: boolean }) → { ok: boolean }`

- [ ] **Step 1: Написать падающий тест**

Создать `packages/api/src/routers/__tests__/content-view.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import { contentViewRouter } from '../content-view';

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';

function makeCtx(overrides: Record<string, any> = {}, userAgent: string | null = DESKTOP_UA) {
  const prisma = {
    userProfile: { findUnique: vi.fn().mockResolvedValue({ lastActiveAt: new Date() }), update: vi.fn() },
    userActivityDay: { upsert: vi.fn().mockResolvedValue({}) },
    userDeviceDay: { upsert: vi.fn().mockResolvedValue({}) },
    lesson: {
      findUnique: vi.fn().mockResolvedValue({ courseId: '01_analytics', contentType: 'VIDEO' }),
    },
    contentView: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'view-1' }),
      update: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
  };
  return {
    caller: contentViewRouter.createCaller({ prisma, user: { id: 'u1' }, ip: null, userAgent } as any),
    prisma,
  };
}

describe('contentView.startView', () => {
  const OLD = process.env.CONTENT_JOURNAL_ENABLED;
  afterEach(() => { process.env.CONTENT_JOURNAL_ENABLED = OLD; });

  it('флаг off → no-op, строка не создаётся', async () => {
    process.env.CONTENT_JOURNAL_ENABLED = 'false';
    const { caller, prisma } = makeCtx();
    expect(await caller.startView({ lessonId: 'L1' })).toEqual({ viewId: null });
    expect(prisma.contentView.create).not.toHaveBeenCalled();
  });

  it('флаг on → создаёт строку с курсом, типом и устройством', async () => {
    process.env.CONTENT_JOURNAL_ENABLED = 'true';
    const { caller, prisma } = makeCtx();
    expect(await caller.startView({ lessonId: 'L1' })).toEqual({ viewId: 'view-1' });
    expect(prisma.contentView.create.mock.calls[0][0].data).toMatchObject({
      userId: 'u1', lessonId: 'L1', courseId: '01_analytics',
      contentType: 'VIDEO', device: 'DESKTOP',
    });
  });

  it('свежая строка в окне дедупликации → возвращает её, новую не создаёт', async () => {
    process.env.CONTENT_JOURNAL_ENABLED = 'true';
    const { caller, prisma } = makeCtx({
      contentView: {
        findFirst: vi.fn().mockResolvedValue({ id: 'existing' }),
        findUnique: vi.fn(), create: vi.fn(), update: vi.fn(),
      },
    });
    expect(await caller.startView({ lessonId: 'L1' })).toEqual({ viewId: 'existing' });
    expect(prisma.contentView.create).not.toHaveBeenCalled();
  });

  it('окно дедупликации — ровно 2 минуты назад', async () => {
    process.env.CONTENT_JOURNAL_ENABLED = 'true';
    const { caller, prisma } = makeCtx();
    const before = Date.now();
    await caller.startView({ lessonId: 'L1' });
    const gte = prisma.contentView.findFirst.mock.calls[0][0].where.updatedAt.gte as Date;
    expect(before - gte.getTime()).toBeGreaterThanOrEqual(120_000);
    expect(before - gte.getTime()).toBeLessThan(125_000);
  });

  it('несуществующий урок → viewId null', async () => {
    process.env.CONTENT_JOURNAL_ENABLED = 'true';
    const { caller, prisma } = makeCtx({ lesson: { findUnique: vi.fn().mockResolvedValue(null) } });
    expect(await caller.startView({ lessonId: 'nope' })).toEqual({ viewId: null });
    expect(prisma.contentView.create).not.toHaveBeenCalled();
  });

  it('падение БД не пробрасывается наружу', async () => {
    process.env.CONTENT_JOURNAL_ENABLED = 'true';
    const { caller } = makeCtx({
      contentView: {
        findFirst: vi.fn().mockRejectedValue(new Error('db down')),
        findUnique: vi.fn(), create: vi.fn(), update: vi.fn(),
      },
    });
    expect(await caller.startView({ lessonId: 'L1' })).toEqual({ viewId: null });
  });
});

describe('contentView.pingView', () => {
  const OLD = process.env.CONTENT_JOURNAL_ENABLED;
  afterEach(() => { process.env.CONTENT_JOURNAL_ENABLED = OLD; });

  function ctxWithView(view: any) {
    return makeCtx({
      contentView: {
        findFirst: vi.fn(),
        findUnique: vi.fn().mockResolvedValue(view),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
    });
  }

  it('флаг off → no-op', async () => {
    process.env.CONTENT_JOURNAL_ENABLED = 'false';
    const { caller, prisma } = ctxWithView({ userId: 'u1', activeSeconds: 0, maxPercent: 0, completed: false });
    expect(await caller.pingView({ viewId: 'v1', activeSeconds: 30, percent: 10 })).toEqual({ ok: false });
    expect(prisma.contentView.update).not.toHaveBeenCalled();
  });

  it('пишет накопленные секунды и процент', async () => {
    process.env.CONTENT_JOURNAL_ENABLED = 'true';
    const { caller, prisma } = ctxWithView({ userId: 'u1', activeSeconds: 10, maxPercent: 5, completed: false });
    expect(await caller.pingView({ viewId: 'v1', activeSeconds: 30, percent: 40 })).toEqual({ ok: true });
    expect(prisma.contentView.update.mock.calls[0][0].data).toMatchObject({
      activeSeconds: 30, maxPercent: 40, completed: false,
    });
  });

  it('пинг с меньшим значением не уменьшает накопленное', async () => {
    process.env.CONTENT_JOURNAL_ENABLED = 'true';
    const { caller, prisma } = ctxWithView({ userId: 'u1', activeSeconds: 50, maxPercent: 60, completed: false });
    await caller.pingView({ viewId: 'v1', activeSeconds: 20, percent: 30 });
    expect(prisma.contentView.update.mock.calls[0][0].data).toMatchObject({
      activeSeconds: 50, maxPercent: 60,
    });
  });

  it('завершённость не откатывается', async () => {
    process.env.CONTENT_JOURNAL_ENABLED = 'true';
    const { caller, prisma } = ctxWithView({ userId: 'u1', activeSeconds: 50, maxPercent: 95, completed: true });
    await caller.pingView({ viewId: 'v1', activeSeconds: 60, percent: 95, completed: false });
    expect(prisma.contentView.update.mock.calls[0][0].data).toMatchObject({ completed: true });
  });

  it('чужой viewId → отказ без записи', async () => {
    process.env.CONTENT_JOURNAL_ENABLED = 'true';
    const { caller, prisma } = ctxWithView({ userId: 'someone-else', activeSeconds: 0, maxPercent: 0, completed: false });
    expect(await caller.pingView({ viewId: 'v1', activeSeconds: 30, percent: 10 })).toEqual({ ok: false });
    expect(prisma.contentView.update).not.toHaveBeenCalled();
  });

  it('несуществующий viewId → отказ', async () => {
    process.env.CONTENT_JOURNAL_ENABLED = 'true';
    const { caller, prisma } = ctxWithView(null);
    expect(await caller.pingView({ viewId: 'ghost', activeSeconds: 30, percent: 10 })).toEqual({ ok: false });
    expect(prisma.contentView.update).not.toHaveBeenCalled();
  });

  it('процент вне 0..100 → zod reject', async () => {
    process.env.CONTENT_JOURNAL_ENABLED = 'true';
    const { caller } = ctxWithView({ userId: 'u1', activeSeconds: 0, maxPercent: 0, completed: false });
    await expect(caller.pingView({ viewId: 'v1', activeSeconds: 10, percent: 101 })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `pnpm --filter @mpstats/api test -- content-view`
Expected: FAIL — `Failed to resolve import "../content-view"`.

- [ ] **Step 3: Реализовать роутер**

Создать `packages/api/src/routers/content-view.ts`:

```ts
import { z } from 'zod';
import { parseDeviceType } from '@mpstats/shared';
import { router, protectedProcedure } from '../trpc';

/**
 * Журнал заходов в урок. Намеренно отдельно от learning.saveWatchProgress:
 * у того логика «без регрессий» (держит максимум, не откатывает COMPLETED),
 * что верно для состояния и неверно для журнала — журналу нужен честный факт
 * каждого захода, включая тот, где посмотрели меньше, чем в прошлый раз.
 *
 * Весь роутер — побочный эффект: он не имеет права уронить страницу урока.
 * Любая ошибка проглатывается, наружу уходит null/false, клиент просто
 * перестаёт пинговать.
 */

/** Гасит двойной монтаж React и случайный рефетч. Реальный повторный заход
 *  в тот же урок за две минуты — не осмысленное действие. */
const DEDUP_WINDOW_MS = 2 * 60 * 1000;

export const contentViewRouter = router({
  startView: protectedProcedure
    .input(z.object({ lessonId: z.string().min(1) }))
    .mutation(async ({ ctx, input }): Promise<{ viewId: string | null }> => {
      if (process.env.CONTENT_JOURNAL_ENABLED !== 'true') return { viewId: null };
      try {
        const recent = await ctx.prisma.contentView.findFirst({
          where: {
            userId: ctx.user.id,
            lessonId: input.lessonId,
            updatedAt: { gte: new Date(Date.now() - DEDUP_WINDOW_MS) },
          },
          orderBy: { updatedAt: 'desc' },
          select: { id: true },
        });
        if (recent) return { viewId: recent.id };

        const lesson = await ctx.prisma.lesson.findUnique({
          where: { id: input.lessonId },
          select: { courseId: true, contentType: true },
        });
        if (!lesson) return { viewId: null };

        const view = await ctx.prisma.contentView.create({
          data: {
            userId: ctx.user.id,
            lessonId: input.lessonId,
            courseId: lesson.courseId,
            contentType: lesson.contentType,
            device: parseDeviceType(ctx.userAgent),
          },
          select: { id: true },
        });
        return { viewId: view.id };
      } catch (err) {
        console.error('[contentView.startView] failed:', err);
        return { viewId: null };
      }
    }),

  pingView: protectedProcedure
    .input(z.object({
      viewId: z.string().min(1),
      // Потолок в сутки — защита от испорченного клиентского счётчика.
      activeSeconds: z.number().int().min(0).max(86_400),
      percent: z.number().int().min(0).max(100),
      completed: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }): Promise<{ ok: boolean }> => {
      if (process.env.CONTENT_JOURNAL_ENABLED !== 'true') return { ok: false };
      try {
        const current = await ctx.prisma.contentView.findUnique({
          where: { id: input.viewId },
          select: { userId: true, activeSeconds: true, maxPercent: true, completed: true },
        });
        // Проверка владельца обязательна: viewId приходит с клиента.
        if (!current || current.userId !== ctx.user.id) return { ok: false };

        // Максимум, а не присланное значение: пинги могут прийти не по порядку.
        await ctx.prisma.contentView.update({
          where: { id: input.viewId },
          data: {
            activeSeconds: Math.max(current.activeSeconds, input.activeSeconds),
            maxPercent: Math.max(current.maxPercent, input.percent),
            completed: current.completed || input.completed === true,
          },
        });
        return { ok: true };
      } catch (err) {
        console.error('[contentView.pingView] failed:', err);
        return { ok: false };
      }
    }),
});
```

- [ ] **Step 4: Подключить в корневой роутер**

В `packages/api/src/root.ts` добавить импорт после `import { offerRouter } from './routers/offer';`:

```ts
import { contentViewRouter } from './routers/content-view';
```

и ключ в `appRouter` после `offer: offerRouter,`:

```ts
  contentView: contentViewRouter,
```

- [ ] **Step 5: Прогнать тесты**

Run: `pnpm --filter @mpstats/api test -- content-view`
Expected: PASS, 13 тестов.

- [ ] **Step 6: Проверить типы**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Коммит**

```bash
git add packages/api/src/routers/content-view.ts packages/api/src/routers/__tests__/content-view.test.ts packages/api/src/root.ts
git commit -m "feat(analytics): contentView.startView/pingView journal mutations

Отдельно от saveWatchProgress намеренно: у того логика «без регрессий»,
журналу же нужен честный факт каждого захода. Проверка владельца viewId
обязательна — идентификатор приходит с клиента. Под CONTENT_JOURNAL_ENABLED."
```

---

### Task 6: Устройство на старте диагностики

Одна строчка в существующей мутации, чтобы «устройство во время диагностики» бралось из факта, а не восстанавливалось сопоставлением по дате.

**Files:**
- Modify: `packages/api/src/routers/diagnostic.ts:575-582`
- Create: `packages/api/src/routers/__tests__/diagnostic-device.test.ts`

**Interfaces:**
- Consumes: `parseDeviceType` из `@mpstats/shared` (Task 1), поле `DiagnosticSession.device` (Task 3)
- Produces: заполненное поле `device` у новых сессий диагностики.

- [ ] **Step 1: Написать падающий тест**

Мутация `startSession` (строка 545) до создания сессии ходит в БД четырежды: `ensureUserProfile` → `userProfile.upsert`, затем `diagnosticSession.updateMany` (гасит прошлые сессии), `userProfile.findUnique` (маркетплейсы для выбора колоды), и уже потом `diagnosticSession.create`. После создания — чистые функции сборки колоды и финальный `diagnosticSession.update`. Все пять моков ниже, поэтому мутация проходит целиком и глотать ошибку не нужно.

Пользователи в тестах разные: `checkRateLimit` держит счётчик в памяти по идентификатору, и одинаковый id мог бы упереться в лимит.

Создать `packages/api/src/routers/__tests__/diagnostic-device.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { diagnosticRouter } from '../diagnostic';

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function makeCtx(userId: string, userAgent: string | null) {
  const create = vi.fn().mockResolvedValue({ id: 'session-1', userId, currentQuestion: 0 });
  const prisma = {
    userProfile: {
      upsert: vi.fn().mockResolvedValue({ id: userId }),
      findUnique: vi.fn().mockResolvedValue({ marketplaces: ['WB'], lastActiveAt: new Date() }),
      update: vi.fn().mockResolvedValue({}),
    },
    userActivityDay: { upsert: vi.fn().mockResolvedValue({}) },
    userDeviceDay: { upsert: vi.fn().mockResolvedValue({}) },
    diagnosticSession: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create,
      update: vi.fn().mockResolvedValue({ id: 'session-1' }),
    },
  };
  return {
    caller: diagnosticRouter.createCaller({ prisma, user: { id: userId }, ip: null, userAgent } as any),
    create,
  };
}

describe('diagnostic.startSession: устройство', () => {
  it('мобильный UA → device MOBILE в создаваемой сессии', async () => {
    const { caller, create } = makeCtx('u-mobile', IPHONE_UA);
    const result = await caller.startSession();
    expect(result.status).toBe('IN_PROGRESS');
    expect(create.mock.calls[0][0].data).toMatchObject({ userId: 'u-mobile', device: 'MOBILE' });
  });

  it('без UA → device UNKNOWN', async () => {
    const { caller, create } = makeCtx('u-nodevice', null);
    await caller.startSession();
    expect(create.mock.calls[0][0].data).toMatchObject({ device: 'UNKNOWN' });
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `pnpm --filter @mpstats/api test -- diagnostic-device`
Expected: FAIL — в `create` нет поля `device`.

- [ ] **Step 3: Реализовать**

В `packages/api/src/routers/diagnostic.ts` добавить импорт в шапку:

```ts
import { parseDeviceType } from '@mpstats/shared';
```

(если `@mpstats/shared` там уже импортируется — добавить `parseDeviceType` в существующий импорт, а не заводить второй)

В блоке создания сессии (строка ~575) добавить поле:

```ts
      const session = await ctx.prisma.diagnosticSession.create({
        data: {
          userId: ctx.user.id,
          status: 'IN_PROGRESS',
          currentQuestion: 0,
          questions: [] as any,
          device: parseDeviceType(ctx.userAgent),
        },
      });
```

- [ ] **Step 4: Прогнать тесты**

Run: `pnpm --filter @mpstats/api test`
Expected: PASS — новые 2 теста зелёные, существующие тесты диагностики не сломаны.

- [ ] **Step 5: Коммит**

```bash
git add packages/api/src/routers/diagnostic.ts packages/api/src/routers/__tests__/diagnostic-device.test.ts
git commit -m "feat(analytics): record device on diagnostic session start

Из факта, а не сопоставлением по дате: методологи просят «устройство во
время диагностики», а UserDeviceDay даёт только день."
```

---

### Task 7: Клиентский хук журнала

Хук, который заводит просмотр при открытии урока, копит активное время и досылает его. Один на оба места, где показываются уроки.

Для видеоуроков время считается по сдвигу позиции плеера. Для текстовых и интерактивных плеера нет, поэтому хук тикает сам раз в секунду, пока вкладка видима, — и передаёт наверх синтетическую позицию, чтобы работал тот же накопитель из Task 2.

**Files:**
- Create: `apps/web/src/lib/analytics/useContentView.ts`

**Interfaces:**
- Consumes: `accumulateActiveSeconds` из `@mpstats/shared` (Task 2), мутации `contentView.startView` / `contentView.pingView` (Task 5)
- Produces:
  - `useContentView(lessonId: string, options?: { hasPlayer?: boolean }): { trackPosition: (position: number, duration: number) => void }`
  - При `hasPlayer: false` (по умолчанию) хук тикает сам; `trackPosition` вызывать не нужно.
  - При `hasPlayer: true` потребитель обязан звать `trackPosition` из `onTimeUpdate` плеера.

- [ ] **Step 1: Создать хук**

Создать `apps/web/src/lib/analytics/useContentView.ts`:

```ts
'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { accumulateActiveSeconds } from '@mpstats/shared';
import { trpc } from '@/lib/trpc/client';

/** Реже, чем saveWatchProgress (15с): журналу не нужна свежесть, нужна полнота. */
const PING_INTERVAL_MS = 60_000;
/** Такт собственного тикера для уроков без плеера. */
const SELF_TICK_MS = 1_000;
/** Ниже секунды писать нечего — это открыл и сразу закрыл. */
const MIN_REPORTABLE_SECONDS = 1;

/**
 * Журнал заходов в урок. Полностью побочный: если startView не сработал
 * (флаг выключен, урок не найден, БД недоступна), viewId остаётся null и хук
 * молча ничего не делает — страница урока об этом не знает.
 *
 * Пинг шлёт НАКОПЛЕННОЕ с начала просмотра, а не дельту: потерянный пинг
 * тогда не теряет данные, следующий их догоняет.
 */
export function useContentView(lessonId: string, options: { hasPlayer?: boolean } = {}) {
  const hasPlayer = options.hasPlayer ?? false;

  const viewIdRef = useRef<string | null>(null);
  const activeSecondsRef = useRef(0);
  const percentRef = useRef(0);
  const prevPositionRef = useRef(0);
  const prevTickAtRef = useRef<number | null>(null);

  const startView = trpc.contentView.startView.useMutation();
  const pingView = trpc.contentView.pingView.useMutation();

  // useMutation возвращает нестабильные ссылки — в deps их класть нельзя,
  // иначе бесконечный цикл ре-рендеров (тот же паттерн, что у saveWatchProgress).
  const startRef = useRef(startView);
  startRef.current = startView;
  const pingRef = useRef(pingView);
  pingRef.current = pingView;

  // Смена урока = новый просмотр: сбрасываем всё и заводим строку заново.
  useEffect(() => {
    viewIdRef.current = null;
    activeSecondsRef.current = 0;
    percentRef.current = 0;
    prevPositionRef.current = 0;
    prevTickAtRef.current = null;

    let cancelled = false;
    startRef.current
      .mutateAsync({ lessonId })
      .then((r) => { if (!cancelled) viewIdRef.current = r.viewId; })
      .catch(() => { /* журнал не мешает уроку */ });

    return () => { cancelled = true; };
  }, [lessonId]);

  const flush = useCallback(() => {
    const viewId = viewIdRef.current;
    if (!viewId) return;
    if (activeSecondsRef.current < MIN_REPORTABLE_SECONDS) return;
    pingRef.current.mutate({
      viewId,
      activeSeconds: Math.round(activeSecondsRef.current),
      percent: Math.round(percentRef.current),
      completed: percentRef.current >= 90,
    });
  }, []);

  const trackPosition = useCallback((position: number, duration: number) => {
    const now = Date.now();
    const prevAt = prevTickAtRef.current;
    prevTickAtRef.current = now;

    if (prevAt !== null) {
      activeSecondsRef.current = accumulateActiveSeconds({
        prevPosition: prevPositionRef.current,
        nextPosition: position,
        elapsedMs: now - prevAt,
        prevActiveSeconds: activeSecondsRef.current,
      });
    }
    prevPositionRef.current = position;
    if (duration > 0) {
      percentRef.current = Math.min(100, (position / duration) * 100);
    }
  }, []);

  // Периодический пинг + досылка при уходе. visibilitychange надёжнее
  // beforeunload на iOS Safari, поэтому слушаем оба.
  useEffect(() => {
    const interval = setInterval(flush, PING_INTERVAL_MS);
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);

  // Уроки без плеера: тикаем сами, пока вкладка видима. Синтетическая позиция
  // растёт на секунду за такт, поэтому накопитель из shared работает как есть.
  useEffect(() => {
    if (hasPlayer) return;
    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      trackPosition(prevPositionRef.current + 1, 0);
    }, SELF_TICK_MS);
    return () => clearInterval(interval);
  }, [hasPlayer, trackPosition]);

  // Стабильная ссылка обязательна: потребители кладут этот объект в deps
  // своего useCallback. Новый литерал на каждый рендер пересоздавал бы их
  // обработчики без всякой причины.
  return useMemo(() => ({ trackPosition }), [trackPosition]);
}
```

- [ ] **Step 2: Проверить типы и сборку**

```bash
pnpm typecheck
pnpm --filter web build
```
Expected: обе проходят.

`build` здесь обязателен, не только `typecheck`: `next build` ловит затягивание server-only кода в клиентский бандл, а `tsc --noEmit` — нет. Хук импортирует значение (не тип) из барреля `@mpstats/shared`; если сборка упадёт с «needs server-only», значит в барреле появился серверный импорт — тогда импортировать `accumulateActiveSeconds` напрямую из `@mpstats/shared/src/active-time` вместо барреля.

- [ ] **Step 3: Коммит**

```bash
git add apps/web/src/lib/analytics/useContentView.ts
git commit -m "feat(analytics): useContentView hook

Заводит просмотр, копит активное время, досылает раз в минуту и при уходе.
Шлёт накопленное, а не дельту: потерянный пинг тогда догоняется следующим.
Уроки без плеера тикают сами, пока вкладка видима."
```

---

### Task 8: Подключить хук к страницам уроков

Два потребителя: основная страница урока академии и партнёрская страница курса MPSTATS. Партнёрский курс подключаем тоже — стоит три строки, а неполный журнал оставил бы вечную звёздочку во всех отчётах.

**Files:**
- Modify: `apps/web/src/app/(main)/learn/[id]/page.tsx` (хуки ~строка 310, `handleTimeUpdate` ~строка 407)
- Modify: `apps/web/src/components/mpstats-tools/PartnerLessonView.tsx` (хуки ~строка 177, `handleTimeUpdate` ~строка 197)

**Interfaces:**
- Consumes: `useContentView` (Task 7)
- Produces: реальные строки в `ContentView` при открытии уроков.

- [ ] **Step 1: Подключить на основной странице урока**

В `apps/web/src/app/(main)/learn/[id]/page.tsx` добавить импорт к остальным импортам из `@/lib`:

```ts
import { useContentView } from '@/lib/analytics/useContentView';
```

Сразу после `const { data: watchProgress } = trpc.learning.getWatchProgress.useQuery({ lessonId });` (строка 319) добавить:

```ts
  // Журнал заходов (аналитика контента). Полностью побочный — на урок не влияет.
  // Страница рендерит плеер только для VIDEO (строка 710); для TEXT/INTERACTIVE
  // onTimeUpdate не сработает, и хук должен тикать сам.
  const contentView = useContentView(lessonId, {
    hasPlayer: data?.lesson?.contentType === 'VIDEO',
  });
```

Затем в `handleTimeUpdate` (строка ~407) добавить вызов первой строкой тела и `contentView` в зависимости:

```ts
  const handleTimeUpdate = useCallback((currentTime: number, duration: number) => {
    contentView.trackPosition(currentTime, duration);
    lastPositionRef.current = currentTime;
    lastDurationRef.current = duration;

    // ... остальное тело без изменений
  }, [lessonId, contentView]);
```

`trackPosition` обёрнут в `useCallback` с пустыми deps, а сам возвращаемый объект — в `useMemo`, поэтому ссылка стабильна и цикла пересозданий не будет.

- [ ] **Step 2: Подключить на партнёрской странице**

`apps/web/src/components/mpstats-tools/PartnerLessonView.tsx` устроен зеркально основной странице: компонент принимает `{ lessonId }` (строка 164), у него есть свой `handleTimeUpdate` с той же троттлящей логикой (строка 197) и он уже передаёт его в плеер (строка 362). Партнёрские уроки все видео (`hasVideo = !!lesson.videoId`, строка 335), текстовых там нет.

Добавить импорт:

```ts
import { useContentView } from '@/lib/analytics/useContentView';
```

После `const { data: watchProgress } = trpc.learning.getWatchProgress.useQuery({ lessonId });` (строка 178) добавить:

```ts
  const contentView = useContentView(lessonId, { hasPlayer: true });
```

И в `handleTimeUpdate` (строка 197) — вызов первой строкой тела плюс зависимость:

```ts
  const handleTimeUpdate = useCallback(
    (currentTime: number, duration: number) => {
      contentView.trackPosition(currentTime, duration);
      lastPositionRef.current = currentTime;
      lastDurationRef.current = duration;

      // ... остальное тело без изменений
    },
    [lessonId, contentView]
  );
```

- [ ] **Step 3: Проверить типы и сборку**

```bash
pnpm typecheck
pnpm --filter web build
```
Expected: обе проходят.

- [ ] **Step 4: Прогнать все тесты**

Run: `pnpm test`
Expected: PASS, регрессий нет.

- [ ] **Step 5: Коммит**

```bash
git add "apps/web/src/app/(main)/learn/[id]/page.tsx" apps/web/src/components/mpstats-tools/PartnerLessonView.tsx
git commit -m "feat(analytics): wire content journal into lesson pages

Партнёрский курс тоже: три строки кода против вечной звёздочки
«кроме MPSTATS-инструментов» во всех будущих отчётах."
```

---

### Task 9: Флаг окружения и проверка на staging

Финальная задача: включить сбор на staging, убедиться, что данные ложатся правильно, и что выключенный рубильник действительно всё останавливает.

**Files:**
- Modify: `.env.example` (если файл есть в репозитории — проверить `ls -a`)
- Modify: `.env.staging` на VPS (не в репозитории)

**Interfaces:**
- Consumes: всё предыдущее
- Produces: работающий сбор на staging и подтверждённые цифры.

- [ ] **Step 1: Задокументировать флаг**

Если в репозитории есть `.env.example` — добавить строку с комментарием:

```
# Журнал заходов в уроки и устройства (аналитика контента). 'true' включает запись.
CONTENT_JOURNAL_ENABLED=false
```

Если файла нет — пропустить шаг, флаг описан в спеке.

- [ ] **Step 2: Выкатить на staging**

```bash
ssh deploy@89.208.106.208
cd /home/deploy/maal
git fetch origin && git checkout feature/content-device-analytics && git pull
echo 'CONTENT_JOURNAL_ENABLED=true' >> .env.staging
docker compose -p maal-staging -f docker-compose.staging.yml build --no-cache web
docker compose -p maal-staging -f docker-compose.staging.yml up -d
```

`--no-cache` обязателен: менялись `.ts`/`.tsx`.

⚠️ После проверки обязательно `git checkout master` на VPS, до любого следующего прод-деплоя.

- [ ] **Step 3: Проверить сценарии вручную**

Зайти на https://staging.platform.mpstats.academy под `staging-check@mpstats.academy` / `StagingCheck2026!` и выполнить:

1. С телефона открыть видеоурок, посмотреть ~2 минуты, уйти со страницы.
2. Открыть тот же урок повторно (спустя больше двух минут).
3. Зайти с ноутбука, открыть любой урок.
4. Начать диагностику.

- [ ] **Step 4: Проверить данные запросом**

```bash
NODE_OPTIONS=--dns-result-order=ipv4first npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const views = await p.contentView.findMany({
    orderBy: { startedAt: 'desc' }, take: 10,
    select: { lessonId: true, contentType: true, device: true, activeSeconds: true, maxPercent: true, completed: true, startedAt: true },
  });
  console.table(views);
  console.log('devices:', await p.userDeviceDay.findMany({ orderBy: { day: 'desc' }, take: 10 }));
  console.log('diagnostic:', await p.diagnosticSession.findMany({
    orderBy: { startedAt: 'desc' }, take: 3, select: { id: true, device: true, startedAt: true },
  }));
  await p.\$disconnect();
})();
"
```

Ожидаемое:
1. Просмотр с телефона — `device: 'MOBILE'`, `activeSeconds` близко к 120. **Ключевая проверка:** если там время открытой вкладки, а не просмотра, значит накопитель не работает — вернуться к Task 2 и Task 8.
2. Повторный заход — **вторая строка**, первая не переписана.
3. Заход с ноутбука — в `UserDeviceDay` за день две строки на одного пользователя.
4. `DiagnosticSession.device` заполнен.

- [ ] **Step 5: Проверить рубильник**

```bash
ssh deploy@89.208.106.208
cd /home/deploy/maal
sed -i 's/CONTENT_JOURNAL_ENABLED=true/CONTENT_JOURNAL_ENABLED=false/' .env.staging
docker compose -p maal-staging -f docker-compose.staging.yml up -d web
```

Открыть урок ещё раз, повторить запрос из шага 4. Ожидаемое: новых строк в `ContentView` **нет**, урок при этом открывается и работает нормально.

Вернуть флаг в `true` после проверки.

- [ ] **Step 6: Вернуть VPS на master**

```bash
ssh deploy@89.208.106.208 'cd /home/deploy/maal && git checkout master'
```

- [ ] **Step 7: Коммит**

```bash
git add -A
git commit -m "chore(analytics): document CONTENT_JOURNAL_ENABLED flag"
```

(если `.env.example` не менялся и коммитить нечего — пропустить)

---

## Что дальше

После прохождения Task 9 спека A завершена. Дальше:

1. **Прод-деплой** — отдельно, решением владельца. Порядок: миграция уже применена (Task 3), значит достаточно смёржить ветку в `master` и выкатить с `CONTENT_JOURNAL_ENABLED=true`.
2. **Дать журналу накопить данные** — две-четыре недели, пока делаются дашборды.
3. **Спеки B и C** — дашборд «Контент 2.0» и дашборд «Устройства». Брейнштормить отдельно, каждую со своим планом.

Сообщить методологам, что первый этап данных не показывает: это фундамент, и он молчит. Иначе через неделю прилетит «а где?».
