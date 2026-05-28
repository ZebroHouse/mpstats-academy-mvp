# Phase 60: Ambassador Referral Codes — Context

**Gathered:** 2026-05-28
**Status:** Ready for planning
**Source:** Owner decisions captured 2026-05-28 + analysis of Phase 53A implementation (`apps/web/src/lib/referral/`, `packages/api/src/services/referral/`, `packages/api/src/routers/referral.ts`).

<domain>
## Phase Boundary

Расширить рефералку (Phase 53A, EXTERNAL_USER коды) поддержкой админ-управляемых **AMBASSADOR кодов** для внешних блогеров, у которых нет аккаунта на платформе. Каждый AMBASSADOR код:

- Создаётся админом через `/admin/referrals/codes` с **админ-задаваемой** длительностью trial для приведённого юзера (7/14/30 дней per контракт с блогером).
- Имеет лимиты: `maxUses`, `expiresAt`, `isActive` toggle.
- При активации (новый юзер зарегался по ссылке `/register?ref=AMB-XXX`):
  - Создаётся `Subscription{status=TRIAL, planId=PLATFORM, currentPeriodEnd=NOW+refereeTrialDays}`.
  - Создаётся `Referral{codeType=AMBASSADOR, referrerUserId=null, codeId=...}` для статистики.
  - `ReferralCode.currentUses` инкрементируется.
  - **Не** создаётся `ReferralBonusPackage` (амбассадор без аккаунта — некому выдавать).
- Анти-фрод и отношение к уже-зарегистрированному юзеру — переиспользуем 53A (`checkFraudSignals`, `parseRefCodeFromUrl`, cookie middleware).
- Статистика per code в админке: число активаций, конверсия в платную подписку.

Существующая 53A user-to-user рефералка работает **параллельно** через `codeType=EXTERNAL_USER` и `UserProfile.referralCode`. Не трогаем.

</domain>

<decisions>
## Implementation Decisions

### D-01: Кастомная длительность trial per code, immutable после создания

`ReferralCode.refereeTrialDays` (int, 1..365) задаётся админом при создании. После создания изменение запрещено (сломало бы консистентность с уже выданными подписками юзеров, которые «купили» trial по этому коду).

Тариф фиксированный — PLATFORM (как у Phase 53A TRIAL). Custom plan per code — не нужно сейчас.

### D-02: Награда амбассадору отсутствует

Никаких `ReferralBonusPackage` для AMBASSADOR кодов. `Referral.referrerUserId = NULL` (амбассадор не зарегистрирован на платформе → некому выдавать пакет).

Единственный «выход» для амбассадора — статистика в админке:
- `activations` = `COUNT Referral WHERE codeId=X AND status='CONVERTED'`
- `paid_conversions` = число активаций, чьи `referredUser` купили платную подписку.

Выплаты — out-of-band вручную по контракту.

### D-03: Уже зарегистрированный юзер игнорируется

Если cookie-attribution прокинула AMBASSADOR код, но `userProfile.createdAt > NOW - 5min` (юзер старше чем «только что зарегистрировался») — orchestrator делает early-return:
- НЕ создаёт `Referral` row.
- НЕ создаёт TRIAL `Subscription`.
- НЕ инкрементирует `currentUses`.
- Логирует в Sentry с level=info (для диагностики).

Это защита от self-abuse и refresh-через-чужую-ссылку. Юзер просто заходит как обычно.

### D-04: Per code лимиты — все четыре

| Лимит | Поведение при превышении |
|---|---|
| `maxUses` (nullable Int) | `currentUses >= maxUses` → код перестаёт активировать новых юзеров. NULL = безлимит. |
| `expiresAt` (nullable DateTime) | `NOW > expiresAt` → код выключен. NULL = бессрочный. |
| `isActive` (Boolean) | `isActive=false` → код выключен (админ rage-quit). Дефолт true. |
| anti-fraud (same-IP/device) | reuse `checkFraudSignals` из 53A. Превышение → `Referral.status=PENDING_REVIEW`, bonus не выдаётся, требует апрува в `/admin/referrals`. |

