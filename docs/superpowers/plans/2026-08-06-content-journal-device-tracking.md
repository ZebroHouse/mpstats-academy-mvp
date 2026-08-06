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

⚠️ **Шаг 6 выполняет DDL против живой прод-базы.** Операции строго аддитивные и идемпотентные (`IF NOT EXISTS`), но перед запуском нужно явное «да» от владельца.

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

- [ ] **Step 5: Pre-flight — убедиться, что имена таблиц свободны**

`CREATE TABLE IF NOT EXISTS` молча ничего не делает, если таблица с таким именем уже есть — а в этой БД сосед однажды уже создавал свои таблицы без спроса. Перед применением DDL проверить через тот же Mgmt API fetch, что используется в скрипте:

```bash
NODE_OPTIONS=--dns-result-order=ipv4first npx tsx -e "
const { readFileSync } = require('node:fs');
const token = readFileSync('.secrets/supabase-mgmt-token.md', 'utf8').match(/sbp_[A-Za-z0-9]+/)[0];
(async () => {
  const res = await fetch('https://api.supabase.com/v1/projects/saecuecevicwjkpmaoot/database/query', {
    method: 'POST',
    headers: { Authorization: \`Bearer \${token}\`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: \`SELECT to_regclass('public.\"ContentView\"'), to_regclass('public.\"UserDeviceDay\"');\` }),
  });
  console.log(await res.text());
})();
"
```
Expected: оба значения `null`. **Если хотя бы одно не null — остановиться и разобраться с владельцем**, не запускать `CREATE TABLE IF NOT EXISTS` вслепую поверх чужой таблицы с этим именем.

- [ ] **Step 6: Проверить SQL глазами и применить**

Сначала убедиться, что в скрипте нет разрушительных операций:

```bash
grep -nE "DROP|TRUNCATE|ALTER COLUMN|DELETE FROM" scripts/migrate-content-journal.ts
```
Expected: пусто. Если что-то нашлось — **остановиться и разобраться**, не запускать.

**Спросить у владельца подтверждение на применение DDL к проду.** После «да»:

```bash
NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/migrate-content-journal.ts
```
Expected: `✅ migration applied.` ⚠️ Скрипт читает токен из `.secrets/supabase-mgmt-token.md`, а `.secrets/` в gitignore и существует только в основном чекауте — запускать из основного `MAAL`, либо сначала скопировать файл токена в этот worktree.

- [ ] **Step 7: Проверить, что объекты появились**

Count() ничего не говорит о форме таблицы — он компилируется в `SELECT COUNT(*)`, без единой колонки. Проверка должна реально задеть каждую колонку, чтобы несовпадение формы упало здесь, а не в проде рантайм-ошибкой:

```bash
NODE_OPTIONS=--dns-result-order=ipv4first npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const cv = await p.contentView.findFirst({ select: {
    id: true, userId: true, lessonId: true, courseId: true, contentType: true,
    device: true, activeSeconds: true, maxPercent: true, completed: true,
    startedAt: true, updatedAt: true,
  } });
  console.log('ContentView columns OK, row:', cv);
  const udd = await p.userDeviceDay.findFirst({ select: {
    userId: true, day: true, device: true, createdAt: true,
  } });
  console.log('UserDeviceDay columns OK, row:', udd);
  const s = await p.diagnosticSession.findFirst({ select: { id: true, device: true } });
  console.log('DiagnosticSession.device доступна:', s === null || 'device' in s);
  await p.\$disconnect();
})();
"
```
Expected: оба `findFirst` выполняются без ошибки (таблицы пустые — `null`, а не exception о несуществующей колонке), колонка `device` на `DiagnosticSession` читается.

- [ ] **Step 8: Коммит**

