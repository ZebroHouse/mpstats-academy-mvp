# Phase 60 — Ambassador Referral Codes — SPEC

**Authored:** 2026-05-28
**Status:** Draft, ready for plan-phase
**Based on:** Phase 53A architecture (`apps/web/src/lib/referral/`, `packages/api/src/services/referral/`, `packages/api/src/routers/referral.ts`) + 4 owner decisions captured 2026-05-28.

## Problem

У нас работает реферальная программа Phase 53A между зарегистрированными юзерами: каждому юзеру выдан личный `REF-XXXXXX` код, привод друга = trial другу + пакет +14 дней рефереру.

Этого механизма недостаточно для внешних амбассадоров — блогеров, у которых есть аудитория, но **нет аккаунта на платформе**. Нам нужен способ:
- Сгенерировать ссылку, которую блогер опубликует в своём посте/сторис.
- По ссылке новый юзер получает trial-доступ к платформе с **админ-задаваемым** сроком (7 / 14 / 30 дней — может отличаться по контракту с разными блогерами).
- Собирать статистику активаций и конверсии в оплату per амбассадор-код.
- Никаких автоматических бонусов амбассадору — выплаты out-of-band по фактическим цифрам.

## Goal

Расширить существующую реф-инфраструктуру (53A) поддержкой **админ-управляемых кодов**, отвязанных от `UserProfile.referralCode`, с custom-длительностью trial и метриками per-code.

## Out of scope

- Revenue share / автоматические выплаты амбассадорам.
- Личный кабинет амбассадора (он не зарегистрирован на платформе).
- Marketplace-фильтр на каталоге `/learn` (Phase 58 D-17 — отдельно).
- Замена существующей user-to-user рефералки. Phase 53A продолжает работать **параллельно** на `codeType=EXTERNAL_USER`.

## Decisions (locked by owner 2026-05-28)

### D-01 — Кастомная длительность trial per code

Админ задаёт `refereeTrialDays` при создании кода (целое число дней). После создания **immutable** — изменение сломало бы консистентность с уже выданными подписками.

Тариф — фиксированный `PLATFORM` (как у Phase 53A trial). Custom-plan per code = future scope, сейчас не нужен.

### D-02 — Награда амбассадору отсутствует

Никаких `ReferralBonusPackage` для амбассадор-кодов. Единственный «выход» — статистика в админке (число активаций, конверсия в платную подписку). Решения по выплатам — вручную.

### D-03 — Существующий юзер по ссылке игнорируется

Если cookie-attribution привёл к юзеру у которого `auth.users.created_at` старше cookie-set момента — никакого бонуса, никакого `Referral` row. Юзер просто заходит как обычно. Это защита от self-abuse и refresh-через-чужую-ссылку.

Реализация: в orchestrator проверяется `userProfile.createdAt > NOW() - 5 минут` (порог "только что зарегистрированный"). Если нет — early return, log в Sentry с уровнем `info`.

### D-04 — Все четыре лимита per code

| Лимит | Поведение |
|---|---|
| `maxUses` (nullable) | После `currentUses >= maxUses` код перестаёт активировать новых юзеров. |
| `expiresAt` (nullable) | После даты — код перестаёт работать. |
| `isActive` toggle | Админ может вырубить код мгновенно (rage-quit). |
| Anti-fraud same-IP/device | Reuse `checkFraudSignals` из 53A. Превышение → `Referral.status=PENDING_REVIEW`, bonus не выдаётся до апрува в `/admin/referrals`. |

`maxUses=null` и `expiresAt=null` = без ограничений (бессрочный безлимит).

## Schema (additive, prod-safe)

### Новая модель `ReferralCode`

```prisma
model ReferralCode {
  id                String           @id @default(cuid())
  code              String           @unique
  codeType          ReferralCodeType  // AMBASSADOR (новый enum value)
  label             String           // "Блогер Анна", для админки
  refereeTrialDays  Int              // 7/14/30... immutable после создания
  maxUses           Int?
  currentUses       Int              @default(0)
  expiresAt         DateTime?
  isActive          Boolean          @default(true)
  createdByUserId   String           // админ-создатель
  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt

  createdBy         UserProfile      @relation("AmbassadorCodesCreatedBy", fields: [createdByUserId], references: [id], onDelete: Restrict)
  referrals         Referral[]       @relation("ReferralsByCode")

  @@index([isActive, expiresAt])
}
```

### Расширения существующих моделей