Race-protection для `maxUses`: проверка внутри `$transaction`, после `currentUses += 1` повторная валидация (`if updated.currentUses > maxUses → throw + rollback`).

### D-05: Резолвер кода с fallback (новая утилита)

`packages/api/src/services/referral/code-resolver.ts`:

```ts
type ResolvedCode =
  | { type: 'ambassador'; code: ReferralCode }
  | { type: 'user'; userProfile: UserProfile }
  | null;

async function resolveReferralCode(code: string): Promise<ResolvedCode>
```

Lookup order:
1. `ReferralCode` table (новая) — если найден AMBASSADOR код, возвращаем его.
2. Fallback к `UserProfile.referralCode` (Phase 53A legacy lookup) — если найден EXTERNAL_USER код, возвращаем профиль.
3. Иначе `null`.

Уникальность codes валидируется при INSERT в `ReferralCode` (cross-check: новый AMBASSADOR `code` не должен совпадать с существующим `UserProfile.referralCode`). Префикс `AMB-` для амбассадоров vs `REF-` для юзеров — соглашение, не enforced.

### D-06: Orchestrator-расширение, не дублирование

`apps/web/src/lib/referral/issue.ts::issueReferralOnSignup` (Phase 53A) — расширить, не дублировать.

В начале функции: `const resolved = await resolveReferralCode(args.refCode)`.

- Если `resolved.type === 'ambassador'` → новая ветка (D-01..D-04 + D-08 anti-fraud + transaction).
- Если `resolved.type === 'user'` → существующая 53A-логика без изменений.
- Если `null` → log + early return (как сейчас при unknown code).

### D-07: Schema — additive only

Migration строго additive (PROD DATABASE SAFETY правило):

```prisma
// New table
model ReferralCode {
  id                String           @id @default(cuid())
  code              String           @unique
  codeType          ReferralCodeType // AMBASSADOR пока единственный валидный (INTERNAL_* отложены)
  label             String           // "Блогер Анна"
  refereeTrialDays  Int              // 1..365, immutable
  maxUses           Int?
  currentUses       Int              @default(0)
  expiresAt         DateTime?
  isActive          Boolean          @default(true)
  createdByUserId   String
  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt
  createdBy         UserProfile      @relation("AmbassadorCodesCreatedBy", fields: [createdByUserId], references: [id], onDelete: Restrict)
  referrals         Referral[]       @relation("ReferralsByCode")
  @@index([isActive, expiresAt])
}

// Extend Referral (nullable — legacy rows get NULL)
model Referral {
  // ... existing fields ...
  codeId            String?
  referralCode      ReferralCode? @relation("ReferralsByCode", fields: [codeId], references: [id], onDelete: SetNull)
  @@index([codeId])
}

// Enum value already exists in ReferralCodeType (AMBASSADOR не было — добавляем)
```

Применяется только из MAAL-репо. `prisma db push` строго запрещён без проверки `DATABASE_URL`.

### D-08: Anti-fraud reuse без рефакторинга

`checkFraudSignals({referrerId, friendId})` (Phase 53A) принимает referrer ID для проверки self-ref и cap-per-week.

Для AMBASSADOR `referrerId=null` — фаза 60 пропускает self-ref check (амбассадор не юзер), но всё ещё проверяет same-IP/device (если эта логика добавлена) или просто пускает с verdict='OK'. Реализация: либо мини-рефакторинг `checkFraudSignals` (null-safe referrerId), либо новая функция-обёртка `checkAmbassadorFraud({friendId, codeId})`.

Решение в plan-phase: мини-рефакторинг — переименование параметра в `referrerId?: string | null`, internal branching. Тесты 53A не должны сломаться.

### D-09: CarrotQuest props

При успешной активации AMBASSADOR кода:
- `cq.setUserProps(friendId, { pa_referral_source: code.label, pa_referral_trial_days: code.refereeTrialDays, pa_referral_trial_until: <DD.MM.YYYY HH:MM МСК>, pa_referral_trial_until_tech: <ISO> })`
- `cq.trackEvent(friendId, 'pa_ambassador_signup')`

Best-effort (try/catch вокруг — как в 53A). Sentry на ошибку с tags `area:referral stage:cq`.