```bash
git add packages/db/prisma/schema.prisma scripts/migrate-content-journal.ts
git commit -m "feat(db): ContentView + UserDeviceDay tables, DiagnosticSession.device

Аддитивная миграция через Mgmt API — prisma db push против этой базы
запрещён (инцидент 2026-05-12). Без FK, как UserActivityDay: каскады на
общей прод-базе однажды уже стоили 24 таблицы. Должна быть применена до
деплоя кода, иначе хартбит начнёт писать в несуществующую таблицу у
каждого юзера."
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

> **Fix round 1 (после ревью):** ниже — уже исправленная версия. Ревью нашло пять Important-находок в исходном тексте плана: неверная колонка дедупликации (`updatedAt` вместо `startedAt`), нементальная гонка read-then-write в `pingView`, живой throw-путь через `.int()` в zod-схеме, отсутствующий тест на падение `pingView`, и врождённо гоняющийся тест окна дедупликации. Все пять — дефекты плана, не расхождения при реализации; код и тест ниже отражают исправленную версию, которая реально в репозитории.

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

// Совпадает с DEDUP_WINDOW_MS внутри content-view.ts. Не импортируем его,
// потому что модуль его не экспортирует (он приватный) — дублирование
// константы здесь честнее, чем расширять публичный API роутера ради теста.
const DEDUP_WINDOW_MS = 2 * 60 * 1000;

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
    // pingView writes via a single tagged-template $executeRaw call now
    // (Finding 2) — default to "1 row affected" so happy-path tests don't
    // need to restate it.
    $executeRaw: vi.fn().mockResolvedValue(1),
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

  it('дедуп-запрос ограничен вызывающим пользователем', async () => {
    // Minor finding: без userId в where startView мог бы отдать чужой
    // viewId — просто самый свежий заход в урок кем угодно.
    process.env.CONTENT_JOURNAL_ENABLED = 'true';
    const { caller, prisma } = makeCtx();
    await caller.startView({ lessonId: 'L1' });
    expect(prisma.contentView.findFirst.mock.calls[0][0].where.userId).toBe('u1');
  });

  it('окно дедупликации — ключ startedAt, около 2 минут назад', async () => {
    // Finding 1: было updatedAt (двигается каждым pingView → окно никогда не
    // закрывалось бы). Finding 5: было `toBeGreaterThanOrEqual(120_000)` на
    // разнице с before, что гонится с реальной задержкой между Date.now()
    // в тесте и Date.now() внутри хендлера — ловили ~1/5 падений на 1мс.
    // Берём clock и до, и после вызова: gte вычисляется где-то между ними,
    // значит gte лежит строго в [before - WINDOW, after - WINDOW]. Без
    // фейковых таймеров, без гонки, без допуска "плюс несколько мс".
    process.env.CONTENT_JOURNAL_ENABLED = 'true';
    const { caller, prisma } = makeCtx();
    const before = Date.now();
    await caller.startView({ lessonId: 'L1' });
    const after = Date.now();
    const where = prisma.contentView.findFirst.mock.calls[0][0].where;
    const gte = where.startedAt.gte as Date;
    expect(where.updatedAt).toBeUndefined();
    expect(gte.getTime()).toBeGreaterThanOrEqual(before - DEDUP_WINDOW_MS);
    expect(gte.getTime()).toBeLessThanOrEqual(after - DEDUP_WINDOW_MS);
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

  // pingView не читает строку перед записью больше (Finding 2) — сравнение
  // "накоплено vs пришло" теперь делает GREATEST внутри одного UPDATE.
  // Реальная параллельность (две вкладки бьющие в один viewId одновременно)
  // проверяется базой данных, а не юнит-тестом — это правильный трейдофф:
  // такой тест либо ничего не гонял бы по-настоящему (мок синхронный), либо
  // тестировал бы сам Postgres. Мы фиксируем контракт вокруг него: что запрос
  // атомарный, один, параметризованный и содержит GREATEST/OR.
  function ctxWithExecuteRaw(affectedRows: number) {
    return makeCtx({ $executeRaw: vi.fn().mockResolvedValue(affectedRows) });
  }

  it('флаг off → no-op', async () => {
    process.env.CONTENT_JOURNAL_ENABLED = 'false';
    const { caller, prisma } = ctxWithExecuteRaw(1);
    expect(await caller.pingView({ viewId: 'v1', activeSeconds: 30, percent: 10 })).toEqual({ ok: false });
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('пишет через атомарный UPDATE с GREATEST по обеим числовым колонкам и OR по completed', async () => {
    process.env.CONTENT_JOURNAL_ENABLED = 'true';
    const { caller, prisma } = ctxWithExecuteRaw(1);
    expect(await caller.pingView({ viewId: 'v1', activeSeconds: 30, percent: 40, completed: true })).toEqual({ ok: true });

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = prisma.$executeRaw.mock.calls[0];
    const sql = strings.join('');
    expect(sql).toContain('GREATEST("activeSeconds"');
    expect(sql).toContain('GREATEST("maxPercent"');
    expect(sql).toContain('"completed" OR');
    expect(sql).toContain('WHERE "id" =');
    expect(sql).toContain('AND "userId" =');
    // Параметры идут по месту подстановки: activeSeconds, percent, completed, viewId, userId.
    expect(values).toEqual([30, 40, true, 'v1', 'u1']);
  });

  it('completed не передан → в запрос уходит false, не undefined', async () => {
    process.env.CONTENT_JOURNAL_ENABLED = 'true';
    const { caller, prisma } = ctxWithExecuteRaw(1);
    await caller.pingView({ viewId: 'v1', activeSeconds: 30, percent: 40 });
    const [, , , completedParam] = prisma.$executeRaw.mock.calls[0];
    expect(completedParam).toBe(false);
  });

  it('0 затронутых строк (чужой или несуществующий viewId) → отказ', async () => {
    // Проверка владельца теперь живёт в самом WHERE — TOCTOU-окна между
    // "прочитали и проверили" и "записали" больше нет.
    process.env.CONTENT_JOURNAL_ENABLED = 'true';
    const { caller, prisma } = ctxWithExecuteRaw(0);
    expect(await caller.pingView({ viewId: 'v1', activeSeconds: 30, percent: 10 })).toEqual({ ok: false });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('пустой viewId → отказ без обращения к БД', async () => {
    process.env.CONTENT_JOURNAL_ENABLED = 'true';
    const { caller, prisma } = ctxWithExecuteRaw(1);
    expect(await caller.pingView({ viewId: '', activeSeconds: 30, percent: 10 })).toEqual({ ok: false });
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('дробный/NaN percent не роняет мутацию — округляется и подменяется нулём', async () => {
    // Finding 3: раньше percent был z.number().int().min(0).max(100), и
    // реальный клиент (position / duration * 100) регулярно присылает
    // дробные или временно NaN значения → zod бросал BAD_REQUEST наружу.
    process.env.CONTENT_JOURNAL_ENABLED = 'true';
    const { caller: c1, prisma: p1 } = ctxWithExecuteRaw(1);
    await expect(c1.pingView({ viewId: 'v1', activeSeconds: 10.4, percent: 42.6 })).resolves.toEqual({ ok: true });
    expect(p1.$executeRaw.mock.calls[0].slice(1, 3)).toEqual([10, 43]);

    const { caller: c2, prisma: p2 } = ctxWithExecuteRaw(1);
    await expect(c2.pingView({ viewId: 'v1', activeSeconds: 10, percent: NaN })).resolves.toEqual({ ok: true });
    expect(p2.$executeRaw.mock.calls[0].slice(1, 3)).toEqual([10, 0]);
  });

  it('percent/activeSeconds вне диапазона зажимаются, а не отклоняются', async () => {
    process.env.CONTENT_JOURNAL_ENABLED = 'true';
    const { caller, prisma } = ctxWithExecuteRaw(1);
    await caller.pingView({ viewId: 'v1', activeSeconds: 999_999, percent: 101 });
    expect(prisma.$executeRaw.mock.calls[0].slice(1, 3)).toEqual([86_400, 100]);
  });

  it('падение БД (Finding 4) не пробрасывается наружу', async () => {
    process.env.CONTENT_JOURNAL_ENABLED = 'true';
    const { caller } = makeCtx({ $executeRaw: vi.fn().mockRejectedValue(new Error('db down')) });
    await expect(caller.pingView({ viewId: 'v1', activeSeconds: 30, percent: 10 })).resolves.toEqual({ ok: false });
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
 * перестаёт пинговать. Это касается и входа: схема pingView ничего не
 * отклоняет с throw — плохой ввод превращается в 0/false внутри хендлера
 * (см. finiteOrZero ниже), а не в BAD_REQUEST наружу.
 */

/** Гасит двойной монтаж React и случайный рефетч. Реальный повторный заход
 *  в тот же урок за две минуты — не осмысленное действие. */
const DEDUP_WINDOW_MS = 2 * 60 * 1000;

/** Клиент считает activeSeconds/percent на лету (position / duration * 100) —
 *  дробные значения и временный NaN, пока плеер ещё инициализируется, это
 *  норма, а не ошибка ввода. Схема принимает любое конечное число и подменяет
 *  всё остальное нулём; обрезка в осмысленный диапазон (0..86400 / 0..100) —
 *  уже в хендлере после округления. Раньше здесь стояли .int().min().max(),
 *  и дробный процент от реального плеера ронял мутацию с BAD_REQUEST —
 *  нарушая ровно то обещание про «никогда не throw», которое даёт докстринг. */
const finiteOrZero = z.number().finite().catch(0);

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
            // startedAt, не updatedAt: updatedAt = @updatedAt и двигается
            // каждым pingView, поэтому окно на нём никогда не закрывалось бы —
            // 40 минут просмотра с релоадом посередине склеились бы в один
            // визит, и более честные (меньшие) цифры второго захода потерялись
            // бы под Math.max в pingView. startedAt неизменен и уже
            // проиндексирован (@@index([userId, startedAt])); updatedAt — нет.
            startedAt: { gte: new Date(Date.now() - DEDUP_WINDOW_MS) },
          },
          orderBy: { startedAt: 'desc' },
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
      viewId: z.string().catch(''),
      // Потолок в сутки — защита от испорченного клиентского счётчика.
      activeSeconds: finiteOrZero,
      percent: finiteOrZero,
      completed: z.any().optional().transform((v) => v === true),
    }))
    .mutation(async ({ ctx, input }): Promise<{ ok: boolean }> => {
      if (process.env.CONTENT_JOURNAL_ENABLED !== 'true') return { ok: false };
      // Пустой viewId после catch('') — тот же отказ, что раньше давал zod
      // .min(1) через throw. БД трогать незачем.
      if (!input.viewId) return { ok: false };
      try {
        const activeSeconds = Math.min(86_400, Math.max(0, Math.round(input.activeSeconds)));
        const percent = Math.min(100, Math.max(0, Math.round(input.percent)));

        // Один атомарный UPDATE вместо read-then-write. Две вкладки на одном
        // уроке делят viewId (дедуп в startView возвращает ту же строку), и
        // при read-then-write обе читают одно и то же значение до того, как
        // другая успевает записать — более поздний, но меньший write отменяет
        // более ранний больший. GREATEST в самой БД делает эту гонку
        // невозможной. WHERE несёт и проверку владельца — чужой или
        // несуществующий viewId просто не находит строк (affected = 0), без
        // отдельного окна между проверкой и записью.
        const affected = await ctx.prisma.$executeRaw`
          UPDATE "ContentView"
          SET "activeSeconds" = GREATEST("activeSeconds", ${activeSeconds}),
              "maxPercent" = GREATEST("maxPercent", ${percent}),
              "completed" = "completed" OR ${input.completed},
              "updatedAt" = NOW()
          WHERE "id" = ${input.viewId} AND "userId" = ${ctx.user.id}
        `;
        // Raw SQL обходит @updatedAt Prisma, поэтому updatedAt = NOW() выше
        // выставлен вручную.
        return { ok: affected === 1 };
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
Expected: PASS, 15 тестов (13 исходных + тест на userId в дедупе + тест на падение `pingView`, оба добавлены fix round 1). Прогнать 5 раз подряд — именно это доказывает, что тест окна дедупликации (Finding 5) больше не гоняется.

- [ ] **Step 6: Проверить типы**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Коммит**

```bash
git add packages/api/src/routers/content-view.ts packages/api/src/routers/__tests__/content-view.test.ts packages/api/src/root.ts docs/superpowers/plans/2026-08-06-content-journal-device-tracking.md
git commit -m "fix(analytics): dedup on startedAt, atomic pingView, total zod schema