```prisma
enum ReferralCodeType {
  EXTERNAL_USER      // existing — user-to-user (Phase 53A)
  AMBASSADOR         // NEW — admin-managed external code
  INTERNAL_CARE      // existing (deferred 53C)
  INTERNAL_SALES_SERVICE
  INTERNAL_CONSULTING
  INTERNAL_GO
  INTERNAL_TOCHKA
  INTERNAL_OTHER
}

model Referral {
  // ... existing fields ...
  codeId            String?          // NEW — FK к ReferralCode, NULL для legacy EXTERNAL_USER
  referralCode      ReferralCode?    @relation("ReferralsByCode", fields: [codeId], references: [id], onDelete: SetNull)

  @@index([codeId])                  // NEW
}
```

**Backwards compat:** существующие `Referral` rows получают `codeId=NULL` (через nullable FK). Phase 53A code (`UserProfile.referralCode` lookup) продолжает работать без изменений.

**Миграция применяется только из MAAL** (PROD DATABASE SAFETY правило).

## Implementation breakdown

### 60-01 — Schema + matcher utility

**Backend:**
1. Prisma migration (additive — новая таблица + поле + индекс + enum value).
2. `packages/api/src/services/referral/code-resolver.ts` — новая утилита:
   - `resolveReferralCode(code: string): Promise<ResolvedReferralCode | null>` — возвращает либо `{type: 'ambassador', codeRow}` либо `{type: 'user', userProfile}` либо `null`. Сначала смотрит в `ReferralCode`, потом fallback к `UserProfile.referralCode` для совместимости.
3. Unit tests: 6 кейсов (ambassador active / expired / max-reached / disabled / legacy user code / unknown).

**Acceptance:** typecheck + 6/6 tests + migration applies cleanly.

### 60-02 — Orchestrator: ambassador signup path

**Backend:**
1. `apps/web/src/lib/referral/issue.ts` — расширение `issueReferralOnSignup`:
   - В начале — `resolveReferralCode(args.refCode)` (через новую утилиту).
   - Если `type === 'ambassador'`:
     - Проверка D-03 (`userProfile.createdAt > NOW - 5min`) — иначе early return.
     - Проверка лимитов (`isActive`, `expiresAt`, `currentUses < maxUses`) — иначе Sentry log + return.
     - Anti-fraud reuse (`checkFraudSignals` с `referrerId=null` → нужен мини-рефакторинг для null-case; same-IP/device проверки остаются).
     - В `$transaction`:
       - `Referral.create({codeType: 'AMBASSADOR', referrerUserId: null, referredUserId: friend, codeId: code.id, status})`
       - **НЕ** создаём `ReferralBonusPackage` (D-02).
       - `createTrialSubscription({userId, durationDays: code.refereeTrialDays})` — переиспользуем хелпер 53A.
       - `ReferralCode.update({currentUses: { increment: 1 }})`.
     - CQ: `setUserProps({pa_referral_source: code.label, pa_referral_trial_days: code.refereeTrialDays})`, событие `pa_ambassador_signup`.
   - Если `type === 'user'`: текущая 53A-логика без изменений.
2. Unit tests: 8 кейсов (happy / expired / max / disabled / existing-user-D03 / fraud-pending / cq-failure tolerant / transaction-rollback-on-error).

**Acceptance:** typecheck + 8/8 tests + 53A regression suite continues to pass.

### 60-03 — Admin UI: CRUD + statistics

**Frontend (`/admin/referrals/codes`):**

Новая страница рядом с `/admin/referrals` (которая остаётся как модерация 53A).

1. **Список кодов** (таблица):
   - `code` · `label` · `refereeTrialDays` · `currentUses / maxUses` · `expiresAt` · `isActive` · `createdAt`
   - **Колонки статистики (joined queries):**
     - `activations` — `COUNT Referral WHERE codeId=X AND status IN ('CONVERTED', 'PENDING_REVIEW')`
     - `paid_conversions` — `COUNT DISTINCT subscription.userId WHERE Subscription.status='ACTIVE' AND cpSubscriptionId IS NOT NULL AND userId IN (SELECT referredUserId FROM Referral WHERE codeId=X)`
   - Кнопка «копировать ссылку» → `https://platform.mpstats.academy/register?ref=<CODE>`
   - Toggle `isActive` inline.

2. **Создание** (модал):
   - `label*` (required, ≤80 chars)
   - `refereeTrialDays*` (required, 1..365)
   - `maxUses` (optional, ≥1)
   - `expiresAt` (optional, date picker, future-only)
   - `code` (optional override — auto-генерится `AMB-<6 char>` если пусто; uniqueness validated)
   - Кнопка «Создать» → trpc mutation `referral.admin.createAmbassadorCode`.

