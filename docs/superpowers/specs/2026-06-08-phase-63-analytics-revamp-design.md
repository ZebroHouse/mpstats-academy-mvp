# Phase 63 — Аналитика 2.0: груминг + Выручка + Воронка

**Date:** 2026-06-08
**Status:** Design (approved in brainstorming)
**Owner:** evasilev / zebrosha

## Проблема

Раздел `/admin/analytics` накопил три проблемы:

1. **Баг «оторванной шапки».** Одна общая шапка с селектором периода (`days` → `admin.getAnalytics`) управляет Summary-stats и двумя графиками, которые рендерятся **в самом низу** страницы. Между шапкой и этими графиками вставлен блок DAU/WAU/MAU (`ActiveUsersSection`) со **своим** селектором периода. Визуально верхний селектор оторван от того, чем управляет.
2. **Слепая зона по деньгам.** Нет ни одного отчёта про выручку: сколько платящих, когда продления, какой ожидается приход, ARPU, сплит планов. Владелец не видит финансовую картину продукта.
3. **Нет воронки и удержания.** Не видно конверсии регистрация→диагностика→оплата, оттока, и — критично для стратегии trial-led роста — точного перехода триал→paid.

## Цели

- Структурно устранить баг, разведя раздел на под-страницы (у каждого дашборда своя шапка + свой селектор).
- Дать владельцу полноценный финансовый дашборд (Выручка).
- Дать воронку и удержание, с **точным** трекингом триал→paid.
- Вычистить тестовых юзеров из всех денежных метрик.
- Попутно отгрумить разросшийся `admin.ts` (1187 строк), вынеся аналитику в отдельный роутер.

## Не-цели (явно вне этой фазы)

- LTV по полным циклам (нет достаточной истории).
- Когортное удержание по месяцу регистрации (отдельная фаза, нужна доработка).
- Воронка с маркетинговых страниц (живёт в CarrotQuest, не в нашей БД).
- Графики выручки в реальном времени / экспорт в CSV (можно позже).

---

## Архитектура

### A. Навигация (IA)

`/admin/analytics` разводится на 4 под-страницы с табами-подменю вверху раздела:

| Таб | Route | Содержимое |
|-----|-------|-----------|
| **Обзор** | `/admin/analytics` | Рост юзеров + диагностики (`getAnalytics`) + DAU/WAU/MAU (`ActiveUsersSection`) |
| **Выручка** | `/admin/analytics/revenue` | MRR/платящая база, ближайшие продления, фактический приход, ARPU, сплит планов |
| **Воронка** | `/admin/analytics/funnel` | Конверсия рег→диагностика→оплата, trial→paid, отток, атрибуция |
| **Контент** | `/admin/analytics/content` | Watch engagement (`getWatchStats`) |

**Компоненты:**
- `(admin)/admin/analytics/layout.tsx` — server layout, рендерит `<AnalyticsTabs/>` + `{children}`.
- `components/admin/AnalyticsTabs.tsx` — клиентский таб-навигатор (active по `usePathname`), 4 ссылки.
- Каждая под-страница — отдельный `page.tsx` со своей `<h2>` шапкой и (где нужно) **локальным** селектором периода прямо над своими графиками.

**Результат:** баг исчезает структурно — селектор периода всегда стоит над тем дашбордом, которым управляет. Боковое меню админки не раздувается (одна запись Analytics остаётся).

### B. Бэкенд: груминг роутера

`admin.ts` уже 1187 строк. Выносим всю аналитику в новый файл:

- `packages/api/src/routers/admin-analytics.ts` — под-роутер `adminAnalyticsRouter`.
- Монтируется как `admin.analytics.*` (вложенный router внутри `adminRouter`), чтобы не ломать существующий namespace целиком, но сгруппировать.
- **Переезжают** из `admin.ts`: `getAnalytics`, `getActiveUserStats`, `getWatchStats` → `admin.analytics.getOverview` (rename `getAnalytics`), `admin.analytics.getActiveUserStats`, `admin.analytics.getContentEngagement` (rename `getWatchStats`).
- Фронт обновляет вызовы на новые пути.
- Чистые расчётные функции (MRR, conversion, churn, trial-derivation, test-exclusion) живут в `packages/api/src/utils/` отдельными модулями и юнит-тестируются изолированно.

**Откат-безопасность:** переезд процедур — чистый рефактор без смены логики; покрыт существующими + новыми тестами.

### C. Исключение тестовых юзеров

Новое поле `UserProfile.isTest Boolean @default(false)` (аддитивная миграция).

**Правило исключения** (хелпер `buildRevenueExclusion()` в `packages/api/src/utils/test-exclusion.ts`):
> Из денежных/воронных метрик исключается строка, если `user.isTest === true` **ИЛИ** `subscription.plan.hidden === true`.

