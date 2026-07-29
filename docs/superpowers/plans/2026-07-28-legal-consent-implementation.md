# Legal-consent audit trail — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`). Source ТЗ: `docs/superpowers/plans/2026-07-28-legal-consent-audit-trail.md` (owner-approved; three corrections applied below from code mapping).

**Goal:** Хранить доказуемый журнал акцепта оферты/ПДн/рекламы (`UserConsent`, append-only) и записывать согласие во всех точках входа (регистрация, OAuth, partner-entry, онбординг, оплата), с бэкфиллом легаси-юзеров и read-only отображением в админ-реестре.

**Architecture:** Новая append-only таблица `UserConsent` + enums (аддитивная миграция через Mgmt API). Единый best-effort хелпер `recordConsents` (никогда не роняет регистрацию/оплату). Версии документов — константа `LEGAL_VERSIONS`. Для tRPC-точек (онбординг, оплата) ip/userAgent требуют расширения tRPC-контекста заголовками запроса. Owner выбрал вариант (A): активный акцепт — чекбокс на онбординге; OAuth/partner-entry дополнительно пишут пассивный `OAUTH_*`/`PARTNER_ENTRY` акцепт на колбэке.

**Tech Stack:** Next.js 14 (App Router, server actions + route handlers), tRPC, Prisma (Supabase), Zod, Vitest, Sentry.

## Global Constraints

- **Миграция — ТОЛЬКО аддитивным tsx через Mgmt API** (localhost=прод). `prisma migrate`/`db push` — НИКОГДА. Порядок: **миграция → `pnpm db:generate` → код**. Токен `.secrets/supabase-mgmt-token.md`, ref `saecuecevicwjkpmaoot`. Образец: `scripts/migrate-emergency-block-event-day.ts`. Enums создавать отдельными идемпотентными statement'ами (guarded `DO $$ ... $$` / `IF NOT EXISTS`).
- **`recordConsents` — best-effort:** обёрнут в `.catch()` + `Sentry.captureException`, НИКОГДА не бросает наружу, не блокирует регистрацию/оплату/онбординг. Append-only (без unique-констрейнта; повторный акцепт = новая строка).
- **`pnpm --filter web build` обязателен** перед сдачей (server-only-в-client). Гоча: `node_modules/next` периодически повреждается → `pnpm install --force`.
- **Онбординг-гоча:** server `redirect()`-гард + soft `router.push` = петля; уходить из gated-перехода — `window.location.assign`. УЖЕ соблюдено в `welcome/page.tsx:80-94` — не сломать при добавлении чекбокса.
- Тон текстов — редполитика (`mpstats-copywriting`), «вы» строчной, без канцелярита, вспомогательный стиль. «cancel anytime» и производные — запрещены вне FAQ.
- **ip за прокси:** `x-forwarded-for` (первое значение) → `x-real-ip` → `'unknown'` (KVMKA/nginx-мост; remote addr бесполезен). Паттерн — `apps/web/src/app/api/webhooks/cloudpayments/route.ts:94-97` и `clientIp` в rate-limit.
- Карты кода: `scratchpad/consent-auth-map.md`, `scratchpad/consent-ui-map.md`.

## Корректировки ТЗ (из code-mapping, не переоткрывать)

1. **Legal-страницы уже показывают дату** (`LegalPageLayout.tsx:39-43`, проп `lastUpdated="25 марта 2026"`) — не строим с нуля, связываем с `LEGAL_VERSIONS` (+опц. проп `version`).
2. **Checkout-кнопка одна** — `PlanPeriodCards.tsx:240-241`; уведомление ставим один раз под сеткой карточек на каждой из 2 страниц (не 4 места).
3. **tRPC-контекст без headers** — расширить `createTRPCContext` (`route.ts` + `packages/api/src/trpc.ts`) заголовками, чтобы `initiatePayment` (CHECKOUT) и `onboarding.complete` (ONBOARDING) получили ip/userAgent.

---

### Task 1: Миграция — таблица `UserConsent` + enums (Mgmt API) + schema + generate

**Files:** Create `scripts/migrate-user-consent.ts`; Modify `packages/db/prisma/schema.prisma`.