3. **Edit** (модал):
   - `label`, `maxUses`, `expiresAt`, `isActive` — редактируемые.
   - `refereeTrialDays` — read-only (D-01).
   - `code` — read-only.

**Backend tRPC:**
- `referral.admin.listAmbassadorCodes` (paginated, joined stats)
- `referral.admin.createAmbassadorCode` (zod-validated, code uniqueness check)
- `referral.admin.updateAmbassadorCode` (partial update, refereeTrialDays отвергается)
- `referral.admin.toggleAmbassadorCode` (быстрый isActive toggle)

Все под `adminProcedure`.

**Acceptance:** ESLint + typecheck чистые, базовый unit test на createMutation (validation rules), manual smoke в админке.

### 60-04 — E2E test + UAT

1. **E2E (Playwright)** — `apps/web/tests/e2e/ambassador-code.spec.ts`:
   - Админ создаёт код через UI.
   - Инкогнито-сессия открывает `/register?ref=<CODE>` → middleware ставит cookie.
   - Регистрация (email+pwd, mock CQ).
   - Подтверждение через `/auth/confirm`.
   - Проверка: `Subscription.currentPeriodEnd ≈ NOW + refereeTrialDays`, `ReferralCode.currentUses == 1`, `Referral.codeType=AMBASSADOR`.

2. **Manual UAT** (`60-HUMAN-UAT.md`):
   - Создать тестовый код AMB-TEST01 с 1 днём.
   - Скопировать ссылку, открыть инкогнито/чужая сеть, зарегистрироваться.
   - Проверить trial в `/profile`, активации в `/admin/referrals/codes`.
   - Прокликать второй раз тем же IP → ожидать `PENDING_REVIEW`.

## Risks

| Risk | Mitigation |
|---|---|
| Конфликт кодов: амбассадор-`code` совпал с авто-сгенерированным `UserProfile.referralCode` | Префикс `AMB-` для амбассадоров, `REF-` для юзеров (уже стандарт 53A). Resolve order: `ReferralCode` first, fallback to `UserProfile`. Уникальность кросс-таблица — отдельный check при create. |
| Migration breaks prod (incident 2026-05-12 paranoia) | Migration строго **additive**: новая таблица, новое nullable поле, новый enum value, новый index. Никакого DROP/ALTER на существующих колонках. Применяется только из MAAL-репо. |
| `refereeTrialDays = 0` или негатив | zod-валидация в `createAmbassadorCode` → `min(1).max(365)`. |
| Амбассадор-код выдан на уже зарегистрированного юзера → клайм «не сработало» | D-03: молчаливый ignore + Sentry-log. Owner может вручную дать trial через SQL (как для zakonipravo@gmail.com сегодня). |
| Длинные `label` ломают админ-UI | `varchar(80)` ограничение в zod + truncate в таблице. |
| Race: 2 регистрации одновременно превысили `maxUses` | `currentUses < maxUses` проверка внутри `$transaction`, после `increment` повторно валидируем результат (`if (updated.currentUses > maxUses) throw + rollback`). Защищает от gap-overflow на ±1. |

## Success criteria

- Админ может создать AMB-код через UI за <30s.
- Юзер кликает по ссылке инкогнито → за <60s имеет trial с правильным сроком.
- Статистика в админке показывает корректные `activations` и `paid_conversions`.
- Phase 53A user-to-user flow не сломан (regression tests passing).
- Cross-table code uniqueness защищена.
- `pa_referral_source` в CQ позволяет фильтровать лиды по конкретному блогеру.

## Estimate

- Sprint 60-01 (schema + resolver): ~0.5 дня
- Sprint 60-02 (orchestrator): ~0.5 дня
- Sprint 60-03 (admin UI + tRPC): ~1 день
- Sprint 60-04 (tests + UAT): ~0.5 дня

**Total: ~2.5 рабочих дня соло.** С parallel waves в 03 (UI+backend параллельно) — ~2 дня.

## Open questions for plan-phase

1. Точная форма URL-ссылки в админке: `?ref=` или дополнительный prefix `?utm_source=ambassador&ref=` для маркетинговых трекеров? (По умолчанию — `?ref=` для консистентности с 53A.)
2. Нужна ли history-таблица изменений кода (audit log) или достаточно `updatedAt`? (По умолчанию — достаточно `updatedAt`; full audit — future scope.)
3. Где включать стрельбу `pa_ambassador_signup` в CQ — внутри транзакции или после? (По умолчанию — после, как у 53A `pa_referral_trial_started`.)