Fix round 1 по итогам ревью — пять Important-находок в исходной версии:
дедуп на updatedAt никогда не закрывался (двигается каждым pingView) —
ключ startedAt, уже проиндексирован; pingView читал-потом-писал —
гонка между вкладками могла откатить activeSeconds/completed назад,
теперь один атомарный $executeRaw с GREATEST/OR, проверка владельца
в WHERE; percent/activeSeconds были .int() — дробный процент от реального
плеера ронял мутацию с BAD_REQUEST, схема теперь тотальная (finiteOrZero
+ округление/зажим в хендлере); добавлен тест на падение pingView;
тест окна дедупликации был гоняющимся (~1/5) — граничит по before/after
вместо одного Date.now()."
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

> **Fix round 1 (после ревью):** ниже — уже исправленная версия. Ревью нашло один Critical и три Important дефекта в исходном тексте плана:
> 1. **Critical — весь накопленный тайминг терялся при переходе с урока на урок.** Эффект с интервальным пингом был ключён только на `[flush]` (стабильная ссылка, никогда не меняется) — его cleanup срабатывал только на реальном размонтировании, а не на смене `lessonId`. Эффект сброса на `[lessonId]` тем временем обнулял `activeSecondsRef` при каждой смене урока раньше, чем что-либо успевало отправить накопленное. Фикс: тот же эффект дополнительно ключится на `lessonId` — React гарантирует, что все cleanup-функции отрабатывают раньше новых эффектов, так что cleanup видит ещё старые (лесона A) `viewId`/`activeSeconds`.
> 2. **Important — финальный пинг чаще всего терялся именно тогда, когда он нужнее всего.** `flush` на `pagehide` слал обычную tRPC-мутацию (обычный `fetch`), который браузер обрывает в момент фактической выгрузки страницы — любой заход короче `PING_INTERVAL_MS` (60с), закрытый закрытием вкладки, не долетал бы до сервера вовсе. Фикс: выделенный `flushOnExit`/`sendExitPing` — `navigator.sendBeacon`, при недоступности — `fetch` с `keepalive: true`, и только если оба недоступны — откат на обычную мутацию. Формат тела вручную повторяет то, что строит `httpBatchLink` из `provider.tsx` (`?batch=1` + `{"0": superjson.serialize(input)}`), а не то, что писал похожий beacon-код в `apps/web/src/app/(main)/learn/[id]/page.tsx` — тот код на поверку двойной раз кодирует JSON (`JSON.stringify({ json: JSON.stringify(...) })`) и не годится как образец.
> 3. **Important — медленный `startView` терял всё накопленное до его ответа.** Если пользователь уходил с урока раньше, чем `startView` успевал ответить, `cancelled` гасил присвоение `viewIdRef`, а `flush` выходил по null-гварду — сервер уже создал строку, но она навсегда оставалась с нулевым временем. Фикс: снимок накопленного (`exitSnapshotRef`) берётся в cleanup эффекта сброса; если `startView` резолвится уже после ухода, по снимку уходит отдельный догоняющий пинг под свежесозданный `viewId` — не трогая `viewIdRef`/`activeSecondsRef`, которые к этому моменту уже могут принадлежать следующему уроку.
> 4. **Important — переключение `hasPlayer` посреди жизни хука портило накопитель.** `prevPositionRef` общий для синтетической позиции тикера и реальной позиции плеера; при смене `hasPlayer` (например, лесон-запрос догружается — `false` → `true`) ничего не сбрасывало `prevPositionRef`/`prevTickAtRef`, и накопитель молча не считал время, пока позиция плеера не догоняла оставленное тикером значение. Фикс: сброс обоих ref'ов и на старте, и на остановке self-tick эффекта.
>
> Заодно, без отдельного severity — тикер после скрытия вкладки не сбрасывал `prevTickAtRef`, из-за чего первый тик после возврата видел огромный `elapsedMs` и добавлял потолок `MAX_TICK_SECONDS` вместо честной секунды (безобидно по амплитуде, но искажение всегда вверх на метрике, чья идея — быть честной). Фикс: `prevTickAtRef` сбрасывается в `null` и при уходе в фон (в `visibilitychange`-обработчике), и в самом тикере, когда такт пропускается из-за скрытой вкладки.
>
> Все четыре — дефекты плана, не расхождения при реализации; код ниже отражает исправленную версию, которая реально в репозитории.
>
> **Fix round 2 (после ревью Task 8) — переименование опции `hasPlayer` → `selfTick`.** Ревью Task 8 нашло, что имя `hasPlayer` отвечает не на тот вопрос. Хуку нужен ответ на «должен ли я сам вести часы», а не «есть ли на странице плеер» — эти вопросы расходятся ровно в тех случаях, когда на экране показывается не то, что подразумевает состояние плеера: урок ещё грузится, урок за paywall'ом (`LockOverlay`), видео ещё не залито. Во всех этих случаях `hasPlayer: false` заставлял хук тикать самостоятельно и приписывать секунды просмотра контенту, которого пользователь не видел — то есть журнал, единственная задача которого быть честным, писал фабрикованные данные. Фикс: опция переименована в `selfTick` (`?: boolean`, default `false`), внутреннее условие инвертировано (`if (!selfTick) return;` вместо `if (hasPlayer) return;`), JSDoc хука и эффекта переписаны под новый контракт. Оба потребителя (Task 8) передают честное условие вместо признака «есть видео». Код ниже уже отражает переименование.