### D-10: Admin UI — отдельная вкладка

`/admin/referrals/codes` — новая страница рядом с `/admin/referrals` (53B модерация).

Структура:
- Список кодов (таблица): `code`, `label`, `refereeTrialDays`, `currentUses / maxUses`, `expiresAt`, `isActive`, `activations`, `paid_conversions`, кнопка copy-link, toggle `isActive`.
- Создание (модал): `label`, `refereeTrialDays`, `maxUses` (опц), `expiresAt` (опц), `code` (опц — auto AMB-XXXXXX если пусто).
- Edit (модал): `label`, `maxUses`, `expiresAt`, `isActive` редактируемые. `refereeTrialDays`, `code` — read-only.

tRPC procedures под `adminProcedure`:
- `referral.admin.listAmbassadorCodes` (paginated, joined stats)
- `referral.admin.createAmbassadorCode` (zod validation, cross-table uniqueness)
- `referral.admin.updateAmbassadorCode` (partial, отвергает refereeTrialDays/code)
- `referral.admin.toggleAmbassadorCode` (quick isActive toggle)

### D-11: URL формат

Шаринг-ссылка из админки = `https://platform.mpstats.academy/register?ref=<CODE>` (тот же путь, что 53A — middleware ловит `?ref=` на любом URL, ставит cookie, юзер регистрируется → orchestrator активирует).

UTM-параметры (`utm_source=ambassador&utm_campaign=<label>`) — опционально добавим в админке как dropdown «копировать с UTM», но не обязательно для MVP.

### D-12: Конкуренция между AMBASSADOR кодом и user-personal кодом

Если юзер кликает по AMBASSADOR ссылке (`?ref=AMB-XXX`), потом по другой user-ссылке (`?ref=REF-YYY`) до регистрации — middleware **переписывает** cookie на последний код (как сейчас). При регистрации `resolveReferralCode(cookieValue)` находит REF-YYY. Это OK: «последний клик побеждает» — стандартный attribution model.

### Claude's Discretion

- Точный размер UUID/cuid в auto-генерации AMB кодов (6 vs 8 знаков, alphabet) — планировщик решит.
- Дизайн модалок Create/Edit в админке (shadcn Dialog vs Sheet vs inline form) — UI-уровень.
- Точная форма UTM параметров в copy-link — если решим включать.
- Pagination size для списка кодов в админке (10 / 20 / 50).
- Где лежит helper для генерации AMB кода (`packages/api/src/services/referral/code-generator.ts` или inline).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 53A — реферальная программа (база, которую расширяем)

- `apps/web/src/lib/referral/issue.ts` — orchestrator `issueReferralOnSignup`. Точка расширения для AMBASSADOR-ветки.
- `apps/web/src/lib/referral/fraud-checks.ts` — `checkFraudSignals`. Логика анти-фрода для reuse.
- `packages/api/src/services/referral/attribution.ts` — cookie-парсинг + URL-валидация (`isValidRefCodeShape`, `parseRefCodeFromUrl`). Regex shape `/^[A-Z][A-Z0-9_]{0,15}-[A-Z0-9]{2,12}$/` — AMB-XXX укладывается.
- `packages/api/src/services/referral/activation.ts` — `activatePackage` (53A package activation). Образец паттерна `$transaction` + `createTrialSubscription` reuse.
- `packages/api/src/routers/referral.ts` — tRPC router 53A. Образец для новых admin процедур.
- `apps/web/src/middleware.ts:30` — `parseRefCodeFromUrl` + `decorateWithReferral` (cookie set). НЕ трогаем — переиспользуем как есть.
- `apps/web/src/app/auth/confirm/route.ts` + `apps/web/src/app/api/auth/yandex/callback/route.ts` — хуки на DOI/OAuth completion. Здесь `issueReferralOnSignup` уже вызывается — наша AMBASSADOR-ветка проедет через те же call-sites.

### Phase 53B — админ-модерация (UI-сосед)