- `user.isTest` — разово помеченный беклог известных тест-аккаунтов («те же аккаунты» для будущих тестов остаются исключёнными навсегда).
- `plan.hidden` — будущие тесты на скрытых тарифах (тест-план 10₽ `99edef8c…`) режутся автоматически.

**Бэкафилл:** скрипт собирает кандидатов (email `@mpstats.academy` / `@mpstats.io` + `tester@` / `test@` + юзеры с подписками на hidden-планах) → выводит список → **owner ревьюит** → применяем `isTest=true` через Supabase Mgmt API (паттерн `reference_supabase_migration_via_mgmt_api.md`, VPS без prisma).

**Тогл `isTest`** в `/admin/users` (SUPERADMIN) — дешёвая страховка на будущее (через существующий `toggleUserField`, расширив enum поля).

### D. Метрики: Выручка (`admin.analytics.revenue.*`)

Все метрики применяют `buildRevenueExclusion()`.

**`getRevenueOverview`** → одна сводка:
- `payingUsers` — distinct userId с подпиской `status ∈ {ACTIVE, TRIAL}`, `currentPeriodEnd > now` (активная база).
- `activePaying` — из них только `ACTIVE` (реально платящие сейчас).
- `trialPipeline` — из них `TRIAL` (потенциал; ₽0 выручки сейчас).
- `mrr` — Σ `plan.price` по `ACTIVE` подпискам (TRIAL даёт 0₽ — это pipeline, не выручка). Честный, не нормированный (COURSE/PLATFORM оба intervalDays=30). Если появятся иные периоды — нормировать на 30 дней (TODO в коде).
- `arpu` — `mrr / activePaying` (0 если делитель 0).
- `planSplit` — `[{type: COURSE, count, revenue}, {type: PLATFORM, count, revenue}]`.

**`getUpcomingRenewals({ days })`** → прогноз прихода:
- Подписки `status = ACTIVE`, `cpSubscriptionId != null` (**только рекуррентные**), `currentPeriodEnd ∈ [now, now+days]`.
- Возврат: список `{ userId, name, email, planType, amount, renewalDate }` + `totalExpected` (Σ amount).
- Сортировка по `renewalDate ASC`.

**`getActualRevenue({ days })`** → фактический кэш:
- `Payment` `status = COMPLETED`, `paidAt ∈ [now-days, now]`, исключая тест.
- Группировка по дню → `[{ date, amount }]` + `total`.

### E. Метрики: Воронка (`admin.analytics.funnel.*`)

**`getConversionFunnel({ days })`** → регистрация → диагностика → оплата:
- `registered` — `UserProfile` с `createdAt ∈ window`, не тест.
- `completedDiagnostic` — из них с ≥1 `DiagnosticSession status=COMPLETED`.
- `paid` — из них с ≥1 COMPLETED `Payment`.
- Возврат: счётчики + проценты переходов между шагами.

**`getTrialConversion({ days })`** → **точный** триал→paid (вывод из данных, без миграции):
- **Триал-когорта** = юзеры (не тест) со строкой `Subscription status=TRIAL`, `currentPeriodStart ∈ window`.
- **Сконвертился** = у юзера есть COMPLETED `Payment` (на любой не-trial подписке). Момент конверсии = `min(Payment.paidAt)`.
- Возврат:
  - `trialsStarted` — размер когорты.
  - `converted` — сколько сконвертилось.
  - `conversionRate` — `converted / (trials, у которых триал уже закончился)` (только «дозревшие» триалы, `currentPeriodEnd < now`, в знаменателе — иначе rate занижен активными триалами).
  - `activeTrials` — `currentPeriodEnd > now`, ещё не платили.
  - `churnedTrials` — триал закончился, оплаты нет.
  - `avgDaysToConvert` — средн. `paidAt − trialEnd` (конверсия физически только после окончания триала — см. инвариант ниже).
- **Чистая функция** `deriveTrialConversion(trials, payments, now)` в `packages/api/src/utils/trial-conversion.ts` — полностью покрыта юнит-тестами с фикстурами.

**`getChurn({ days })`** → отток:
- `cancelled` — `Subscription status=CANCELLED`, `cancelledAt ∈ window`, не тест.
- `expired` — подписки с `currentPeriodEnd ∈ window` и `status ∈ {CANCELLED, EXPIRED}` (лениво истёкшие).
- `pastDue` — текущие `status=PAST_DUE` (потенциал возврата — неудавшиеся списания на ретрае CP).
- `churnRate` — `cancelled / activePaying_на_начало_окна` (аппрокс, помечается дисклеймером).