Хук, который заводит просмотр при открытии урока, копит активное время и досылает его. Один на оба места, где показываются уроки.

Для видеоуроков время считается по сдвигу позиции плеера. Для текстовых и интерактивных плеера нет, поэтому хук тикает сам раз в секунду, пока вкладка видима, — и передаёт наверх синтетическую позицию, чтобы работал тот же накопитель из Task 2.

**Files:**
- Create: `apps/web/src/lib/analytics/useContentView.ts`

**Interfaces:**
- Consumes: `accumulateActiveSeconds` из `@mpstats/shared` (Task 2), мутации `contentView.startView` / `contentView.pingView` (Task 5)
- Produces:
  - `useContentView(lessonId: string, options?: { selfTick?: boolean }): { trackPosition: (position: number, duration: number) => void }`
  - `selfTick` — не «есть ли плеер», а «должен ли хук сам вести часы». При `selfTick: true` (default `false`) хук тикает сам; `trackPosition` вызывать не нужно. Передавать `true` только когда на экране реально показан контент, чью позицию больше некому докладывать (текстовый/интерактивный урок) — не «нет видео», иначе накопится время на скелетоне загрузки, paywall-карточке или плейсхолдере «видео готовится».
  - При `selfTick: false` потребитель обязан звать `trackPosition` из `onTimeUpdate` плеера (или не звать вовсе, если контента вообще нет — тогда честная запись это ноль).