- `apps/web/src/app/(admin)/admin/referrals/page.tsx` — `/admin/referrals` (модерация PENDING_REVIEW). Соседняя страница, паттерн для `/admin/referrals/codes`.
- `apps/web/src/components/admin/AdminReferralsTable.tsx` (упомянут в `page.tsx`) — образец таблицы под admin-paginated tRPC.

### Schema

- `packages/db/prisma/schema.prisma:529-592` — текущая схема `Referral`, `ReferralBonusPackage`, enums. Здесь добавляем новую модель + поле.

### Specs (history)

- `docs/superpowers/specs/2026-05-04-phase-53a-referral-program-design.md` — design 53A (для контекста).
- `docs/superpowers/plans/2026-05-04-phase-53a-referral-program.md` — план 53A (паттерн структуры плана).

### Phase 60 SPEC

- `.planning/phases/60-ambassador-codes/60-SPEC.md` — этот же SPEC в развёрнутом виде (читать перед planning для полной картины рисков и acceptance criteria).

</canonical_refs>

<specifics>
## Specific Ideas

### Sprint structure (черновой — финализирует planner)

- **60-01: Schema + resolver.** Prisma migration + `code-resolver.ts` + unit tests (6 cases: ambassador-active / expired / max-reached / disabled / legacy-user-code / unknown-code).
- **60-02: Orchestrator extension.** Расширение `issueReferralOnSignup` (ambassador branch) + рефакторинг `checkFraudSignals` (null-safe referrer). Unit tests (8 cases: happy / expired / max / disabled / existing-user-D03 / fraud-pending / cq-failure-tolerant / transaction-rollback).
- **60-03: Admin UI + tRPC.** `/admin/referrals/codes` page + 4 admin tRPC procedures. ESLint + typecheck + базовый createMutation тест (validation rules).
- **60-04: E2E + UAT.** Playwright spec (admin create → incognito register → trial assertion). Manual UAT chechlist в `60-HUMAN-UAT.md`.

### Существующие helpers для reuse

- `createTrialSubscription({userId, durationDays, prismaClient: tx})` — экспортируется из `@mpstats/api`, используется в 53A `issue.ts:117`. Для AMBASSADOR-ветки — ровно тот же вызов с `code.refereeTrialDays`.
- `getSupabaseAdmin()` (`apps/web/src/lib/auth/supabase-admin.ts`) — для admin-only операций где нужен service_role.
- `cq.setUserProps / cq.trackEvent` — паттерн Phase 33, реализация в `apps/web/src/lib/carrotquest/client.ts`.

### Acceptance criteria (черновые — финализирует planner)

- Админ создаёт AMB код через UI за <30s.
- Юзер инкогнито по ссылке → trial за <60s.
- Корректные `activations` и `paid_conversions` в админке.
- 53A regression: existing `phase-53a` тесты passing (особенно `attribution.test.ts`, `fraud-checks.test.ts`, любые E2E которые есть).
- Cross-table uniqueness защита: попытка создать AMB код с `code='REF-EXISTING'` → 400.
- `pa_referral_source` в CQ позволяет фильтровать лиды.

</specifics>

<deferred>
## Deferred Ideas

- Revenue share / автоматические выплаты амбассадорам (PaymentSplit, partner-payouts).
- Личный кабинет амбассадора (без аккаунта он не может логиниться — нужна модель «лёгких» аккаунтов).
- Marketplace-фильтр на каталоге `/learn` (Phase 58 D-17 — отдельная фаза).
- INTERNAL_* коды (CARE, SALES_SERVICE, CONSULTING, GO, TOCHKA, OTHER) — enum значения уже зарезервированы в Phase 53A для будущих внутренних use-cases. Реализация — когда саппорт/sales реально попросит. Можно переиспользовать `ReferralCode` инфраструктуру с другим `codeType`.
- A/B-тест разных `refereeTrialDays` через один и тот же label/контракт (нужен `code_variants` или динамические дни — overkill сейчас).
- Audit log изменений кода (кто и когда менял `maxUses`/`expiresAt`/`isActive`). Сейчас `updatedAt` достаточно.

</deferred>

---

*Phase: 60-ambassador-codes*
*Context gathered: 2026-05-28 via direct codebase analysis + owner decisions (4 AskUserQuestion answers).*