**`getAttribution({ days })`** → источник выручки:
- Делим платящих юзеров (COMPLETED Payment в window, не тест) на `referred` (есть `Referral` где они referee, или `referralCode`-атрибуция) vs `organic`.
- Возврат: `{ referred: {users, revenue}, organic: {users, revenue} }`.

### F. Инвариант trial→paid (защита точности)

Регресс-тест фиксирует допущение, на котором держится точность:

> Строки `Subscription` со `status=TRIAL` **никогда** не меняют статус в коде. Триал-факт — иммутабельная строка; оплата — всегда отдельная новая строка.

- Тест `packages/api/src/services/billing/__tests__/trial-invariant.test.ts`: проверяет, что `handlePaymentSuccess`/`handlePaymentFailure`/`handleCancellation`/`handleRecurrentEvent` при вызове на сценарии «у юзера есть TRIAL-строка + новая платная строка» **не трогают** TRIAL-строку (она остаётся `status=TRIAL`).
- Документируется комментарием-инвариантом в `trial-subscription.ts` и `subscription-service.ts`.

---

## Точки изменения (файлы)

**Схема / БД:**
- `packages/db/prisma/schema.prisma` — `UserProfile.isTest Boolean @default(false)`.
- Миграция применяется через Supabase Mgmt API (additive).
- `scripts/` — бэкафилл-скрипт `backfill-is-test.ts` (вывод кандидатов + apply после ревью).

**Бэкенд:**
- `packages/api/src/routers/admin-analytics.ts` — NEW под-роутер.
- `packages/api/src/routers/admin.ts` — убрать переехавшие процедуры, смонтировать `analytics`.
- `packages/api/src/utils/test-exclusion.ts` — NEW `buildRevenueExclusion()`.
- `packages/api/src/utils/revenue-metrics.ts` — NEW чистые расчёты MRR/ARPU/split.
- `packages/api/src/utils/trial-conversion.ts` — NEW `deriveTrialConversion()`.
- `packages/api/src/utils/funnel-metrics.ts` — NEW чистые расчёты конверсии/оттока.
- Расширить `admin.toggleUserField` enum на `isTest`.

**Фронт:**
- `(admin)/admin/analytics/layout.tsx` — NEW.
- `(admin)/admin/analytics/page.tsx` — урезать до «Обзор».
- `(admin)/admin/analytics/revenue/page.tsx` — NEW.
- `(admin)/admin/analytics/funnel/page.tsx` — NEW.
- `(admin)/admin/analytics/content/page.tsx` — NEW (перенос watch-engagement).
- `components/admin/AnalyticsTabs.tsx` — NEW.
- `components/admin/revenue/*` , `components/admin/funnel/*` — карточки + таблицы + графики (recharts, как в `ActivityChart`).
- `components/admin/UserTable.tsx` — колонка/тогл `isTest`.
- Обновить вызовы trpc на `admin.analytics.*`.

**Тесты:**
- Юнит на все чистые функции (revenue/trial/funnel/exclusion) с фикстурами тест/не-тест + hidden-план.
- Регресс-тест инварианта trial.
- (опц.) UI-тест на таб-навигацию.

---

## Волны реализации

**Wave 1 — Фундамент + фикс бага (деплоится самостоятельно):**
- Миграция `isTest` + бэкафилл (после ревью owner).
- `test-exclusion.ts` хелпер.
- Груминг роутера: вынос аналитики в `admin-analytics.ts`, монтаж `admin.analytics.*`, переезд 3 процедур, обновление фронта.
- Навигация: layout + `AnalyticsTabs` + 4 под-страницы (Обзор/Контент с уже существующим содержимым, Выручка/Воронка — заглушки «скоро»).
- → баг с оторванной шапкой устранён.

**Wave 2 — Выручка:**
- `revenue.*` процедуры + чистые функции + тесты.
- `revenue/page.tsx` + карточки/таблицы (MRR, продления, приход, ARPU, сплит).

**Wave 3 — Воронка:**
- `funnel.*` процедуры + чистые функции + тесты + регресс-инвариант trial.
- `funnel/page.tsx` + визуализация конверсии/trial→paid/оттока/атрибуции.

Каждая волна: тесты зелёные → staging (`--no-cache` + content-check) → owner UAT → prod.

## Риски / дисклеймеры

- **Атрибуция и churn rate — приблизительные** (нет явного «converted/churned» события); помечаются дисклеймером в UI, как уже сделано для DAU/WAU/MAU.
- **MRR не нормирован** на разные периоды планов (сейчас все 30 дней) — TODO-комментарий в коде на случай новых тарифов.
- **Бэкафилл `isTest`** требует ручного ревью owner перед apply — нельзя авто-помечать по эвристике без подтверждения.
- **Prod-БД shared со staging** — миграция `isTest` затронет обе среды (additive, безопасно).