- [ ] **Step 1: Создать хук**

Создать `apps/web/src/lib/analytics/useContentView.ts`:

```ts
'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { accumulateActiveSeconds } from '@mpstats/shared';
import superjson from 'superjson';
import { trpc } from '@/lib/trpc/client';

/** Реже, чем saveWatchProgress (15с): журналу не нужна свежесть, нужна полнота. */
const PING_INTERVAL_MS = 60_000;
/** Такт собственного тикера для уроков без плеера. */
const SELF_TICK_MS = 1_000;
/** Ниже секунды писать нечего — это открыл и сразу закрыл. */
const MIN_REPORTABLE_SECONDS = 1;

/**
 * Путь pingView в формате, который строит httpBatchLink (см. provider.tsx —
 * обе ветки splitLink батчат, простого httpLink в приложении нет): ?batch=1
 * в URL и тело {"0": superjson.serialize(input)}. Без ?batch=1
 * fetchRequestHandler разберёт тело как одиночный вызов и ждёт другой
 * конверт — ручной beacon-запрос обязан повторить именно батч-форму, иначе
 * сервер получит и молча отбросит не то, что ожидает клиент.
 */
const PING_VIEW_BEACON_URL = '/api/trpc/contentView.pingView?batch=1';

type PingPayload = { viewId: string; activeSeconds: number; percent: number; completed: boolean };

function buildBeaconBody(payload: PingPayload): string {
  return JSON.stringify({ 0: superjson.serialize(payload) });
}

/**
 * Отправляет пинг транспортом, который переживает реальную выгрузку страницы:
 * сперва sendBeacon, при его отсутствии/неудаче — fetch с keepalive (оба не
 * блокируют unload и не рвутся браузером на середине). Возвращает false,
 * только если ни один из них недоступен вовсе — тогда вызывающий код сам
 * решает, откатываться ли на обычную мутацию.
 *
 * Обычный fetch (то, что делает pingRef.current.mutate) здесь не годится:
 * браузер обрывает такой запрос в момент фактической выгрузки страницы —
 * самый частый случай, короткий заход короче PING_INTERVAL_MS, закрытый
 * закрытием вкладки, вообще не долетел бы до сервера.
 */
function sendExitPing(payload: PingPayload): boolean {
  const body = buildBeaconBody(payload);

  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    try {
      if (navigator.sendBeacon(PING_VIEW_BEACON_URL, new Blob([body], { type: 'application/json' }))) {
        return true;
      }
    } catch {
      /* sendBeacon недоступен по факту — падаем на fetch keepalive ниже */
    }
  }

  if (typeof fetch === 'function') {
    try {
      fetch(PING_VIEW_BEACON_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        keepalive: true,
        credentials: 'same-origin',
      }).catch(() => { /* best effort — страница всё равно уходит */ });
      return true;
    } catch {
      /* синхронный throw из fetch — окружение действительно не даёт beacon-транспорт */
    }
  }

  return false;
}

/**
 * Журнал заходов в урок. Полностью побочный: если startView не сработал
 * (флаг выключен, урок не найден, БД недоступна), viewId остаётся null и хук
 * молча ничего не делает — страница урока об этом не знает.
 *
 * Пинг шлёт НАКОПЛЕННОЕ с начала просмотра, а не дельту: потерянный пинг
 * тогда не теряет данные, следующий их догоняет.
 *
 * `selfTick` — не «есть ли плеер», а «должен ли хук сам вести часы».
 * Хук ведёт часы САМ только тогда, когда потребитель говорит: на экране
 * реально показывается контент, позицию которого больше некому докладывать
 * (текстовый/интерактивный урок). Во всех остальных случаях — идёт загрузка,
 * урок за paywall'ом, видео ещё не залито — на экране либо ничего, либо
 * плеер, который сам зовёт trackPosition; тикать самостоятельно значит
 * приписывать секунды просмотра тому, чего пользователь не видел.
 */
export function useContentView(lessonId: string, options: { selfTick?: boolean } = {}) {
  const selfTick = options.selfTick ?? false;

  const viewIdRef = useRef<string | null>(null);
  const activeSecondsRef = useRef(0);
  const percentRef = useRef(0);
  const prevPositionRef = useRef(0);
  const prevTickAtRef = useRef<number | null>(null);
  // Снимок накопленного на момент ухода с урока (см. эффект ниже) — на
  // случай, если startView ещё не успел ответить к этому моменту.
  const exitSnapshotRef = useRef({ activeSeconds: 0, percent: 0 });

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
      .then((r) => {
        if (cancelled) {
          // Ушли с этого урока (сменили lessonId или размонтировались) до
          // того, как startView успел ответить. viewIdRef/activeSecondsRef
          // к этому моменту уже могут принадлежать следующему уроку —
          // трогать их нельзя. Но строка на сервере уже создана, и то время,
          // что успели накопить до ухода (снято в cleanup этого же эффекта),
          // никуда не делось — досылаем его отдельным пингом под свежий
          // viewId. Без этого сервер получает фантомный нулевой визит на
          // каждый уход, случившийся быстрее ответа startView.
          const snap = exitSnapshotRef.current;
          if (r.viewId && snap.activeSeconds >= MIN_REPORTABLE_SECONDS) {
            pingRef.current.mutate({
              viewId: r.viewId,
              activeSeconds: Math.round(snap.activeSeconds),
              percent: Math.round(snap.percent),
              completed: snap.percent >= 90,
            });
          }
          return;
        }
        viewIdRef.current = r.viewId;
      })
      .catch(() => { /* журнал не мешает уроку */ });

    return () => {
      cancelled = true;
      exitSnapshotRef.current = { activeSeconds: activeSecondsRef.current, percent: percentRef.current };
    };
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

  // Досылка на реальный уход со страницы (pagehide / скрытие вкладки) —
  // тот же итог, что и flush(), но транспортом из sendExitPing, который
  // переживает выгрузку. Обычный flush() тут же и остаётся откатом, если
  // ни sendBeacon, ни fetch keepalive не доступны.
  const flushOnExit = useCallback(() => {
    const viewId = viewIdRef.current;
    if (!viewId) return;
    if (activeSecondsRef.current < MIN_REPORTABLE_SECONDS) return;
    const payload: PingPayload = {
      viewId,
      activeSeconds: Math.round(activeSecondsRef.current),
      percent: Math.round(percentRef.current),
      completed: percentRef.current >= 90,
    };
    if (!sendExitPing(payload)) {
      pingRef.current.mutate(payload);
    }
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
  // beforeunload на iOS Safari, поэтому слушаем оба. Эффект также ключится
  // на lessonId: React гарантирует, что все cleanup-функции отрабатывают
  // раньше новых эффектов, поэтому cleanup здесь видит ещё старые (лесона A)
  // viewId и activeSeconds — без lessonId в deps этот эффект пересоздаётся
  // только при размонтировании, и переход на следующий урок вообще не
  // флашил бы предыдущий (эффект сброса на [lessonId] обнулял бы refs
  // раньше, чем это тело успело бы что-то отправить).
  useEffect(() => {
    const interval = setInterval(flush, PING_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flushOnExit();
        // Тик после долгого «в фоне» иначе увидит огромный elapsedMs и на
        // возврате добавит MAX_TICK_SECONDS вместо честной одной секунды —
        // сбрасываем точку отсчёта, а не гасим накопление совсем.
        prevTickAtRef.current = null;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flushOnExit);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flushOnExit);
      flush();
    };
  }, [flush, flushOnExit, lessonId]);

  // Уроки без плеера: тикаем сами, пока вкладка видима. Синтетическая позиция
  // растёт на секунду за такт, поэтому накопитель из shared работает как есть.
  useEffect(() => {
    if (!selfTick) return;
    // selfTick может смениться после монтирования (пока урок ещё грузится
    // или пока не ясно, что показывать, потребитель передаёт false; когда
    // на экране появляется реальный текстовый/интерактивный контент — true).
    // Без сброса prevPositionRef/prevTickAtRef синтетическая позиция тикера
    // просочилась бы в пространство позиций реального плеера — тот начинает
    // отсчёт с 0, а accumulateActiveSeconds молча не считает ничего, пока
    // позиция плеера не догоняет оставленное тикером значение.
    prevPositionRef.current = 0;
    prevTickAtRef.current = null;
    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') {
        // Вкладка скрылась посреди такта — не тикаем, но и не копим elapsedMs
        // через паузу: следующий видимый тик начнёт счёт заново, а не
        // получит фантомный MAX_TICK_SECONDS на скачке времени.
        prevTickAtRef.current = null;
        return;
      }
      trackPosition(prevPositionRef.current + 1, 0);
    }, SELF_TICK_MS);
    return () => {
      clearInterval(interval);
      prevPositionRef.current = 0;
      prevTickAtRef.current = null;
    };
  }, [selfTick, trackPosition]);

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

> **Fix round 1 (после ревью) — фабрикация времени на контенте, которого пользователь не видел.** Исходная версия плана передавала `hasPlayer: contentType === 'VIDEO'` на основной странице и `hasPlayer: true` безусловно на партнёрской. Оба места ошибались в одну сторону: путали «есть плеер» с «нужно ли тикать самому».
>
> На основной странице `hasPlayer: contentType === 'VIDEO'` для **заблокированного** текстового/интерактивного урока давало `false` → хук тикал сам, пока на экране рендерился только `LockOverlay` — карточка с призывом оформить подписку, ни слова из урока. Более узкая версия той же ошибки: пока `data.lesson` ещё грузится, `contentType` не определён, `hasPlayer` тоже `false` — хук тикал на скелетоне загрузки для *любого* урока, включая видео. Малая амплитуда, тот же класс ошибки.
>
> Правильный вопрос — не «есть плеер», а «должен ли хук сам вести часы». Отсюда переименование опции в `selfTick` (Task 7, fix round 2) и честное условие на вызове: тикать самому только когда урок реально загружен, не заблокирован и не видео.
>
> На партнёрской странице ревью предложило `hasPlayer: !!lesson.videoId` (тикать, если видео ещё не залито, — на экране плейсхолдер «видео готовится к публикации»). **Это предложение отклонено.** Секунды на плейсхолдере — такая же фабрикация, как секунды на `LockOverlay`: строка с нулевой активностью там честна, смотреть было нечего. Партнёрская страница передаёт `selfTick: false` безусловно — это осознанное решение с комментарием на месте вызова, не забытый TODO.

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
  // selfTick = хук сам ведёт часы, потому что на экране реально показан
  // текстовый/интерактивный контент, чью позицию больше некому докладывать.
  // Не «нет видео» — иначе накопили бы время на скелетоне загрузки (data
  // ещё undefined) и на LockOverlay (lesson.locked, см. рендер ниже) —
  // paywall-карточка без единого слова урока. Поля locked/contentType те же,
  // что рендер-код использует для ветвления (lesson.locked, строка ~712;
  // lesson.contentType === 'VIDEO', строка ~719).
  const contentView = useContentView(lessonId, {
    selfTick: !!data?.lesson && !data.lesson.locked && data.lesson.contentType !== 'VIDEO',
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
  // Журнал заходов (аналитика контента). НИКОГДА не тикаем сами здесь —
  // намеренное решение, не забытый TODO. Партнёрские уроки все видео, и
  // когда videoId ещё не залит, страница рендерит плейсхолдер «видео готовится
  // к публикации» (см. hasVideo ниже), а не контент. Секунды на этом
  // плейсхолдере были бы такой же фабрикацией, как секунды на LockOverlay:
  // строка с нулевой активностью там — честная запись, смотреть было нечего.
  const contentView = useContentView(lessonId, { selfTick: false });
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
# Журнал заходов в урок (ContentView.startView/pingView). 'true' включает запись.
# НЕ гейтит UserDeviceDay (хартбит) и DiagnosticSession.device — те пишутся
# всегда, независимо от этого флага.
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

Открыть урок ещё раз, повторить запрос из шага 4. Ожидаемое: новых строк в `ContentView` **нет**, урок при этом открывается и работает нормально. **Не проверять это на `UserDeviceDay`/`DiagnosticSession.device` — они не гейтятся флагом и продолжат писаться; это ожидаемое поведение, не повод считать рубильник сломанным.**

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