- [ ] **Step 1:** tsx-скрипт (Mgmt API, зеркало `migrate-emergency-block-event-day.ts`), идемпотентно: (a) `ConsentKind`/`ConsentSource` enums через guarded `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='consentkind') THEN CREATE TYPE ... END IF; END $$;` (отдельные statement'ы — enum и его использование не в одной транзакции); (b) `CREATE TABLE IF NOT EXISTS "UserConsent" (...)` со столбцами из ТЗ §2.1 (id text PK, userId text, kind ConsentKind, version text, source ConsentSource, acceptedAt timestamptz default now(), ip text null, userAgent text null) + FK на UserProfile(id) ON DELETE CASCADE + `@@index([userId,kind])`, `@@index([acceptedAt])`. Печатает состояние до/после.
- [ ] **Step 2:** Запустить `NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/migrate-user-consent.ts`. Проверить: таблица+enums созданы, существующие таблицы не тронуты.
- [ ] **Step 3:** `schema.prisma` — добавить модель `UserConsent` + enums `ConsentKind {OFFER PDN ADV}` / `ConsentSource {REGISTER OAUTH_YANDEX OAUTH_TOCHKA PARTNER_ENTRY CHECKOUT ONBOARDING BACKFILL}` (ТЗ §2.1) + back-relation `consents UserConsent[]` на `UserProfile`. Матч стиля существующих enum/моделей.
- [ ] **Step 4:** `pnpm db:generate` → `pnpm typecheck`. **Commit** `feat(legal): add UserConsent append-only table + enums`.

---

### Task 2: `LEGAL_VERSIONS` + версия на legal-страницах

**Files:** Create `apps/web/src/lib/legal/versions.ts`; Modify `apps/web/src/app/legal/offer/page.tsx`, `legal/pdn/page.tsx` (и/или `components/legal/LegalPageLayout.tsx`).

- [ ] **Step 1:** `versions.ts` — `export const LEGAL_VERSIONS = { OFFER:'2026-07-28', PDN:'2026-07-28', ADV:'2026-07-28' } as const;` (+ тип `ConsentKind`-совместимый ключ).
- [ ] **Step 2:** Связать видимую строку редакции с `LEGAL_VERSIONS`: legal/offer передаёт `lastUpdated`/`version` из `LEGAL_VERSIONS.OFFER`, legal/pdn — из `.PDN`. Формат строки — «Редакция от {дата}» (или оставить «Последнее обновление» — не хардкод, а из константы). Матч текущего `LegalPageLayout` API (проп `lastUpdated`; при желании добавить `version`).
- [ ] **Step 3:** `pnpm typecheck`. **Commit** `feat(legal): single source of truth for document versions on legal pages`.

---

### Task 3: Хелпер `recordConsents` + unit-тест (TDD)

**Files:** Create `packages/api/src/services/consent.ts`, `packages/api/src/services/consent.test.ts`.

**Interfaces:**
- Produces: `recordConsents(prisma: PrismaClient, userId: string, kinds: ConsentKind[], source: ConsentSource, meta?: { ip?: string|null; userAgent?: string|null; version?: (k: ConsentKind)=>string }): Promise<void>` — best-effort, одна строка на kind, `version` по умолчанию из `LEGAL_VERSIONS[kind]`. Импортируется в Tasks 5-8.

- [ ] **Step 1: Падающий тест** (`consent.test.ts`): мок prisma, у которого `userConsent.createMany` (или `create` в цикле) БРОСАЕТ → `recordConsents` НЕ должен бросить (best-effort), и Sentry вызван. Второй тест: успешный путь пишет N строк с правильными kind/source/version.
- [ ] **Step 2:** Запустить — FAIL (модуль не создан).
- [ ] **Step 3:** Реализовать `consent.ts`: для каждого kind — запись `{ userId, kind, source, version: meta.version?.(kind) ?? LEGAL_VERSIONS[kind], ip, userAgent }`; всё в `try/catch` → `Sentry.captureException(e, {tags:{area:'consent', source}})`. Использовать `createMany` одним вызовом. Импорт `LEGAL_VERSIONS` из `@/lib/legal/versions` (или относительный — проверить, доступен ли alias в packages/api; если нет — продублировать/вынести версии в shared). **Гоча:** `packages/api` не должен тянуть server-only-в-client — версии-константа чистая, ок.
- [ ] **Step 4:** Тест PASS. **Commit** `feat(legal): best-effort recordConsents helper + tests`.

---

### Task 4: Расширить tRPC-контекст заголовками (ip/userAgent)

**Files:** Modify `apps/web/src/app/api/trpc/[trpc]/route.ts`, `packages/api/src/trpc.ts` (`createTRPCContext` + `Context` тип).

**Interfaces:**
- Produces: `ctx.ip: string | null`, `ctx.userAgent: string | null` доступны в процедурах (нужны Task 7 ONBOARDING, Task 8 CHECKOUT).

- [ ] **Step 1:** `createTRPCContext` принимает `req`/`headers`; извлекает `ip` (`x-forwarded-for` первое → `x-real-ip` → null) и `userAgent` (`user-agent`), кладёт в контекст рядом с `{prisma, user}`. `route.ts` прокидывает `req` в фабрику контекста (сейчас `req` отбрасывается перед `createContext()`).
- [ ] **Step 2:** `pnpm typecheck` + `pnpm --filter web build` (контекст затрагивает и сервер, и клиентские вызовы типов). **Commit** `feat(api): expose request ip/userAgent in tRPC context`.

---

### Task 5: Запись согласий на email-регистрации + фикс потери `adv_consent`

**Files:** Modify `apps/web/src/lib/auth/actions.ts` (`signUp`), `apps/web/src/app/register/register-form.tsx` (проверить отправку `adv_consent`).

- [ ] **Step 1:** `signUp` (actions.ts:17): после успешного создания юзера (`data.user.id` доступен синхронно, map §auth) — прочитать `adv_consent` из formData (СЕЙЧАС не читается — фикс), вызвать `recordConsents(prisma, userId, ['OFFER','PDN', ...(adv?['ADV']:[])], 'REGISTER', {ip, userAgent})`. ip/userAgent — из `headers()` (server action). best-effort.
- [ ] **Step 2:** `register-form.tsx` — убедиться, что `adv_consent` реально уходит в formData к серверу (:59 кладёт; проверить, что `signUp` его теперь читает; если форма не отправляет — добавить hidden/поле).
- [ ] **Step 3:** `pnpm typecheck` + build. **Commit** `feat(legal): record consents on email registration + fix lost adv_consent`.

---

### Task 6: Запись согласий на OAuth-колбэках + partner-entry

**Files:** Modify `apps/web/src/app/api/auth/yandex/callback/route.ts`, `apps/web/src/app/api/auth/tochka/callback/route.ts`, `apps/web/src/app/api/partner/mpstats/enter/route.ts`.

- [ ] **Step 1: Yandex** (`isNewUser` gate ~:71): для нового юзера `recordConsents(prisma, userId, ['OFFER','PDN'], 'OAUTH_YANDEX', {ip, userAgent})` (ip/UA из Request headers). best-effort.
- [ ] **Step 2: Tochka** (~:74): аналогично, source `OAUTH_TOCHKA`.
- [ ] **Step 3: Partner-entry** (после `ensureBaseTrial`, 3 ветки — ~:73 trusted, ~:106 new; existing-untrusted идёт через magic-link — писать на фактическом создании/входе): `recordConsents(prisma, userId, ['OFFER','PDN'], 'PARTNER_ENTRY', {ip: clientIp(request), userAgent})`. Не дублировать в цикле; писать один раз на создание.
- [ ] **Step 4:** `pnpm typecheck` + build. **Commit** `feat(legal): record passive consent on OAuth callbacks + partner entry`.

> Пассивный акцепт (нет активного действия) — юридически слабее; активный акцепт этих юзеров — чекбокс онбординга (Task 7).

---

### Task 7: Чекбокс акцепта на онбординге + запись `ONBOARDING`

**Files:** Modify `apps/web/src/app/(main)/welcome/page.tsx` (первый шаг), `packages/api/src/routers/onboarding.ts` (`complete`).

- [ ] **Step 1:** В первом шаге визарда `/welcome` — блокирующий чекбокс «Я принимаю условия [оферты](/legal/offer) и [согласие на обработку персональных данных](/legal/pdn)» (ссылки открываются в новой вкладке). Переход дальше заблокирован без галочки. Не сломать существующую `window.location.assign`-навигацию (:80-94).
- [ ] **Step 2:** `onboarding.complete` (`wasFirstCompletion` gate ~:62): при первом завершении — `recordConsents(ctx.prisma, ctx.user.id, ['OFFER','PDN'], 'ONBOARDING', {ip: ctx.ip, userAgent: ctx.userAgent})` (ctx из Task 4). best-effort, не блокирует завершение.
- [ ] **Step 3:** `pnpm typecheck` + build. **Commit** `feat(legal): consent checkbox on onboarding + record ONBOARDING acceptance`.

---

### Task 8: Оплата — видимое уведомление + запись `CHECKOUT`

**Files:** Modify `apps/web/src/app/pricing/page.tsx`, `apps/web/src/app/(main)/billing/page.tsx` (уведомление), `packages/api/src/routers/billing.ts` (`initiatePayment`).

- [ ] **Step 1:** Уведомление под сеткой карточек (одно место на страницу): pricing/page.tsx (~между :324 и :326), billing/page.tsx (~между :251 и :253). Текст: «Нажимая «Оформить подписку», вы принимаете условия [оферты](/legal/offer) и соглашаетесь на автоматическое продление подписки.» Стиль — приглушённый вспомогательный, редполитика. Без чекбокса (конверсию не ломаем).
- [ ] **Step 2:** `initiatePayment` (после создания PENDING `Subscription` ~:230-241): `recordConsents(ctx.prisma, ctx.user.id, ['OFFER'], 'CHECKOUT', {ip: ctx.ip, userAgent: ctx.userAgent})`. best-effort, не блокирует оплату. Это самый весомый акцепт (пишем на каждой попытке).
- [ ] **Step 3:** `pnpm typecheck` + build. **Commit** `feat(legal): checkout offer/auto-renewal notice + record CHECKOUT consent`.

---

### Task 9: Отображение согласий в админ-реестре клиентов

**Files:** Modify `packages/api/src/services/sales-registry.ts`, `packages/api/src/utils/client-registry.ts`, `apps/web/src/app/(admin)/admin/analytics/clients/page.tsx`.

- [ ] **Step 1:** `fetchClientRegistry` (`Promise.all` ~:67-100): 6-й запрос — последний акцепт по `(userId, kind)` для `ids` (напр. `findMany` UserConsent where userId in ids, orderBy acceptedAt desc, затем свернуть в map latest-per-(user,kind)). Прокинуть через `RegistryInput`/`RegistryRow` (`client-registry.ts`) как поле `consents` (по образцу `trials`/`trialByUser` :71-77,:126).
- [ ] **Step 2:** `clients/page.tsx` — колонка/блок «Согласия»: по каждому виду последний акцепт (дата+версия+источник), read-only. Header `<th>` (~:86-97), body `<td>` (~:111-130), **бампнуть `colSpan={10}`** на пустых/loading/error строках (~:101,104,109).
- [ ] **Step 3:** `pnpm typecheck` + build. **Commit** `feat(legal): show consent audit in admin client registry`.

---

### Task 10: Бэкфилл легаси-юзеров (dry-run → боевой)

**Files:** Create `scripts/backfill-legal-consents.ts` (образец `scripts/backfill-referral-codes.ts`).

- [ ] **Step 1:** Скрипт с `--dry-run`/`--apply` gate: для каждого `UserProfile` — `OFFER` и `PDN` со `source:'BACKFILL'`, `version:'legacy-pre-2026-07-28'`, `acceptedAt = UserProfile.createdAt`. **`ADV` НЕ бэкфиллить.** Идемпотентность: пропускать юзеров, у кого уже есть BACKFILL-строка (повторный прогон не дублирует). per-row try/catch, прогресс каждые 25.
- [ ] **Step 2:** `--dry-run` — счётчик сверить с `SELECT count(*) FROM "UserProfile"`.
- [ ] **Step 3:** `--apply` (боевой, прод). Проверить count вставленных = 2×юзеров (OFFER+PDN). **Commit** `feat(legal): backfill legacy consents (BACKFILL source, legacy version)`.

> Честность: `legacy-*` версия + `BACKFILL` source — реконструкция по факту регистрации, не выдавать за настоящий акцепт.

---

### Task 11: Финальная верификация

- [ ] **Step 1:** `pnpm typecheck` + `pnpm --filter web build`.
- [ ] **Step 2:** `pnpm --filter @mpstats/api test` — включая новый `consent` тест; прежние 0 failures.
- [ ] **Step 3 (ручное/owner):** регистрация email → `UserConsent` 2-3 строки (OFFER/PDN[/ADV]) с версией+ip; оплата тест-план `99edef8c` картой → строка `CHECKOUT`; онбординг нового юзера → чекбокс блокирует + строка `ONBOARDING`. Бэкфилл dry-run сверить.

---

## Self-Review (против ТЗ)

- §2.1 таблица `UserConsent` → Task 1. §2.2 миграция → Task 1. §2.3 версии (скорр.: уже есть дата) → Task 2. §2.4 хелпер + точки → Tasks 3,5,6,7,8. §2.5 OAuth/partner (вариант A онбординг + пассив OAUTH_*) → Tasks 6,7. §2.6 checkout-строка (скорр.: 1 место/страница) → Task 8. §2.7 бэкфилл → Task 10. §2.8 админка → Task 9. ✅
- §3 границы (нет отзыва/экспорта/ретро-рассылки/версионирования текстов) — соблюдено, задач нет. ✅
- §4 проверка → Task 11. §5 порядок работ → порядок задач. ✅
- **Сверх ТЗ (из mapping):** tRPC-контекст headers (Task 4 — foundational для CHECKOUT+ONBOARDING ip/UA); adv_consent-фикс явно в Task 5; colSpan-бамп в Task 9. Все внесены.

**Type consistency:** `recordConsents(prisma, userId, kinds, source, meta)` (Task 3) — та же сигнатура в Tasks 5-8. `ctx.ip/ctx.userAgent` (Task 4) — потребляются Tasks 7,8. `ConsentKind`/`ConsentSource` (Task 1 schema) — во всех записях.
