# CLAUDE.md — MPSTATS Academy MVP

**Last updated:** 2026-06-01

> Детали по сессиям, спринтам, Supabase, деплою, CQ, staging — в `.claude/memory/`.
> Индекс: `.claude/memory/MEMORY.md`. История сессий: `.claude/memory/session-history.md`.

## 🚨 PROD DATABASE SAFETY (incident 2026-05-12 — read FIRST)

Supabase project `saecuecevicwjkpmaoot` = **live production** для platform.mpstats.academy. 158 paying users, 124 subs, 81 payments, 8801 RAG content_chunks.

### MAAL's authoritative schema

`packages/db/prisma/schema.prisma` в этом репозитории — **единственный источник истины** для DDL этой БД. Все таблицы Supabase должны быть там задекларированы.

### Incident 2026-05-12

Sibling project `D:/GpT_docs/Ai_MP_manager/` запустил `prisma db push --accept-data-loss` против shared MAAL Supabase из СВОЕЙ schema.prisma (только `aim_*` таблицы). Prisma снесла 24 MAAL prod таблицы (всё, что не задекларировано в той schema). Восстановлено через **Supabase PITR backup** (~12 часов потерь активной работы).

### Правила (zero exceptions)

1. **`prisma db push` против этой БД делать ТОЛЬКО из этого репозитория** (MAAL), где schema.prisma декларирует все 24+ таблицы. Никогда из соседнего проекта/папки.
2. **Перед db push на prod** — проверить что `DATABASE_URL` указывает на staging/dev, не на prod. Чек по project ref: prod = `saecuecevicwjkpmaoot`.
3. **`--accept-data-loss` на prod БД** — НИКОГДА. На staging — только с свежим backup.
4. **Если новому проекту нужна БД** — отдельный Supabase project, НЕ shared с MAAL. (Free tier до лимитов — бесплатно.)
5. **PITR backup retention** — поддерживать включённым на этом проекте. Стоит того.

### Recovery procedure (если повторится)

1. Supabase dashboard → Project saecuecevicwjkpmaoot → Database → Backups
2. PITR (Point-in-Time Recovery) → выбрать момент до инцидента
3. Restore. Время — минуты, не часы.
4. После restore — пересоздать любые ВАЛИДНЫЕ таблицы соседних проектов, которые могли пропасть

Подробный root-cause analysis: `~/.claude/projects/D--GpT-docs/memory/feedback_prisma_shared_db_disaster.md`

## Current Status

**Production:** https://platform.mpstats.academy

| Milestone | Status |
|-----------|--------|
| v1.0 MVP | Shipped 2026-02-26 (Phases 1-9) |
| v1.1 Admin & Polish | Shipped 2026-02-28 (Phases 10-15) |
| v1.2 Auth Rework + Billing | Shipped 2026-03-12 (Phases 16-21) |
| v1.3 Pre-release | Shipped (Phases 22-36) |
| v1.4 QA Audit Fixes | Shipped 2026-03-29 (Phases 37-42) |
| v1.5 Growth & Monetization | In Progress (Phase 44+45+46+48+49+50 shipped) |
| v1.6 Engagement | In Progress (Phases 51-53 + 56 shipped; 54 planned) |
| v1.7 RAG Quality | In Progress (Phase 55 Sprints 2/2C/3 shipped — full-platform vision-RAG, 91.5% coverage) |
| v1.8 Library Redesign | Shipped 2026-05-22 (Phase 57 — `/learn` job catalog + polish + hidden-lesson auto-sync) |
| v1.9 Agentic Search | Shipped 2026-05-25 (Track B — intent→jobs engine, AgentSearch on `/learn` + `/welcome`) |
| v1.10 Diagnostic on Jobs | Shipped 2026-05-28 (Phase 58 — диагностика рекомендует top-3 джобы, slim marketplace-aware онбординг, legacy LearningPath auto-rebuild) |
| v1.11 Ambassador Codes | Shipped 2026-05-28 (Phase 60 — админ-управляемые AMBASSADOR реф-коды для блогеров с кастомным trial-сроком + admin UI + статистика) |
| v1.12 Marketplace-aware Diagnostic | Shipped 2026-06-01 (Phase 59 v2 — pivot к hand-curated static deck: 30 вопросов 15WB+15Ozon, 5×3 axis/level matrix, seeded option shuffle, balanced 7-8 mix for BOTH users) |
| v1.13 Обучение 2.0 | Shipped 2026-06-05 (Phase 61 + 61.1 + DAU/WAU/MAU аналитика — release `4145a68`) |
| v1.14 Инструменты MPSTATS | Shipped 2026-06-08 (Phase 62 — бесплатный партнёрский курс `/mpstats-tools`, env-gated, изолирован от диагностики) |
| v1.15 Аналитика 2.0 | Shipped 2026-06-09 (Phase 63 — раздел `/admin/analytics` разведён на 4 таба Обзор/Выручка/Воронка/Контент; Выручка (MRR рекуррент-only, ARPU, сплит, продления, приход), Воронка (конверсия рег→диагностика→оплата, точный trial→paid, отток, атрибуция); `UserProfile.isTest` + исключение тест-юзеров; release `90b6192`) |
| v1.16 Бесшовный вход из MPSTATS | Shipped **dark** 2026-06-11 (Phase 64 — публичная ручка `/api/partner/mpstats/enter` → авто-сессия в курс `07_instruments`; untrusted (новый email→авто-создание+сессия, существующий→кука/magic-link), HMAC trusted-ветка dormant; combined «finish setup» баннер (подтверди почту + задай пароль); merge `60e77b6`. Гейт `PARTNER_ENTRY_ENABLED` НЕ задан на проде → инертна до go-live) |
| v1.17 Cohesive entry pages | Shipped 2026-06-16 (Phase 65 — `/register` + `/login` выведены из `(auth)` в свои тёмные лейауты, переиспользующие маркет-дизайн: `V8Header`+`V8Footer`+Onest+`#0F172A`. /register = сплит форма+промо (4 плашки-тезиса + цена), /login = форма по центру; формы не тронуты. + гайдлайн дизайн-системы. merge `62e69e3`) |
| v1.18 Design System v2 reskin | Shipped 2026-06-23 (branded-light — продукт сведён к маркет-облику, остаётся светлым: Onest везде, meet-in-middle радиусы, примитивы `DarkIsland`/`BentoCard`, дисциплина палитры. Per-section treatment выбран owner'ом после 3-way визуального сравнения baseline/deep/middle: Избранное+Карточка задачи+Инструменты MPSTATS → deep, Диагностика интро+результаты → middle, остальное baseline. Visual-only. merge `932f597`) |
| v1.19 Ads playbooks remap | Shipped 2026-06-23 (рекламные плейбуки переразбиты под структуру методологов из Google-листа «Решения задач» (стр.4–29): 17 задач — 14 published + 3 draft + 2 старых дубля unpublish, ось MARKETING, аддитивно. Заодно срезан методологический суффикс `\| Блок, N` в 116 названиях уроков. Чистая правка данных prod-Supabase без деплоя. merge `ee1ff2f`) |
| v1.20 Текстовые уроки (Фаза A) | Shipped 2026-06-24 (методолог создаёт текст/интерактив-уроки из админки: TipTap-редактор `/admin/content/lessons/[id]` (заголовки/списки/картинки+ресайз+выравнивание/таблицы+контекст-панель/ссылки-поповер/символы форматирования/предпросмотр), публикация индексирует текст в `content_chunk` (`academy_text`) → AI-чат+поиск видят текст; ученик видит тело + «Завершить»; черновики скрыты; удаление с явным подтверждением. Модель `Lesson.contentType`/`contentStatus`/`body` (аддитивная миграция + публичный bucket `lesson-images` через Mgmt API). Глобальный фикс `position:sticky` (`overflow-x:clip`). merge `5b09617`, prod deploy) |
| v1.21 Интерактивные уроки (Фаза B) | Shipped 2026-06-25 (методолог добавляет в уроки интерактив: гейты «читать дальше» + развилки-чекпоинты (модель A, схождение); ученик видит прогрессивное раскрытие (плавная анимация + автоскролл + «Пройти заново»). TipTap-ноды revealGate/checkpoint/checkpointOption + pure reveal-walker; `LessonProgress.progressState` (аддит. миграция) хранит раскрытые гейты + выборы. text/interactive объединены в один не-видео тип. merge `11a611f`, prod deploy) |
| v1.22 Контент-инструменты (Фаза C) | Shipped 2026-06-25 (3 независимые админ/редактор-фичи, БЕЗ миграций: (1) **дашборд аналитики чекпоинтов** `/admin/analytics/checkpoints` — распределение ответов учеников по вариантам, read-only over `progressState`, тест-юзеры исключены; (2) **редактор состава джоб** `/admin/jobs` — `admin.job.*` add/remove/reorder уроков + publish-тогл + **создание джоб с server-side embedding** (`embedQuery`+`::vector`) + reindex; (3) **карусель картинок** — TipTap atom-нода + node-view (автор/студент через `editor.isEditable`), реюз upload, alt в RAG-индексе. merge `83fb681`, prod deploy. Квиз/ответ-ученика/версионирование — deferred) |
| v1.23 Аналитика + AI плейбуки remap | Shipped 2026-06-25 (методологи доразбили блоки Аналитика (r35-69) + AI-инструменты (r76-88) + 2 рекламы (r4-5) в листе «Решения задач»: **+35 задач** (34 pub + 1 draft, заэмбеддены) — реклама MARKETING/WB, аналитика по-смыслу/WB (Ozon ждёт нарезки), AI по-смыслу/BOTH. **−15 старых генерик-джоб Phase 57** unpublish (полный ремап); KEEP: Ozon + визуал-контент 35ур. Опубликовано 41→60, покрытие уроков 94%. Чистая правка prod-Supabase (seed `seed-analytics-ai-playbooks.ts` + embed-jobs, без деплоя), ветка `feature/analytics-ai-playbooks-remap`) |
| v1.24 Триал + реф-плашка + счётчик | Shipped 2026-06-29 (merge `000c8d6`): **авто-триал 3 дня без карты** при чистой регистрации (DOI+Yandex через `ensureBaseTrial`, идемпотентно); **access** — убрано «2 урока по курсовому order», первый урок каждой published-джобы бесплатен (`getFirstJobLessonIds`, прокинуто во все call-sites) + N+1 fix в `material.getSignedUrl`; **реф-плашка на лендинге** = верхняя лента (top-ribbon, CTA→`/register?ref=`, реюз `validateCode`); **счётчик в шапке** `TrialCountdown` слева от колокольчика — «Триал: осталось N дней» (TRIAL) + «Доступ: …» (промо = ACTIVE без `cpSubscriptionId`), рекуррент→null, мобайл-пилюля→`/pricing`. Промо НЕ переведён в TRIAL (иначе затечёт в `getTrialConversion`). БЕЗ миграций. api 289/ai 71/web+typecheck зелёные. Откат `git revert -m 1 000c8d6` + редеплой) |
| v1.25 Лиды → amoCRM (Albato) | Shipped 2026-06-29 (merge `1714dd6`): лид регистрации уходит в amoCRM через **Albato-вебхук** (свой отдельный URL на платформу, паттерн go.mpstats) на **завершении онбординга** `onboarding.complete` (единственный персист непропускаемого визарда `/welcome` → лид у каждого зарегавшегося, email-DOI и Yandex). `sendAcademyLead` (`packages/api/src/utils/albato-lead.ts`): плоский payload 14 полей, enum→**рус-лейблы** из визарда, `ALBATO_WEBHOOK_URL` env (no-op без него), 8с таймаут, best-effort (не блокирует онбординг), fetch-ошибка санитизирована (URL не течёт в логи). **Fire-once race-proof:** `onboardingCompletedAt` клеймится атомарно `updateMany(where:{onboardingCompletedAt:null})`, `count===1` гейтит лид И CQ-событие (попутно сделал race-proof старое CQ). Связку Albato (контакт+сделка по дедупу телефон/email + примечание со всеми полями) собрал owner; сделки не дедупятся (fire-once покрывает). БЕЗ миграций. api 301/typecheck зелёные. Kill-switch=убрать `ALBATO_WEBHOOK_URL` из `.env.production`+`up -d`; откат `git revert -m 1 1714dd6`) |
| v1.26 Sales-аналитика (cluster) | Shipped 2026-06-29 (4 фичи в `/admin/analytics`, готовят витрину): **(1)** выбор цели амбассадор-кода `ReferralCode.landingTarget` HOME/REGISTER (форма+колонка+копи-ссылка `/?ref=` vs `/register?ref=`, merge `6bcb0cc`); **(2)** таб «Рефералы» — воронка по реф-кодам Переходы→Регистрации→Онбординг→Открывал оплату→Продажи + конверсии + график по дням; **трекинг кликов** `ReferralCodeClickDay` (middleware `event.waitUntil`→beacon `/api/internal/ref-click`, dedup первое касание, запись только при `REF_CLICK_SECRET`=fail-closed → staging не льёт в общий прод-Supabase), merge `2c37a57`; **(3)** таб «Клиенты» — реестр (email из `auth.users`/имя/телефон/реги/триал-до/источник/статус оплаты/дата+сумма/тариф) + CSV-выгрузка `/api/admin/client-registry` (admin-guard, RFC-4180+BOM), статус paid>failed>checkout>none из `Payment`/`PaymentEvent`/`CheckoutAttempt`; **checkout-стадия** = `check` CloudPayments логируется в `CheckoutAttempt` (billing-webhook best-effort, going-forward), merge `4d51df2`+hotfix `1b4b261`+`1c53ceb`. 3 аддит. миграции via Mgmt API. ГОЧИ: `auth.users.id`=uuid→нужен `::text` в `IN`; клики/checkout going-forward. api 319/typecheck 6/6) |

**Remaining work:**
1. Phase 33-03: CQ Dashboard Setup (на стороне CQ команды).
2. Ads playbooks — внешние долги от методологов (1 урок дозаписать, 3 пустые задачи, Ozon-версии 9 задач). Раскладка по `scripts/job-mapping/results/ADS-PLAYBOOKS-DEBT.md`, когда уроки придут скопом.
3. Аналитика+AI плейбуки — внешние долги: 1 draft-задача без уроков (роль менеджера/KPI), 6 уроков дозаписать, вся Ozon-сторона аналитики, опечатки в листе. Список: `scripts/job-mapping/results/ANALYTICS-AI-DEBT.md`.

_Done since 2026-05-22: Phase 57 polish (PR #9 hidden-lesson auto-sync) + Track B (PR #10) + admin-analytics fix (PR #11) + Phase 58 (PR #12, 2026-05-28) + Phase 60 base (PR #13, 2026-05-28) + Phase 60 register-banner hotfix (PR #14, 2026-05-28) + Phase 59 v2 static-deck diagnostic (PR #16, 2026-06-01) + Обучение 2.0 release (Phase 61 + 61.1 + DAU/WAU/MAU, master `4145a68`, 2026-06-05)._

## Active Branches

_No long-lived branches in flight._

Worktrees `.claude/worktrees/track-b-intent-jobs-engine/`, `.claude/worktrees/phase-60-ambassador-codes/`, `.claude/worktrees/phase-60-banner-fix/` остались post-merge — безопасно удалять. Cleanup на Windows иногда падает с «filename too long», тогда через `cmd //c rd /s /q <path>` + `git worktree prune`.

Track B (intent→jobs engine) merged via PR #10 (`a9c8402`) + hotfix `820c5b8` (job-catalog marker split). Phase 53A + 53B (referral) merged. Phase 55 Sprint 3 (vision-RAG, 91.5%) merged. Phase 56 (entry-flow) merged. Phase 57 (library redesign) merged via PR #8 (`bb84013`) + PR #9 (`3059ad8`). Phase 58 (diagnostic on jobs) merged via PR #12 (`3ca8fb6`). Phase 60 (ambassador codes) merged via PR #13 (`6927f21`) + hotfix PR #14 (`eb1946c`).
Обучение 2.0 (Phase 61 + 61.1 + DAU/WAU/MAU) merged via release commit `4145a68` (no-ff merge of `learning-2.0-redesign`→master), prod 2026-06-05; ветка `learning-2.0-redesign` смержена и удалена (local + origin).
Referral flag i1→i2 switch still scheduled ~2026-06-01 (manual: DB INSERT + env + rebuild).
Archive directory `D:/GpT_docs/MPSTATS ACADEMY ADAPTIVE LEARNING/MAAL-phase55/` (orphan, not a worktree) holds Sprint 2C VLM dumps (`results/vlm-runs-sprint2c.json` 1.7MB, 644 frame jpgs in `results/frames/`) — useful if a re-ingest is needed without re-running LLM. Safe to delete to free ~300MB when no longer needed.

**Cross-AI sync policy (read before editing this file):**
- `MAAL/CLAUDE.md` (master) — only **shipped** state + 1-line pointers to in-flight branches above.
- `MAAL-<branch>/CLAUDE.md` (worktree) — full in-flight details. Merges back into master when branch merges.
- Don't duplicate sprint metrics, decisions, or per-feature details into master — they live on the branch and surface in master at merge time.
- When creating a new long-lived branch, add a row above. When merging/closing a branch, remove the row.

## Auth — Phone Collection (Phase 45)

Телефон обязателен для новых регистраций.

| Путь | Как собираем телефон |
|------|---------------------|
| Email регистрация | Обязательное поле в `/register` (react-international-phone, дефолт RU) |
| Yandex OAuth | Scope `login:default_phone`, автоматически из Яндекса |
| Yandex без телефона | Редирект на `/complete-profile` |

- DB: `UserProfile.phone String?` (E.164)
- CQ: `$phone` + `pa_phone` при регистрации
- Pricing: неавторизованные → `/register` (было `/login`)

## Pricing

Источник правды — `SubscriptionPlan` в Supabase. UI/widget/profile/emails подтягивают через `trpc.billing.getPlans`.

| Plan | Name | Price | Period |
|------|------|-------|--------|
| COURSE | Подписка на курс | **1 990 ₽** | 30 дней |
| PLATFORM | Полный доступ | **2 990 ₽** | 30 дней |

**Менять цены:** `UPDATE "SubscriptionPlan" SET price=XXX WHERE type='COURSE'` в Supabase — мгновенно. Плюс обновить `scripts/seed/seed-billing.ts`.

**Внимание (исторический lesson):** CP хранит `amount` на своей стороне на момент создания подписки. При смене цен отменять старые ACTIVE подписки чтобы автосписания пошли по новым тарифам.

## Last Session (2026-06-30) — 3 фикса на прод: телефоны лидов, ассистент урока, склонение плашек

Дебаг-сессия по жалобам owner. 3 фикса зашиплены на прод, каждый: изолированный git worktree от master → TDD → staging build-gate (`--no-cache web`) → PR merge → прод `build --no-cache web` + recreate + smoke (internal+public 200). Параллельно в каталоге шёл storefront-агент → работал в worktree-изоляции, общее дерево не дёргал. Детали — в памяти.

- **Телефоны лидов не доходили до amoCRM и в реестр `/admin/analytics/clients`** (PR #19 + Supabase Mgmt API). Email-телефон собирался (required → `auth.users.raw_user_meta_data.phone`), но триггер `handle_new_user` создавал `UserProfile` БЕЗ него, а `ensureUserProfile` (update-ветка) не бэкафиллил → 100% email-юзеров с пустым `UserProfile.phone`; и реестр, и лид `sendAcademyLead` слали пусто. Яндекс не затронут (callback явно upsert'ит phone). Фикс via Mgmt API (без table DDL): `phone` добавлен в `handle_new_user` + бэкафилл 176 строк из метаданных. amoCRM задним числом НЕ дозаполнен (ушедшие лиды). Память `project_email_phone_persistence_fix.md`.
- **Ассистент в уроке отвечал «в этом фрагменте урока ответа нет» на нормальные вопросы** (PR #20 `5dd806c`). Два корня: (1) порог ретрива 0.5 слишком строг для чата ВНУТРИ урока (`lessonId` уже сужает пул до одного урока) → fallback `threshold:0`, когда первый проход пуст; (2) селлерские аббревиатуры (ЦА, ДРР, CPO, SKU…) ломали эмбеддинг → `expandSellerQuery` (`packages/ai/src/seller-lexicon.ts`, ~30 терминов из глоссария команды `docs/obshchiy_glossariy_sellera_2026.docx`) дописывает расшифровку к ЭМБЕДДИНГ-запросу в чате урока + `searchLessons` + `intent.resolve` (сообщение юзеру/LLM — оригинал). e2e против прод OK. Отложено в задачу сквозного платформенного ассистента: ингест глоссария в RAG (объяснять термины) + разговорные фразы-боли как синонимы. Спек `docs/superpowers/specs/2026-06-30-rag-recall-seller-lexicon-design.md`, память `project_lesson_chat_retrieval_recall_fix.md`.
- **Склонение «3 дней» вместо «3 дня» на реф-плашках** (PR #21 `73880d2`). Триал стал 3/7/14 дн → захардкоженное «дней» в реф-баннере главной (текст + кнопка «Забрать») и в бабле `/register` врало. Хелпер `pluralizeDays(n)` + generic `pluralRu(n,[one,few,many])` в `apps/web/src/lib/plural.ts`; `TrialCountdown.trialDaysPhrase` отрефакторен на тот же хелпер (DRY, один источник правды). Поправлен тест, зашивавший сам баг («21 дней»→«3 дня»). Переиспользовать хелпер для будущих склонений.

**Откаты:** каждый `git revert -m 1 <merge-commit>` + редеплой. Телефоны — обратимо на уровне функции триггера. Миграций нет (кроме DB-side `CREATE OR REPLACE FUNCTION handle_new_user` — обратимо, таблицы не трогает).

## Previous Session (2026-06-29) — Sales/monetization analytics cluster shipped to prod (next: витрина)

Большая сессия поверх лидов→amoCRM (см. ниже). Зашиплено на прод 5 фич воронки/продаж, каждая ветка→TDD→code-review субагент→staging build-gate→master `--no-ff`→прод `--no-cache web`. Все детали + гочи: память `project_sales_analytics_cluster.md` (+ `project_leads_amocrm.md`).

**Что на проде (новое→старое):**
- **Триал-колонка в реестре + checkout-стадия в воронке** (`1c53ceb`): «Клиенты» получил «Триал до» (TRIAL `currentPeriodEnd`); «Рефералы» — стадию «Открывал оплату» (distinct реферальные из `CheckoutAttempt`).
- **Реестр клиентов** (`4d51df2` + hotfix `1b4b261`): таб «Клиенты» + CSV. Источник = наша БД (CloudPayments в `Payment`/`PaymentEvent`). Hotfix: `auth.users.id` uuid vs text-параметры → «0 клиентов» → фикс `id::text IN`.
- **Воронка по реф-кодам + клики** (`2c37a57`): таб «Рефералы», `ReferralCodeClickDay`, middleware-beacon, `REF_CLICK_SECRET` fail-closed (staging не льёт в прод-БД).
- **Выбор цели амбассадор-кода** (`6bcb0cc`): `landingTarget` HOME/REGISTER в `/admin/referrals/codes`.

**Разобрано (без изменений):** триал амбассадор-кода ЗАМЕНЯЕТ базовый (`BASE_TRIAL_DAYS=3`), не суммируется; 0-day код нельзя (min=1) — для «без лишних дней» ставить `refereeTrialDays=3`.

**Следующая сессия — ВИТРИНА (#3 funnel-roadmap).** Вся монетизационная обвязка готова (триал, коды, воронка, реестр). Витрина: общий дизайн есть, детали неясны → начать с брейншторма. Хендофф: `.claude/handoffs/2026-06-29-storefront.md`.

## Previous Session (2026-06-29) — Лиды регистрации → amoCRM (Albato) shipped to prod

**Merge `1714dd6` (`--no-ff` `feature/leads-amocrm` → master) + prod deploy `maal-web-1`.** Задача #4 funnel-roadmap. Платформа в боевом режиме, менеджеры продаж тестируют → лиды нужны в amoCRM. Витрина (#3) сдвинута на ПОСЛЕ лидов (решение owner). Owner подтвердил: лид с прода долетел чисто.

**Что на проде:**
- Лид уходит в amoCRM через **Albato-вебхук** (отдельный URL на платформу, паттерн sibling-проекта go.mpstats `lib/albato.ts`) на **завершении онбординга** — мутация `onboarding.complete` (единственный персист непропускаемого визарда `/welcome`; гард `(main)/layout.tsx` редиректит пока `onboardingCompletedAt==null`). Значит лид у **каждого** зарегавшегося — и email-DOI, и Yandex. Триггер «после визарда» выбран owner (vs «первый вход») — визард непропускаем, тут уже полная квалификация.
- `sendAcademyLead` (`packages/api/src/utils/albato-lead.ts`): плоский payload 14 полей (`user_id, name, phone, email, registration_source, referral_code, marketplaces, experience, goals, goal_text, trial_active, trial_ends_at, registered_at, timestamp`), enum-коды → **рус-лейблы** из визарда (мапы продублированы, не импорт client-модуля `options.ts`). `ALBATO_WEBHOOK_URL` env (no-op без него), 8с таймаут, best-effort try/catch (не блокирует онбординг), fetch-ошибка санитизирована (URL не течёт в логи).
- **Fire-once race-proof:** `onboardingCompletedAt` клеймится атомарно `updateMany(where:{onboardingCompletedAt:null})`; `count===1` гейтит И лид, И существующее CQ-событие `pa_onboarding_completed` (попутно сделал race-proof старое CQ). Квалификация персистится отдельным `update` на каждый вызов (правка профиля цела). Реф-код (`Referral`) + триал (`Subscription TRIAL`) читаются параллельно в first-completion блоке.

**Связка Albato (собрал owner вживую, я помогал флоу + слал тест-payload'ы через `node -e fetch`):** триггер «Вебхук» → amoCRM «Новый контакт» (дедуп по телефону/email) → «Новая сделка» (воронка/этап) → «Новое примечание» со всеми полями текстом. **Сделки НЕ дедупятся** (amoCRM не умеет + не нужно: fire-once на нашей стороне). Гоча при сборке: токен `{%...:pname...%}` в названии сделки = в Albato вставили amoCRM-макрос вместо вебхук-переменной → чинится маппингом на вебхук-`name`.

**Деплой:** staging build `--no-cache web` (без env → инертна, проверка что собирается) → master merge → prod build `--no-cache web` + recreate + `ALBATO_WEBHOOK_URL` в `.env.production` (НЕ на staging — общий прод-Supabase). Smoke internal+public 200, content-check маркера `sending lead` в `/app/apps/web/.next/server/chunks`. **Kill-switch:** убрать `ALBATO_WEBHOOK_URL` из `.env.production` + `up -d web` (no-op мгновенно). Откат: `git revert -m 1 1714dd6` + редеплой. Тесты: albato-lead 9, onboarding 11, api 301/301, typecheck чисто. Тест-лиды test-0001..0003 в amoCRM (owner чистит). Память: `project_leads_amocrm.md`.

## Previous Session (2026-06-29) — Триал-рерайт + реф-плашка лендинга + счётчик триала/промо shipped to prod

**Merge `000c8d6` (`--no-ff` `feature/trial-rework-referral-banner` → master) + prod deploy `maal-web-1`.** Реализованы приоритеты #1+#2 из `docs/superpowers/plans/2026-06-26-funnel-monetization-roadmap.md` (4 задачи через subagent-driven TDD + двойное ревью на каждую; БЕЗ миграций).

**Контекст (сессия началась с разбора воронки):** read-only снапшот прода показал — монетизация НЕ протестирована (114/116 ACTIVE-доступов = промокоды, реальных оплат 2 чел/0.9%, но completion урока 41% и диагностику проходят 57%). Решения owner: триал 3 дня без карты, storefront вечно бесплатен, первый урок джобы бесплатен (вариант B), going-forward.

**Что на проде:**
1. **Авто-триал 3 дня без карты** при чистой регистрации (нет refCode → `ensureBaseTrial(userId)` в `auth/confirm` + yandex-callback; реферал-ветка как была — 14дн/амбассадор). Идемпотентно (создаёт только если нет подписки), ошибка не ломает вход. Триал = PLATFORM `status=TRIAL`.
2. **`access.ts`:** удалено `FREE_LESSON_THRESHOLD` («2 по курсовому order» — было сломано для джоб); добавлен `getFirstJobLessonIds` → первый урок каждой published-джобы бесплатен (свойство урока, во всех call-sites: job/learning/ai/material); `checkLessonAccess` теперь требует `lesson.id`. N+1 в `material.getSignedUrl` устранён (один pre-fetch + sync `isLessonAccessible`).
3. **Реф-плашка на лендинге** (`ReferralTopRibbon`) — верхняя лента (sticky top, градиент `#2C4FF8→#0F172A`, Onest), показывается при валидном `?ref=` (реюз `referral.validateCode`), CTA «Забрать N дней» → `/register?ref=`, дни=`trialDays ?? 14`, обёрнута в `<Suspense>` (иначе `useSearchParams` валит `next build`). Owner выбрал текущий градиент vs анимированный «Б»-шиммер (собирал оба, смотрели на localhost).
4. **Счётчик в шапке** (`TrialCountdown`, `(main)/layout.tsx` слева от `NotificationBell`, h-16 не ломает): «Триал: осталось N дней» (TRIAL) + «Доступ: осталось N дней» (промо = `ACTIVE && cpSubscriptionId==null`); рекуррент-оплата (`cpSubscriptionId` есть) → null; 1 день → amber; мобайл — вся пилюля кликабельна → `/pricing`. Русская плюрализация день/дня/дней.

**Решения/уроки сессии:** промо НЕ переводим в `status=TRIAL` (затечёт в `getTrialConversion` Phase 63 + сломает инвариант иммутабельности) — счётчик расширили на промо на уровне отображения. Storefront/диагностика шлюзом не являются (только онбординг). **Staging-ограничение:** авто-триал по регистрации на staging не проверить — DOI-confirm уходит на прод-домен (общий Supabase site_url); проверяли display счётчика, вручную создав триал тест-аккаунту через `ensureBaseTrial`, потом подчистили (+`isTest`). Жёлтая `StagingBanner` (`role=status`, z-100) перекрывает шапку/ленту на staging — на проде её нет.

**Деплой:** staging (`--no-cache web` + smoke) → owner UAT счётчика → прод (`--no-cache web` при работающем контейнере → recreate → internal+public smoke 200 + плашка проверена в браузере на проде по `?ref=`). Тесты: typecheck 6/6, api 289, ai 71, web (T3+T4 зелёные, 1 предсущ. yandex-oauth флейк под нагрузкой). **Откат:** `git revert -m 1 000c8d6` + редеплой. Память: `project_funnel_monetization_roadmap.md`.

**Осталось (бэклог из плана):** витрина+онбординг (#3), лиды→amoCRM via Albato (#4, нужен owner), discovery данных MPSTATS + доступ к данным селлера (#5/#6), «промо vs триал в аналитике» (owner отложил копнуть глубже), честная метка покрытия джобы для тарифа COURSE 1990.

## Previous Session (2026-06-25) — Контент-инструменты (Фаза C) shipped to prod

**Merge `83fb681` (`--no-ff` `feature/phase-c-content-tools` → master) + prod deploy `maal-web-1`.** Завершает оригинальный 3-фазный дизайн text/interactive-уроков. 3 независимые owner-confirmed фичи, каждая своим циклом spec→plan→TDD (coder + code-review субагенты), **БЕЗ единой миграции** (главный риск проекта — DDL по prod-Supabase — не задействован).

**Что на проде:**
1. **Дашборд аналитики чекпоинтов** (`/admin/analytics/checkpoints`) — методолог видит распределение ответов учеников по вариантам каждой развилки. Read-only over `LessonProgress.progressState.checkpointChoices` (Фаза B); pure-утилы `extractCheckpoints`/`tallyCheckpoints` (лейблы из `checkpointOption.label`, у `checkpoint`-ноды текста нет → контекст из предшествующего абзаца; bucket «(удалённый вариант)»); `admin.analytics.{listInteractiveLessons,getCheckpointAnalytics}`; тест-юзеры (`isTest`) исключены.
2. **Редактор состава джоб** (`/admin/jobs`) — управление «решениями под задачу» без `seed-jobs.ts`. Новый `admin.job.*` суброутер: add/remove/reorder уроков (contiguous renumber, **без temp-park** — у `JobLesson` нет `@@unique([jobId,order])`), publish-тогл, поиск уроков по всем курсам (incl. hidden), **создание джоб с server-side embedding** (`embedQuery`→`$executeRawUnsafe ...::vector`, embed-fail не теряет джобу) + «Переиндексировать». Мету (title/desc) из админки НЕ редактируем (остаётся в seed → re-embed состава не нужен).
3. **Карусель картинок** (редактор уроков) — TipTap atom-нода `imageCarousel`, node-view ветвится на `editor.isEditable` (авторская правка vs студенческая карусель со стрелками/точками/свайпом), реюз upload `requestLessonImageUploadUrl`, alt-текст в `extractPlainText`. Чистый фронтенд, без бэкенда.

**Деплой:** owner локально проверил через `pnpm dev` (читает прод-БД) → дал ОК на прод. Раннбук: push ветки → staging `--no-cache web` build-gate (dev-режим ≠ прод-build!) + tRPC-probe DEPLOYED → merge `--no-ff`→master → прод `--no-cache web` build (старый контейнер обслуживает) → recreate → internal health 200 + tRPC-probe UNAUTHORIZED + public `platform.mpstats.academy/`+`/api/health` 200. **Откат:** `git revert -m 1 83fb681` + редеплой.

**Tests:** typecheck 6/6, api 273/273, ai 71/71, web 286/287 (1 = известный yandex-oauth флейк). Память: `project_phase_c_content_tools.md`. **Deferred** (до реального запроса): квиз с проверкой, ответ ученика на проверку, версионирование контента. Ветки A/B/C смержены — можно удалять вместе.

## Previous Session (2026-06-24) — Текстовые уроки (Фаза A) shipped to prod

**Merge `5b09617` (`--no-ff` `feature/text-interactive-lessons` → master) + prod deploy `maal-web-1`.** Полный цикл: brainstorm → спека (`docs/superpowers/specs/2026-06-23-text-interactive-lessons-design.md`, 3 фазы A→B→C) → план (`docs/superpowers/plans/2026-06-23-phase-a-text-lessons.md`) → 17 задач субагентами (TDD + spec/quality ревью) → 2 раунда UAT-правок owner'а → деплой.

**Что на проде:**
- **Модель:** `Lesson.contentType` {VIDEO/TEXT/INTERACTIVE} + `contentStatus` {DRAFT/PUBLISHED} + `body` (TipTap JSON). Аддитивная миграция `20260623000000_add_lesson_content` + публичный bucket `lesson-images` применены к prod-Supabase **через Mgmt API** (по пути убиты 3 зомби idle-in-tx сессии, висевшие 13 дней и блокировавшие `ALTER TABLE Lesson`).
- **Админка:** создание урока из `CourseManager` → редактор `/admin/content/lessons/[id]` (TipTap **v3**). Сохранение черновика (без индексации) / публикация (индексирует plain-text тела в `content_chunk` `source_type='academy_text'` → AI-чат+`searchLessons` видят текст). Редактирование/удаление (с явным чекбокс-подтверждением; видео удалять нельзя) из списка и редактора.
- **Ученик:** рендер тела (read-only TipTap) + «Завершить урок» (реюз `completeLesson`); DRAFT скрыты (`getLesson`→null).
- **Редактор UX:** scoped-типографика `.lesson-content` (НЕ ставили `@tailwindcss/typography` — есть 2 существующих `prose`-потребителя), предпросмотр черновика, **липкие тулбары**, контекст-панель таблиц (add/del row/col, merge, header), ресайз картинок (пресеты ширины) + выравнивание, ссылки-поповер (+ кликабельны у ученика), символы форматирования (¶).
- **Глобальный фикс:** `position:sticky` чинился во всём приложении — `html,body { overflow-x: hidden }` → `clip` (hidden делал body нескроллящимся scroll-контейнером, ломая sticky у всех потомков). Диагностировано вживую через браузер.

**Деплой:** staging (`--no-cache web` build + HTTP 200) → ОК → прод (`--no-cache web` build при работающем контейнере → recreate → smoke `/` 200 + `/api/health` 200). Тесты: typecheck 6/6, ai 67/67, api 226/226, web (мои все зелёные; 1 предсущ. флейк `yandex-oauth`). **Откат:** `git revert -m 1 5b09617` + редеплой.

**Осталось:** карусель картинок (бэклог), **Фаза B** (интерактив: гейты + ветвление), **Фаза C** (редактор состава джоб в админке). Ветки `feature/text-interactive-lessons` НЕ удаляли (снесём все 3 фаза-ветки вместе после готовности B+C). Память: `project_phase_a_text_lessons.md`. Хендофф на Фазу B: `.claude/handoffs/`.

## Previous Session (2026-06-23) — Ads playbooks remap под методологов + чистка названий уроков shipped to prod

**Merge `ee1ff2f` (`--no-ff` `feature/ads-playbooks-remap` → master, запушено).** Методологи переразбили блок «Реклама» в Google-листе «Решения задач» (`1xs0TkCrvu4...`, gid=70389265, **строки 4–29**) на **17 задач/плейбуков**. Пересобрали раздел «решения под задачу» (`Job`/`JobLesson`, ось MARKETING). **Аддитивно** (решение owner): нейронка/визуал/контент/аналитика/Ozon-плейбуки НЕ трогали — обновим, когда методологи доготовят те блоки.

**Что на проде (чистая правка данных в shared prod-Supabase, БЕЗ схемы/кода/деплоя):**
- **14 published** WB-плейбуков (уроки + AI-эмбеддинги) + **3 draft** (`isPublished=false`: выкупы/защита бренда/юр-риски, скрыты) + **2 старых дубля сняты с публикации** (`provesti-analiz-i-optimizaciyu-reklamnyh-kampaniy-na-wildber`, `nastroit-i-optimizirovat-reklamnye-kampanii-s-ispolzovaniem-`). Published-джоб 29→41. Уроки сматчены на курс `02_ads`; axes/skillBlocks выведены из самих уроков.
- **Чистка названий:** срезан методологический суффикс `Название \| Блок-источник, N` (артефакт skill-batch ingest, торчал в UI) — **116 уроков по всем курсам**. Защищены **4** (суффикс = единственный различитель: FBO/FBS на Ozon, «Ищем категории») + 2 легитимных `\|` не тронуты. Rollback-снапшот `scripts/job-mapping/results/title-cleanup-snapshot.json`.

**Скрипты (idempotent):** `scripts/seed/seed-ads-playbooks.ts` (upsert + unpublish ретайра, `--dry-run`, pre-flight на lessonId), `scripts/seed/strip-lesson-title-suffix.ts` (`--apply`), `seed-jobs.ts` (`buildJobUpsert` теперь уважает per-job `isPublished`). Вход сида: `results/JOB-PROPOSAL-ads.json`. Запуск: `NODE_OPTIONS=--dns-result-order=ipv4first npx tsx ...`; **`embed-jobs.ts` требует `--conditions=react-server`** (обход `server-only` при запуске вне Next через tsx).

**Долги** (внешние, от методологов) — `scripts/job-mapping/results/ADS-PLAYBOOKS-DEBT.md`: 1 урок дозаписать («Чистка неэффективных запросов»), 3 пустые задачи, Ozon-версии 9 задач, опечатки в листе. **Процедура раскладки, когда уроки придут скопом** — в доке. Память: `project_ads_playbooks_remap.md`.

## Previous Session (2026-06-23) — Design System v2 «branded-light» рескин продукта shipped to prod

**Merge `932f597` (`--no-ff` `design-system-v2-reskin` → master) + prod deploy `maal-web-1`.** Продукт сведён к маркетинговому облику, **остаётся светлым** (Onest везде, meet-in-middle радиусы, тёмные острова для глубины, дисциплина палитры). Спек `docs/design-system/v2-product-alignment-spec.md`, гайдлайн `docs/design-system/{README,tokens,dark,light}.md`.

**Метод (ключевой паттерн):** owner не мог выбрать глубину в абстракции → собрали **3 локальных билда бок-о-бок** для визуального выбора: baseline (:3000), DEEP (worktree, :3100 — тёмные `DarkIsland`-шапки + `BentoCard` + тёмный сайдбар) и MIDDLE (worktree, :3101 — светлые soft-tint карты + крупная Onest-типошкала + синий active-pill). Два варианта сверстаны параллельными `coder`-субагентами (посекционные коммиты). Owner дал вердикт по каждому разделу → cherry-pick по файлам.

**Что на проде (вердикты owner):**
- **deep** (тёмные острова): Избранное `/learn/favorites`, Карточка задачи `/learn/job/[slug]`, Инструменты MPSTATS `/mpstats-tools` (+ зелёный `#17BF50` MPSTATS-нод).
- **middle** (светлые, приглушённая палитра): Диагностика интро `/diagnostic` + результаты `/diagnostic/results`.
- **baseline (как есть):** сайдбар/моб.меню, профиль, рефералка, история, уведомления, плеер, прохождение диагностики.
- Глобально (раньше, на этой же ветке): Onest+радиусы+примитивы `DarkIsland`/`BentoCard` + dashboard/`/learn/plan`/search-island/`/billing`.

**Visual-only:** без схемы/миграций/изменений данных/auth. Прод-флаг `PARTNER_COURSES_ENABLED:"true"` уже стоял → mpstats deep виден. Деплой: staging (`--no-cache web` + base64-content-check бандла, т.к. кириллица в SSH→docker grep мангается) → ОК owner → прод (`--no-cache web` + recreate + content-check + smoke 200). Откат: `git revert -m 1 932f597` + редеплой. typecheck зелёный, web 247.

**Готчи:** Windows `git worktree remove` падает на файл-локе (worktree разрегистрируется, папка остаётся → добивать `cmd //c rd /s /q` + `git worktree prune`); на ветке висели чужие uncommitted-файлы контент-инжест-инстанса (merge делал в отдельном чистом worktree, чтобы не попали в релиз). Память: `~/.claude/projects/.../memory/project_design_system_v2_reskin_shipped.md`.

## Previous Session (2026-06-16) — Phase 65 «Cohesive dark /register + /login» shipped to prod

**Merge `62e69e3` (`--no-ff` `phase-65-register-split-layout` → master) + prod deploy `maal-web-1`.** Обе входные страницы переоформлены в цельный тёмный маркет-стиль.

**Что на проде:**
- `/register` и `/login` выведены из центрированной `(auth)`-группы (`git mv`) в **собственные тёмные лейауты, переиспользующие маркетинговый дизайн** (а не перерисовывающие): `V8Header` (прозрачный над тёмным, белый wordmark-лого, нав, синяя pill, white-on-scroll) + `V8Footer` (`#0a0f1e`, `rounded-t-[40px]`, `wrapperBg="dark"`) + шрифт **Onest** через `next/font` на обёртке + фон `#0F172A`, форма — белая парящая карта.
- `/register` — сплит: форма слева (col1 row-span-2 self-center), справа промо = заголовок (`RegisterValueTeaser`) + 4 плашки-тезиса + полоса цены (`RegisterValueStats`); мобайл order заголовок→форма→тезисы. `RegisterValuePanel` удалён.
- `/login` — форма центрирована на тёмной канве (`min-h-[68vh]`), без промо.
- **Формы не тронуты** (реальный `react-international-phone`, Яндекс, согласия, реф-баннер по `?ref=`). `/forgot-password` и прочие `(auth)`-страницы остались на старом светлом лейауте.
- Создан гайдлайн дизайн-системы `docs/superpowers/specs/2026-06-16-marketing-design-system.md` (токены/тайпскейл/кнопки/карточки/V8Header/V8Footer/motion + чек-лист переиспользования).

**Урок:** первая итерация регистрации собрана в отрыве от маркет-стиля (плоская синяя панель, самопал-лого, белый хедер) → owner забраковал. Пивот: переиспользовать `V8*`-компоненты + Onest. Gotchas: внешний `<svg><use>` без `viewBox`=300px (ломал лого/мобайл в превью); стейл `.next/types/app/(auth)/...` после `git mv` валит `tsc` (TS2307) — удалить стейл-типы. **Шрифт:** root layout грузит Inter, маркет-страницы ставят Onest по-странично — вход обязан явно ставить Onest.

**Tests:** web 244/244, typecheck 6/6. Staging-прогон (`--no-cache`+content-check) перед прод. **Откат:** `git revert -m 1 62e69e3` + редеплой. Память: `project_phase65_entry_pages_redesign.md`. Ветка `phase-65-register-split-layout` смержена (можно удалять). На VPS staging-дерево возвращено на master (был на phase-65).

## Previous Session (2026-06-11) — Phase 64 «Бесшовный вход из MPSTATS» shipped DARK to prod

**Merge `60e77b6` (PR #18, `--no-ff` → master) + prod deploy `maal-web-1`. Эндпоинт ТЁМНЫЙ** (флаг `PARTNER_ENTRY_ENABLED` не задан на проде → ручка отдаёт redirect на `/`, юзеров не создаёт). Полный цикл: brainstorm → спек → план → 10 TDD-задач субагентами + ревью → staging UAT → 4 UX-доработки по фидбэку.

**Что на проде (инертно до go-live):**
- **Публичная ручка** `GET /api/partner/mpstats/enter` (`name/phone/email/module_code`) → приземляет в урок партнёрского курса `07_instruments`. Гейт `PARTNER_COURSES_ENABLED==='true' && PARTNER_ENTRY_ENABLED==='true'`.
- **Ветвление:** trusted (HMAC-подпись) — **dormant** (у Игоря только фронт, подписывать некому; код готов, зажжётся при появлении бэк-подписанта, env `MPSTATS_PARTNER_SIGNING_SECRET`). Untrusted day-1: новый email → авто-создание (`email_confirm:true` + `user_metadata.partner_pending_verify/passwordless`) + авто-сессия (паттерн Yandex-callback); существующий + наша кука → молча в курс; существующий без куки → magic-link.
- **Онбординг:** новый юзер → `/welcome?next=/mpstats-tools/...` → визард → финиш в курсе.
- **Combined «finish setup» баннер** (`PartnerSetupBanner` в `(main)/layout`): 2 независимых CTA — «Подтвердите почту» (resend, 60s throttle) + «Задайте пароль»→`/profile`. Set-password: session-based `updateUser`, без старого пароля (`profile.passwordless`).
- **Биллинг/схему НЕ трогали** (гейт оплаты осознанно отвергнут), миграций нет, бэкафилла нет. Подтверждённость в `user_metadata`.

**Включение вживую** = `PARTNER_ENTRY_ENABLED: "true"` в прод `docker-compose.yml` + `up -d` (runtime, без rebuild), ПОСЛЕ 4 внешних: (1) CQ-правило на событие `pa_partner_magic_link` (без «один раз» — иначе magic-link не уходит); (2) маппинг 24 кодов Игоря → `Lesson.metadata.partnerModuleKey`; (3) форма Игоря постит на ручку; (4) Кара ставит `module_code` в кнопки. Плюс IP rate-limit на ручку перед флипом.

**Откат:** `git revert -m 1 60e77b6` + редеплой (или не включать флаг).

**Tests:** web 239, api 209, typecheck 6/6. Спек `docs/superpowers/specs/2026-06-10-mpstats-tools-seamless-auth-design.md` + план `docs/.../plans/2026-06-10-mpstats-tools-seamless-auth.md`. Память: `project_phase64_mpstats_seamless_auth.md`. Ветка `phase-64-mpstats-seamless-auth` смержена (можно удалять); на VPS staging остался на ней с `PARTNER_ENTRY_ENABLED=true` — перед след. прод-деплоем там нужен `git checkout master`.

## Previous Session (2026-06-09) — Phase 63 «Аналитика 2.0» shipped to prod

**Release `90b6192` (`--no-ff` merge `phase-63-analytics-revamp`→master) + prod deploy `maal-web-1`.** Груминг + выручка + воронка раздела `/admin/analytics`, 3 волны субагентами (TDD), каждая прошла staging + холистическое ревью (все READY TO SHIP).

**Что на проде:**
- **Навигация:** `/admin/analytics` разведён на 4 таба (Обзор/Выручка/Воронка/Контент) через `AnalyticsTabs` + `analytics/layout.tsx`. **Баг «оторванной шапки» пофикшен структурно** — у каждого таба свой селектор периода над своими графиками. Аналитика вынесена из разбухшего `admin.ts` (1187 стр) в `admin.analytics.*` (`admin-analytics.ts`).
- **Выручка** (`/revenue`): MRR = **только рекуррент** (`ACTIVE + cpSubscriptionId != null`, by owner request — не-рекуррентные ACTIVE не раздувают), `recurringPayers`, ARPU = mrr/recurringPayers, сплит планов, приход по дням (`Payment` COMPLETED), прогноз продлений (рекуррент в окне).
- **Воронка** (`/funnel`): конверсия рег→диагностика→оплата; **точный trial→paid** через `deriveTrialConversion` (вывод из данных: TRIAL = отдельные иммутабельные строки, конверсия = первый COMPLETED `Payment`; conversionRate по «дозревшим» триалам; days-to-convert от trialEnd) + **регресс-тест инварианта** «TRIAL-строки не меняют статус» (`trial-invariant.test.ts`); отток (CANCELLED/PAST_DUE/churnRate); атрибуция реферал/органика.
- **Тест-юзеры:** `UserProfile.isTest` (аддитивная миграция через Mgmt API) + хелпер `isExcludedFromRevenue` (правило: `user.isTest || plan.hidden`) во всех денежных/воронных метриках + тогл в `/admin/users`. **19 аккаунтов помечены `isTest=true`** (весь штат `@mpstats.io`/`@mpstats.academy` + `e.n.vasilyev@yandex.ru` через hidden-план).

**Чистые функции** (`packages/api/src/utils/`): `test-exclusion`, `revenue-metrics`, `trial-conversion`, `funnel-metrics` — все юнит-тестированы изолированно. Процедуры тонкие (fetch → pure fn → enrich).

**Прод-БД:** миграция `20260608000000_add_user_is_test` применена к общей Supabase через Mgmt API (аддитивно, прод-коду до релиза невидима) + `_prisma_migrations` row + бэкафилл 19 isTest. Деплой: build при работающем контейнере → `up -d` (recreate, минимум даунтайма). Smoke: `/` 200, content-check `getTrialConversion` в бандле. **Откат:** `git revert -m 1 90b6192` + редеплой.

**Tests на релиз:** typecheck 6/6, api 209/209, web 211/211, ai 58/58. Спека+планы: `docs/superpowers/specs/2026-06-08-phase-63-analytics-revamp-design.md` + `docs/superpowers/plans/2026-06-08-phase-63-wave-{1,2,3}-*.md`.

**Память:** `project_phase63_analytics_revamp.md`.

## Previous Session (2026-06-08) — Phase 62 «Инструменты MPSTATS» partner course shipped to prod

**Бесплатный курс инструментов сервиса MPSTATS как изолированный раздел `/mpstats-tools`** (паттерн «партнёрский курс», верх воронки: юзер приходит за инструментами → видит платный контент → paywall → конверсия). Расширяемо под будущие партнёрские курсы (Точка Банк через Точка ID). Релиз через `git merge --no-ff` в master + env-флаг.

**Что на проде (включено `PARTNER_COURSES_ENABLED=true` в `docker-compose.yml`):**
- Курс `07_instruments` (`Course.partnerKey='mpstats'`, новый nullable столбец + миграция), 42 урока / 15 инструментов. Каталог = компактные карточки, мульти-инструмент = аккордеон inline, одиночный → сразу плеер. Плеер переиспользует KinescopePlayer + ai.chat + saveWatchProgress.
- **Изоляция:** `course.partnerKey: null` добавлен в diagnostic.ts (4 запроса) + learning.ts (трек + getCourses/getCourse) → партнёрка НЕ в диагностике/треке/job-каталоге. В `ai.searchLessons` остаётся (помечена `isPartner`, всегда unlocked, роутится на `/mpstats-tools/<id>`). Бесплатность — bypass в `access.ts` по `partnerKey`, **НЕ по `isFree`** (тот dormant `@default(true)` — открыл бы все платные курсы).
- **Иконка** сайдбара = play-mark платформы (`LogoIcon`, экспортирован из `Logo.tsx`) в фирменном зелёном MPSTATS `#17BF50` (из `go_mpstats_academy/brand-assets/logos`).
- **Видео:** 42 ролика (8.5 ГБ) залиты на Kinescope (папка `a1c43064...`), `Lesson.videoId`/`videoUrl` проставлены. **RAG:** 231 chunk на проде (RAG Phase A сделана в проекте `E:\Academy Courses`, courseId/lesson_id = `07_instruments_*`; `Lesson.id` обязан совпадать с `content_chunk.lesson_id` — сверено 42/42, 0 orphan).
- **Партнёр-роутер** `packages/api/src/routers/partner.ts`: `getCatalog` (группы по `metadata.toolGroup`), `resolveModule` (deep-link `?module=<key>` по `metadata.partnerModuleKey`), `getLesson` (всегда unlocked).

**Env-флаг (ключевой паттерн):** `PARTNER_COURSES_ENABLED` (runtime, на контейнер). Нужен потому что **staging делит ту же prod-Supabase** → `isHidden` не разводит видимость stage/prod. Гейт: nav-item (sidebar+mobile через проп из `(main)/layout.tsx`), весь раздел (`(main)/mpstats-tools/layout.tsx` server-redirect→/learn), searchLessons (фильтр isPartner). Флипается env + `docker compose up -d` без пересборки. Прод: `=true` (включён). Выключить = убрать строку из prod compose + up -d.

**Прод-БД операции через Supabase Mgmt API** (паттерн `reference_supabase_migration_via_mgmt_api.md`): миграция `partnerKey` (колонка+индекс+`_prisma_migrations`), seed Course+42 Lesson (upsert, videoId не трогается при повторе).

**Косяк сессии (учиться):** при просьбе owner «сначала staging, потом отдельно прод» агент склеил staging+prod-деплой+раскрытие в один runbook и выкатил раздел видимым на прод без ревью. Исправлено env-флагом (prod off / staging on), owner проверил на staging → дал ОК → включили на проде. Урок: «сначала staging» = НЕ катить прод в том же заходе; на shared-БД для prod-hidden/staging-visible нужен env-флаг с самого начала.

**Tests:** api 187/187, web 210/210, typecheck 6/6. Попутно починен orphan-тест `welcome-step-intent-resolve.test.tsx` (хотфикс `dc645c7` сделал ответ на шаге обязательным, старый тест кликал «Далее» без выбора) + `pnpm install --force` (параллельный инстанс затёр `@jridgewell/sourcemap-codec` в pnpm-сторе).

**Релизные коммиты:** `f491661` (merge phase-62→master) → `daf3b0b` (env-flag) → флаг-on на проде (`docker-compose.yml`). Откат: убрать флаг (мгновенно скрыть) или `git revert` + редеплой.

**Осталось:** финал `partnerModuleKey` согласовать с командой MPSTATS (кнопки deep-link в их сервисе; сейчас provisional, ссылки рабочие). **Часть 2 — бесшовная авторизация** (отдельный спек, спек Части 1 в `docs/superpowers/specs/2026-06-05-mpstats-tools-partner-course-design.md`; блокер = что выставит команда MPSTATS: OAuth / подписанный токен / секрет).

**Память:** `project_phase62_mpstats_tools.md`.

## Previous Session (2026-06-05) — Onboarding hotfix: required answer per wizard step

**Hotfix `dc645c7` (direct to master, prod deploy `maal-web-1`).** Прод-баг: кнопка «Продолжить»/«Далее» в визарде `/welcome` пропускала шаг даже без выбранного ответа — юзеры проскакивали онбординг с пустыми полями квалификации (goals/marketplaces/experience).

**Фикс** (`apps/web/src/app/welcome/page.tsx`): добавлен `canAdvance` — гейт по шагам, кнопка `disabled` пока нет ответа. Шаг 1 = хотя бы один чип цели **или** непустой свободный текст; шаг 2 = ≥1 маркетплейс; шаг 3 = выбран уровень опыта. Подсказка под кнопкой меняется на «Выберите хотя бы один вариант, чтобы продолжить», пока ответа нет. Тест `apps/web/tests/unit/welcome-page.test.tsx`: старый regression-тест навигации обновлён (выбирает ответы), +2 новых теста (гейт на каждом шаге; свободный текст = ответ на шаге 1). web 210/210, typecheck зелёный.

**Деплой:** master clean == origin до пуша (зашипился только этот фикс), VPS ff-pull → `build --no-cache web` → recreate (healthy). Content-check: новая строка в свежем `.next` (2 файла, не стейл — node-скан внутри контейнера, т.к. grep по кириллице через SSH→docker мангалит кодировку). Прод-smoke: `/` 200, `/welcome` 307 (auth-redirect). Откат: `git revert dc645c7` + редеплой.

## Previous Session (2026-06-05) — Обучение 2.0 (Phase 61 + 61.1 + DAU/WAU/MAU) shipped to prod

**Release `4145a68` merged `learning-2.0-redesign`→master + prod deploy `maal-web-1`.** Один большой релиз: вся Phase 61 (редизайн раздела «Обучение») + Phase 61.1 (UAT-фиксы) + админская аналитика активных юзеров.

**Что на проде сейчас:**
- **Phase 61 «Обучение 2.0»**: раздел разведён на 4 сущности — `/learn/plan` (Персональный план), `/learn/solutions` (Решения под задачу, scoped AgentSearch→intent.resolve), `/learn/library` (База знаний, ai.searchLessons + каталог материалов), `/learn/favorites` (Избранное). Сабменю «Обучение» в sidebar + mobile pill-tabs. Дашборд с 3 входами + hero-поиск. Модель `Favorite` (полиморфная, IDOR-safe CRUD) + сердечко на Job/Material/Lesson. Миграция трек→Избранное (backfill применён ранее).
- **Phase 61.1 UAT-фиксы**: задачи добавляются только в Избранное (сердечко, модель A — убрана track-механика); Персональный план — **секции-аккордеон** по приоритету (errors/deepening/growth/advanced; иттерация после UAT 04.06 — плоские бейджи дублировались/перекрывались) + блок «Рекомендованные задачи» из addedJobs; полный нейминг джоба→задача / трек→план; крошки «Решения под задачу / [Задача] / Урок» при заходе в урок из задачи (`?from=job:`). CR-01 (--dry-run precedence в cleanup-скрипте) + WR-01 (legacy flat-path видит jobs-блок) исправлены.
- **DAU/WAU/MAU аналитика** на `/admin/analytics` (add-on, не отдельная фаза): таблица `UserActivityDay` (heartbeat пиггибэком на `lastActiveAt` в protectedProcedure), `admin.getActiveUserStats` (rolling DISTINCT SQL), UI — 3 серии recharts + карточки + stickiness + период-селектор. История бэкафилл-нута приблизительно (250 строк / 190 юзеров из diagnostic/chat/comments) — точные значения копятся going-forward.

**Прод-БД операции (через Supabase Mgmt API):** `UserActivityDay` table + index созданы, `_prisma_migrations` row записан (checksum), бэкафилл 250 строк. **addedJobs cleanup применён**: 13→0 планов с непустым addedJobs, Favorite(JOB)=42 и LessonProgress=1708 не изменились (инвариант D-03/D-07). Favorite table + трек→Избранное backfill были применены ранее (в ходе Phase 61 dev).

**Tests на момент релиза:** api 168/168, web 208/208, typecheck (web+api) зелёные. Staging-прогон через `--no-cache` build + content-check. Прод smoke: `maal-web-1` healthy, bundle-content (3 маркера) ✓, HTTP 200.

**Откат:** `git revert -m 1 4145a68` + редеплой (релиз — один merge-коммит).

**UAT-статус:** ✅ Закрыт. HUMAN-UAT фаз 61 (9/9) и 61.1 (6/6) → `status: passed` 2026-06-05 — owner проверил всё на staging + prod, замечаний нет.

**Память:** `project_learning_2_0_release.md` (в `~/.claude/projects/.../memory/`).

## Previous Session (2026-06-01) — Phase 59 v2 (static-deck diagnostic) shipped to prod

**PR #16 `b89a54e` merged to master + prod deploy `maal-web-1`.** Pivot away from LLM-generated marketplace-tagged question banks to a hand-curated static deck of 30 questions (15 WB Q1-Q15 + 15 Ozon Q16-Q30), 5 competencies × 3 difficulty levels per deck. Methodology source: 2 Google Docs prepared by content team, snapshotted as raw JSON + parsed markdown under `.planning/phases/59-.../methodology-decks/`.

**Что живёт на проде сейчас:**
- `diagnostic.startSession` собирает 15 вопросов через `pickDeckForUser(userMarketplaces, session.id)` + `shuffleOptions(q, session.id)` для каждого. WB-only → все 15 WB; Ozon-only → все 15 Ozon; BOTH → детерминированный микс 7-8 по матрице 5×3 (`packages/api/src/diagnostic/static-deck.ts` + `deck-picker.ts` + `option-shuffler.ts`).
- Канонический «правильный = A» из источника шафлится server-side через seeded Fisher-Yates (`mulberry32` от hash(`sessionId + '::' + questionId`)) → юзер не угадывает по позиции, F5 стабилен, два запуска одного юзера → разные раскладки.
- Бейдж «Про Wildberries» / «Про Ozon» на карточке вопроса — только для BOTH-юзера (`userMarketplaces.length === 2`). Single-MP юзер бейдж не видит.
- `submitAnswer`/scoring/`getResults` untouched — `correctIndex` в persisted `session.questions` уже post-shuffle.
- LLM-bank в `packages/api/src/utils/question-bank.ts` помечен `@deprecated` и не вызывается из runtime. `QuestionBank` Prisma model + строки в prod БД остаются как dormant — cleanup не срочный.
- Phase 58 рекомендация джоб (`getRecommendedJobsFromGaps` через `errors[]`/`deepening[]` axis-сигнал) получает теперь более чистый вход — 3 вопроса на ось вместо неровного LLM-pool.
- CarrotQuest `pa_diagnostic_completed` event + `pa_diagnostic_pool_size = '15'` (теперь константа) + `pa_diagnostic_marketplaces` lead-props.

**Tests на момент merge:** api 123/123, web 205/205, 6 пакетов typecheck зелёные. CI на PR — все 4 проверки SUCCESS.

**Эволюция фазы за сессию:** Phase 59 изначально планировалась как LLM-генерируемый банк с Google-Sheet-tagger и prod DELETE/prewarm rollout (старые планы 59-03/04). В сессии прилетели готовые 30 вопросов от методологов → выкинули оба старых плана, написали новые 59-03 (pure utilities, TDD) и 59-04 (wiring). Полная история решений: `.planning/phases/59-.../59-CONTEXT-v2.md` (D-V2-01..D-V2-10).

**Memory entries:** `project_phase58_diagnostic_on_jobs.md`, `project_phase59_static_deck_diagnostic.md` (в `~/.claude/projects/.../memory/`).

## Previous Session (2026-05-28) — Phase 58 + Phase 60 + admin-analytics + register-banner hotfix shipped to prod

**Огромная сессия: 4 PR через master + миграция на prod БД, всё работает.**

**PR #11 (`eccb348`) — admin analytics fix.** Топ-5 активных юзеров в `/admin/analytics` теперь показывает Email + Завершено (раньше только «Уроков просмотрено» = `LessonProgress` row count, обманчиво — у топа avg 21-29% досмотра, реально row-creators не зрители). Колонка «Уроков просмотрено» → «Открыто уроков». Backend `getWatchStats.topActiveUsers` через `auth.users` raw query.

**PR #12 (`3ca8fb6`) — Phase 58 Diagnostic on Jobs.** 4 плана, 255 тестов, GSD acceptance gates ✓. Внутри (a) wizard step 2 онбординга 7→2 опции (только WB + Ozon), (b) **backfill `UserProfile.marketplaces` уже применён** к prod БД 26.05 для ~200 юзеров (commit `5c48ad4` — факт-запись), (c) диагностика теперь рекомендует **top-3 джобы** с bulk-CTA «Добавить все 3 в трек», (d) legacy `LearningPath` flat-format → sectioned auto-rebuild для ~170 юзеров (D-07 hard rule: `LessonProgress` не трогаем). До деплоя VPS был «оставлен» на ветке phase-58 предыдущим агентом — починили (`git checkout master` обязателен).

**PR #13 (`6927f21`) — Phase 60 Ambassador Codes.** GSD-флоу полный цикл за сессию: discuss → spec → context → plan-phase (gsd-planner 4 PLAN.md + plan-checker PASS) → execute-phase (3 waves, 2 параллельных executor в Wave 2). 4 sprint:
- 60-01: schema migration (additive) + `resolveReferralCode` resolver + `generateAmbassadorCode`
- 60-02: `issueReferralOnSignup` AMBASSADOR-ветка (race protection on maxUses через in-tx recheck, 5-min stale-user window D-03, null-safe `checkFraudSignals`, CQ event `pa_ambassador_signup`)
- 60-03: `/admin/referrals/codes` page + 4 tRPC `referral.admin.*` (zod `.strict()` для D-01 immutable, cross-table uniqueness vs `UserProfile.referralCode`)
- 60-04: Playwright E2E + 9-сценарийный `60-HUMAN-UAT.md` + `60-DEPLOY-RUNBOOK.md` + deploy gates

Migration `20260528000000_add_referral_code_table` применена к shared prod БД через **Supabase Management API** (VPS не имеет pnpm/prisma — паттерн в `~/.claude/projects/D--GpT-docs-MPSTATS-ACADEMY-ADAPTIVE-LEARNING-MAAL/memory/reference_supabase_migration_via_mgmt_api.md`). Owner создал тестовый код в админке, отдал маркетингу — UAT прошёл.

**PR #14 (`eb1946c`) — Phase 60 register-banner hotfix.** Поверх PR #13 owner заметил: при переходе по `/register?ref=AMB-XXX` баннер «🎁 N дней» не показывался — `referral.validateCode` (public endpoint) лукапил только `UserProfile.referralCode`, не знал про AMBASSADOR. Фикс: routing через `resolveReferralCode`, возврат `trialDays` + `type` discriminator, register-form динамический trial days, баннер «По приглашению **<label>**» для ambassador (vs «От пользователя:» 53A). 4 новых теста (active/expired/disabled/max-reached). Постмортем планера — заметка `feedback_planner_missed_public_endpoint.md` (плановик мыслил в терминах модели, забыл про public read consumers).

**Параллельный агент на Phase 59** — handoff-нота лежит в main MAAL tree на phase-59 ветке: `.planning/phases/59-marketplace-aware-diagnostic-questions-wb-ozon/HANDOFF-2026-05-28.md`. Описывает что улетело в master, какие файлы могут пересечься, recommended rebase procedure. Конфликтов не ждём — другая зона кода.

**Cleanup TODO:** worktrees `phase-60-ambassador-codes/` и `phase-60-banner-fix/` остались на диске (cleanup упал с «filename too long» на Windows). Не блокирует.

## Previous Session (2026-05-25) — Track B (agentic search) shipped to prod

**PR #10 (`a9c8402`) + hotfix `820c5b8` merged to master and deployed to prod.**

Track B per `docs/superpowers/specs/2026-05-20-agentic-search-design.md`. Replaces keyword search on `/learn` with an intent box that returns `recommend` / `clarify` / `fallback` / `empty` over jobs. Same engine pre-resolves intent during `/welcome` Step 1 (fire-and-forget, result cached to sessionStorage for `/learn` pickup).

- **Backend** `packages/ai/src/intent/` + `packages/api/src/routers/intent.ts`. `intent.resolve` mutation: embedQuery → parallel job-embedding + chunk-aggregation retrieval → merge (0.7 emb + 0.3 chunk) → LLM synthesize via gpt-4.1-mini with strict JSON schema, zod validation, hallucination guardrail (LLM jobIds whitelisted to retrieval candidates). Server enriches recommend response with title/slug/lessonCount inline. Broad-query detector forces clarify mode for single-token queries («Ozon», «реклама»).
- **DB** Additive migration `20260522000000_add_job_embedding`: `Job.embedding vector(1536)` + ivfflat cosine index. All 29 jobs backfilled via `packages/ai/src/intent/embed-jobs.ts`.
- **Frontend** `AgentSearch` (`apps/web/src/components/learning/AgentSearch.tsx`) replaces SearchBar on `/learn`. Subscribes to `learning.getRecommendedPath` for reactive «В треке ✓» state. `/welcome` `StepIntent` fires `intent.resolve(surface: 'welcome')` in background, key `WELCOME_INTENT_RESULT_KEY` stored separately in `apps/web/src/components/welcome/intent-key.ts` (Next.js page-export safety). `/learn/track` polish: «Мои плейбуки» compact card grid, lessons live on playbook detail page. Flat-list fallback for legacy unsectioned paths now has «Мои уроки» card header + remove-from-track button (pre-existing UX gap surfaced when playbooks stopped masking it).
- **Marker hotfix `820c5b8`** (post-merge) — Phase 57's `isRecommended` flag fired for any job whose lessons sat in the user's path, including manually-added playbooks via «+ В трек», so an AgentSearch add incorrectly tagged the job amber. Split into two independent JobSummary flags: `isInTrack` (green «В треке» — `addedJobs[]` contains the job) and `isRecommended` (amber «Рекомендовано диагностикой» — at least one lesson not from any added playbook). Mutually exclusive at render time, in-track wins.

**Eval** 22-case harness (`scripts/intent-eval/`) scored **20/22 = 90.9% PASS** (gate 85%) on final run. Calibration history in commit `7800370`: rewrote LLM prompt with explicit field-name examples (LLM was emitting `recommendations`/`message` instead of `jobs`/`answer`), lowered retrieval threshold 0.5 → 0.2, added isBroadQuery code-level guardrail + empty→clarify synthesis.

**UAT rounds 1-4 (commits `824b461` / `e4e2e6b` / `3c6ba94`):**
1. Raw cuid as title — fixed by enriching IntentResult.jobs server-side, dropped client `jobsById` lookup.
2. «+ В трек» silent — added toast + button-state flip + `getRecommendedPath` invalidate.
3. Track state local-only on repeated queries — now derives from `recommendedPath.addedJobs[]`.
4. Compact `/learn/track` playbooks + restored «Мои уроки» header + remove button on flat-list view.

**Operational notes:**
- Test user `test@mpstats.academy` has legacy flat-format `LearningPath` (98 lessonIds, no sections, generated 2026-04-30) — clicking «Перестроить по диагностике» on legacy data 500'd. Re-passing diagnostic regenerated path in sectioned format → rebuild then succeeds. Pre-existing master issue, not Track B.
- Track B branch first build failed on `WELCOME_INTENT_RESULT_KEY` exported from `/welcome/page.tsx` — Next.js rejects non-standard page-file exports (`343bfd8` fix).

**Memory entries written**: `project_track_b_agentic_search.md`.

**Roadmap refresh** (`af20702`) — `/roadmap` is customer-facing, so dropped tech items (CloudPayments / Sentry) and surfaced shipped product features: plays catalog, AI search by intent, vision RAG, onboarding wizard, referral (moved from In Progress). In Progress now: Diagnostic by playbooks (Phase 58) + catalog expansion. 4 new changelog entries 25.05 / 22.05 / 19.05 / 18.05 in user voice.

## Previous Session (2026-05-22) — Phase 57 Library Redesign shipped to prod

**PR #8 (`bb84013`) + PR #9 (`3059ad8`) merged to master and deployed to prod (https://platform.mpstats.academy).**

- **PR #8 — Phase 57 base + polish round.** Job catalog `/learn` live: lens «По задачам / Все курсы», WB/Ozon switch, 29 jobs across 5 axes. New screens `/learn/job/[slug]` (with «+ В трек» toggle + chevron affordance) and `/learn/track` (with «Мои плейбуки» section + dedup). Always-visible track banner on `/learn` with empty-state CTA to `/diagnostic`. Polish round added: `LearningPath.addedJobs` Json column (additive migration `20260521000000_learning_path_added_jobs` applied to prod), tRPC `learning.addJobToTrack` / `removeJobFromTrack`, `JobDetail.isInTrack`. Critical Rules-of-Hooks fix on `/learn/job/[slug]` — `useMutation`/`useUtils` were below `if (isLoading) return`, broke hook count, produced "first-load Ошибка загрузки, retry works" symptom across all playbooks; hoisted hooks above early returns (`72facc9`). Content team approved `JOB-PROPOSAL.validated.json` byte-identical to provisional — no re-seed needed.
- **PR #9 — Hidden-lesson auto-sync.** DB-level filter `where: { lesson: { isHidden: false, course: { isHidden: false } } }` added to JobLesson includes in `job.getCatalog`, `job.getJob`, `learning.getRecommendedPath.addedJobsRaw`. Admin sets `Lesson.isHidden=true` (or course-level) → urok auto-disappears from job cards, job detail, playbooks; `lessonCount`/`totalDurationMin`/`completedLessons` auto-recompute. `JobLesson` rows preserved — restoring `isHidden=false` brings lesson back into jobs. Use case: duplicate "Автобидер. Пошаговая настройка" lessons — owner now hides one via admin, no SQL needed.

**Staging deploy gotchas captured this session (see `.claude/memory/`):**
- `feedback_rules_of_hooks_early_returns.md` — Rules of Hooks pattern with «first load fails, retry works» symptom.
- `feedback_staging_docker_no_cache_required.md` — Always `--no-cache` on docker rebuild when .tsx/.ts changed + `grep` content-check in `.next` bundle BEFORE declaring deploy successful. Avoids "healthy container running stale bundle" trap.

**Phase 58 (next, separate spec):** migrate diagnostic onto jobs — `diagnostic.ts` recommends whole jobs; track becomes job-aware. Phase 57 built bridge data (`Job.axes` canonical-5 + `Job.skillBlocks`), did not touch `diagnostic.ts`.

## Previous Session (2026-05-21) — Supabase keys migration after JWT leak

**Инцидент:** в коммите `76356cf` файл `docs/superpowers/plans/2026-05-07-phase-55-sprint-2-pilot.md:1604` содержал ЖИВОЙ `SUPABASE_SERVICE_ROLE_KEY` (полный JWT, exp 2035) — оставлен AI-агентом вместо placeholder'а в shell-command example. Полная утечка bypass-RLS доступа к `saecuecevicwjkpmaoot`.

**Сделано:**
- **Postgres пароль ротирован** (новый `<new-postgres-password>`) — обновлён в MAAL прод/staging .env, backup-cron .env, локально (3 файла), worktree (2 файла). Прод и staging пересозданы, `database: connected`.
- **Миграция формата API-ключей: legacy `anon`/`service_role` JWT → новые `sb_publishable_*`/`sb_secret_*`** (Supabase deprecates legacy keys к концу 2026). Code rename: `NEXT_PUBLIC_SUPABASE_ANON_KEY` → `_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` → `SECRET_KEY` (26 файлов, master `4cfeee8`). Полный rebuild MAAL prod+staging (build-time inlining `NEXT_PUBLIC_*` в Next.js bundle).
- **Параллельно: миграция go_mpstats и academy-marketing-agent** на ту же модель (общий Supabase проект с MAAL). go_mpstats — 8 файлов, master `75e96dd`.
- **Legacy JWT-based API keys revoked** в Supabase Dashboard → утёкший в git history JWT мёртв.
- GH Actions secrets обновлены (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PUBLISHABLE_KEY` для keepalive).

**Worktree `phase-57-library-redesign`:** значения ключей обновлены, имена переменных НЕ переименованы (бранч в работе, код на старых именах). При merge — accept master-версию переименованных файлов.

**Деталь инцидента + recovery + правила:** [.claude/memory/incident_2026-05-21_supabase_keys_leak.md](.claude/memory/incident_2026-05-21_supabase_keys_leak.md). Глобальное правило про секреты в docs — обновлено в `~/.claude/CLAUDE.md`.

## Previous Session (2026-05-19) — Phase 56 + referral banner shipped to prod, entry-flow hotfix

**Задеплоено на прод в этой сессии:**
- **Phase 56 — Entry-flow redesign + CQ mirroring** (merged → prod, master `230d4a3`). Онбординг-визард `/welcome` (3 шага + развилка диагностика/каталог), 5 полей квалификации в `UserProfile` + additive-миграция (применена на prod), снятие жёсткого гейта диагностики (`DiagnosticGateBanner` → закрываемый хинт), редактирование квалификации в `/profile`, зеркалирование ответов визарда в CarrotQuest (`pa_marketplaces/experience/goals/goal_text` props + событие `pa_onboarding_completed`). Все ~170 существующих юзеров видят визард при следующем входе (one-time). GSD verification — `human_needed`: 2 пункта в `.planning/phases/56-entry-flow-redesign/56-HUMAN-UAT.md` (реальный Yandex-OAuth новый аккаунт + E2E-прогон в CI).
- **Phase 56 hotfix** (master `b8242c3`) — петля на развилке визарда: `router.push` → Next Router Cache отдавал протухший рендер `(main)`-гарда → юзера зацикливало назад в визард. Фикс: уход с развилки через `window.location.assign` (жёсткая навигация). Инцидент на `evasilev@mpstats.io`, подтверждён резолвлен. См. Gotchas + регресс-тест `apps/web/tests/unit/welcome-page.test.tsx`.
- **Реферальный баннер** (ПРОТОТИП 02 плана CPO; master `6615611`). Закрываемая промо-полоса в `(main)` поверх хедера — «Приведи друга → 14 дней доступа», CTA → `/profile/referral`. Все залогиненные, скрыт на `/profile/referral`, повтор через 14 дней после закрытия. `apps/web/src/components/referral/ReferralBanner.tsx`.

**Смержено ранее (status-sync с git):**
- **Phase 53A + 53B — Referral Program** (merged 2026-05-05/06). Реферальные коды, ручная активация пакетов, 14-дневный TRIAL, анти-фрод; админка `/admin/referrals`. Флаг i1→i2 — вручную ~2026-06-01.
- **Phase 55 Sprint 3 — Vision-RAG full platform** (PR #6, merged 2026-05-18). 5 курсов, smoke 89-100%, покрытие ~91.5%.

**Phase 57 — Library Redesign** (`/learn` на джобах) — в работе: ветка `worktree-phase-57-library-redesign` + PR #8, на staging. Детали — в Active Branches и `.claude/memory/`.

## Previous Session (2026-05-12) — Phase 55 Sprint 2C + Sprint 3 prep shipped to master + PITR recovery + L2 backup

**Two PRs merged to master:**
- `a3967ce` — Sprint 2C: 79 lessons of `03_ai` ingested (DB: 89 lessons / 792 frame chunks). Smoke 16/18 = 88.9% with `gpt-4.1-mini`. Cost $0.94.
- `0e20628` — Sprint 3 prep: docs (ARCHITECTURE + PLAYBOOK + safety memory) + safety infra (validate-selection + smoke-baseline) + selector v4 with DB-persisted mappings (`Lesson.metadata.videoSource` column added via R1 manual ALTER pattern) + backup L2 (daily pg_dump → nikear via Tailscale, activated on VPS).

**PITR incident 2026-05-12 — recovered.** Sibling `D:/GpT_docs/Ai_MP_manager/` ran `prisma db push --accept-data-loss` against shared MAAL Supabase, dropped 24 prod tables. Restored via Supabase PITR (12hr loss window). R1: Lesson.order migration re-applied (manual ALTER + manual INSERT into `_prisma_migrations`). R2: Sprint 2C 644 frame chunks re-ingested from local VLM dumps (~$0.001 — embedding-only). R3: LagerPro re-ingest handed back to `E:/LagerPro` pipeline owner (2299 chunks lost, out of MAAL scope). New `🚨 PROD DATABASE SAFETY` section at top of this file codifies zero-exception rules. See `scripts/vision-ingest/results/RECOVERY_2026-05-12.md`.

**Backup L2 active.** Cron @ 03:00 UTC daily on VPS deploy@89.208.106.208: docker `postgres:17-alpine` pg_dump → GPG → scp via Tailscale to nikear `/home/zebrosha/backups/maal/`. 30-day rolling. First backup 52MB on nikear. Setup guide: `scripts/backup/README.md`.

**Sprint 3 (full-platform ingest) ready.** Selector v4 + validator + smoke-baseline + DB-persisted mappings via `Lesson.metadata.videoSource` (88 already backfilled). Remaining courses: 04_workshops (24 lessons), 01_analytics (66), 02_ads (71), 05_ozon (76), 06_express (64). Total ~301 unmapped visible lessons. Est cost ~$4-5. Procedure: `scripts/vision-ingest/PLAYBOOK.md`. Safety rules: `.claude/memory/vision-ingest-safety.md`.

**CI test fixes (`9fde3ea`)** — pre-existing master failures from Phase 45 (login:default_phone scope), Phase 53A (register/page split), 2026-04-27 (prisma.$queryRaw on auth.users). 6 tests fixed, 148/148 passing.

## Previous Session (2026-05-11 daytime) — Cancel flow + Lesson.order tech debt + referral link tweak

Деплои на master: `7ded455` → `df368b3` → `79698e5` → `c473b9b`.

**Billing — UI «Отменить подписку» теперь реально отменяет.** Раньше `billing.cancelSubscription` делал только локальный `UPDATE status='CANCELLED'`, в CP API не звонил → карта продолжала списываться. Жило с Phase 19 (helper готов, но никогда не подключён). Теперь `cancelSubscription`:
- Дёргает `cancelCloudPaymentsSubscription(cpSubscriptionId)` для каждой ACTIVE подписки; CP-ошибка → 500, локальный CANCELLED не ставится.
- Отменяет **ВСЕ** ACTIVE подписки юзера (`findMany`) — защита от multi-active edge cases.
- `handleCheck` (subscription-service.ts) отбивает CANCELLED/EXPIRED как defense in depth.
- Dead helper `apps/web/src/lib/cloudpayments/cancel-api.ts` удалён, новый — `packages/api/src/utils/cloudpayments.ts`.

Боевая проверка: 4 активные 10₽ тестовые подписки закрыты, NextTransaction рекуррента стоял через 7 минут после UI-отмены. Полный лог: `.claude/memory/project_cancel_flow_fix.md`.

**Lesson.order — prev/next теперь ведёт куда надо.** Тестер Елена 07.05 сообщила, что в курсе Аналитика клик «урок 19» → попадает на «урок 20 с тем же названием». Корень: skill-batch ingests (21.04 + 24.04) ставили skill-урокам `order` от позиции в skill-блоке, игнорируя что в курсе уже были module-уроки с этими order'ами → 9 (courseId, order) дубликатов в БД, UI'шный `findIndex` для prev/next возвращал недетерминированный результат.
- Перенумеровано 257 уроков в-плейс через `ROW_NUMBER() PARTITION BY courseId ORDER BY order, id`. Tiebreaker `id ASC` даёт детерминистический логичный порядок.
- Добавлен `@@unique([courseId, order])` constraint + Prisma migration → ingest скрипты больше не могут залить дубликаты.
- `moveLessonToPosition` переписан в `$transaction` с temp-park (order=1_000_000) → атомарный drag-drop в админке без UNIQUE conflicts.
- Snapshot до миграции: `.claude/lesson-order-snapshot-2026-05-11.csv` (439 уроков).

Источник правды для порядка — админка. Методологи двигают drag-drop'ом, теперь это безопасно. Полный лог: `.claude/memory/project_lesson_order_uniqueness_fix.md`.

**Referral share link → /register?ref= (вместо /).** Идея owner'а: warm-traffic от друга → сразу видит форму регистрации + баннер «+14 дней» вместо маркетинговой главной. `ReferralCodeBlock.tsx` теперь даёт `/register?ref=CODE`. `/register/page.tsx` стал async + auth-guard: залогиненный по чужой ссылке редиректится на `/learn` (иначе видел бы форму, которую не submit'нуть). Старые `/?ref=` ссылки в чатах работают — middleware пишет cookie на ANY URL с `?ref=`. Полный лог: `.claude/memory/project_referral_link_register_target.md`.

## Previous Session (2026-05-05)

**Tester Mila feedback batch — track UX + chat disclaimer. Задеплоено (`ade7768`). Phase 55 vision chunking записана в roadmap (`7c15dc2`).**

- Бэк: `learning.addLessonsToTrack({ lessonIds[] })` — bulk до 500 уроков.
- `/learn`: кнопка `Перестроить трек` → `Перестроить по диагностике`, расширенный диалог. Hint под шапкой про фильтры. Кнопка `+ В трек (N)` на карточке курса в каталоге.
- Чат урока (desktop+mobile): дисклеймер про границы RAG (отвечает по аудио-транскрипту, не «видит» экран → дисклеймер уберём после Phase 55).

Phase 55 Vision Chunking RAG (v1.7) записано в `.planning/ROADMAP.md`.

## Previous Session (2026-05-04)

**Phase 53A — Referral Program. Branch `phase-53a-referral`, 19 commits, awaiting Egor's merge.**

При мерже задеплоится: TRIAL enum + Referral + ReferralBonusPackage + UserProfile.referralCode @unique. REF-* generator + backfill (140 юзеров без кода). Cookie attribution через middleware. Orchestrator `issueReferralOnSignup` (resolve → fraud → mode flag → transaction → CQ events). Хуки в `/auth/confirm` и Yandex callback. tRPC router `referral.{getMyState, validateCode, activatePackage}` + `/profile/referral` page + баннер «🎁 +14 дней» на `/register?ref=`. Полный детальный лог: `.claude/memory/project_phase53a_referral_program.md`.

**Технический долг:** Task 14 переместил `activation.ts`/`attribution.ts` из `apps/web/src/lib/referral/` в `packages/api/src/services/referral/`. Re-export шимы — чище через `@mpstats/api` index.

**Ждёт от Егора:** мерж в master или staging-test через push ветки → backfill на проде → QA → решение по флагу `referral_pay_gated` (i1 default = no payment required).

## Key Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| LLM model (prod) | **GPT-4.1 Mini** | Sprint 2C: 84% smoke vs nano 60% (+24%). x1.5 cost, negligible per-query |
| LLM judge / VLM | GPT-4.1 Mini | Same model for VLM frame describe + smoke judge |
| LLM fallback | Qwen 3.5 Flash | Cheaper, decent quality |
| Auth | Supabase Auth + Yandex ID | Google removed |
| tRPC batching | splitLink | AI queries (3-10s) must not block page render |
| RLS | ON + zero policies | All data via Prisma/service_role |
| Kinescope | Direct iframe | react-kinescope-player v0.5.4 broken |
| Video hosting | Kinescope | 405 videos, 209.4 GB |

## Commands

```bash
pnpm dev              # Dev server
pnpm build            # Production build
pnpm typecheck        # TypeScript check
pnpm test             # Unit tests (Vitest)
pnpm test:e2e         # E2E tests (Playwright)
pnpm db:push          # Push schema
pnpm db:generate      # Generate Prisma client
pnpm db:studio        # Prisma Studio
pnpm lint             # ESLint
```

## Project Structure

```
MAAL/
├── apps/web/                 # Next.js 14 App Router
│   ├── src/app/
│   │   ├── (auth)/           # Login, register, verify, reset, confirm
│   │   ├── (main)/           # Dashboard, diagnostic, learn, profile
│   │   ├── (admin)/          # Admin panel
│   │   ├── api/              # tRPC, webhooks, cron
│   │   └── pricing/          # Billing + promo codes
│   ├── src/components/       # UI (shadcn), diagnostic, learning, comments, pricing
│   └── src/lib/              # trpc, supabase, auth, analytics, carrotquest, notifications
├── packages/
│   ├── api/src/routers/      # profile, diagnostic, learning, ai, comments, billing, promo, referral
│   ├── ai/src/               # openrouter, embeddings, retrieval, generation, question-prompt
│   ├── db/prisma/            # Schema + migrations
│   └── shared/               # Types
├── scripts/                  # seed, ingest, skill-mapping
│   └── vision-ingest/        # Phase 55 — frame extraction → VLM → embed → DB
│       ├── PLAYBOOK.md       # Operational guide (gates, rollback, costs)
│       ├── ARCHITECTURE.md   # System design (data flow, schema, profiles)
│       └── results/decision-sprint2c.md  # Last sprint outcome
└── docs/                     # SDD, plans (superpowers/), admin-guides
```

## Supabase

- Project: `saecuecevicwjkpmaoot.supabase.co`
- Auth: Email/Password (DOI) + Yandex ID OAuth
- RLS: ON, zero policies (all via Prisma/service_role)
- Embeddings: text-embedding-3-small (1536 dims)
- Keep-alive: GitHub Action каждые 3 дня
- Details: `.claude/memory/supabase-details.md`

## Deploy

- VPS (origin, апп тут): **89.208.106.208** (AEZA, deploy user, Docker Compose). Деплой апп — как и раньше, на эту коробку.
- Redeploy: `git pull && docker compose down && docker compose build --no-cache && docker compose up -d`
- **⚠️ Сеть (с 2026-06-10):** AEZA-IP `89.208.106.208` **заблокирован на РФ eyeball-сетях** (санкц. bulletproof AS210644). `platform.`/`go.` теперь смотрят на **чистый KVMKA-IP `185.246.118.152`** (Москва), который nginx TCP-passthrough'ит на origin AEZA. Деплой апп всё равно на AEZA; KVMKA — только фронт-IP. Полный переезд с AEZA отложен. Детали: `~/.claude/projects/.../memory/project_aeza_block_kvmka_bridge.md`.
- Details: `.claude/memory/deploy-details.md`

## Staging

**URL:** https://staging.platform.mpstats.academy (basic auth `team`)
**Quick deploy:** `ssh deploy@89.208.106.208 && cd /home/deploy/maal && git checkout <branch> && docker compose -p maal-staging -f docker-compose.staging.yml up -d --build`
**После staging deploy:** обязательно `git checkout master` ДО следующего prod-deploy.
**Полный workflow** (флаги, добавление флага, known limitations): `.claude/memory/staging-workflow.md`.

## Gotchas

- `@kinescope/react-kinescope-player` НЕ РАБОТАЕТ — используется прямой iframe
- `NEXT_PUBLIC_*` вшиваются при build, не runtime
- Nginx `proxy_buffer_size 128k` обязателен для Supabase auth cookies
- CQ API: form-encoded, NOT JSON. Props через `setUserProps`, NOT `trackEvent` params
- **Node fetch к внешним API с VPS:** undici Happy Eyeballs пробует IPv6 (нет маршрута → ENETUNREACH), v4 cold-connect иногда таймаутит. Держим `NODE_OPTIONS=--dns-result-order=ipv4first` в `docker-compose.yml` + retry-обёртку (см. `YandexProvider.fetchWithRetry`)
- **Yandex OAuth — account picker:** только через `force_confirm=yes`. Стандартный `prompt=login` Yandex молча игнорирует
- **Email-канал — CQ, не Resend:** Auth-письма (DOI / recovery / email_change) идут через Supabase webhook hook → `/api/webhooks/supabase-email` → CarrotQuest → CQ SMTP. Resend в Supabase auth-конфиге как fallback, но не активируется. Если в старых memory-заметках читаешь «Resend SMTP» — устарело. Полная схема: `docs/email-architecture.html`
- **DOI/recovery ссылки:** идут на `/auth/confirm` (наш домен), не на `*.supabase.co` — фикс ERR_CONNECTION_ABORTED у Yandex Browser/AdGuard. См. `.claude/memory/project_auth_confirm_route.md`
- **`@prisma/client` import в apps/web падает (vite resolve)** — использовать `@mpstats/db` (re-exports)
- **Server-side `redirect()`-гард в layout + soft `router.push` = петля.** Гард в `(main)`-layout (напр. онбординг-редирект на `/welcome` при `onboardingCompletedAt == null`) рендерится на сервере. После клиентской `router.push` Next отдаёт протухший RSC-сегмент гарда из Router Cache → свежезаписанный флаг не виден, юзера зацикливает назад. tRPC-мутация кеш Next инвалидировать НЕ может. Уходить из gated-перехода — жёсткой навигацией (`window.location.assign`), не `router.push`. Инцидент 2026-05-19 (развилка визарда Phase 56)
- **Vision-ingest пайплайн (`scripts/vision-ingest/`):** 7 жёстких safety rules — `AbortController` timeout на каждый external fetch, JSONL resume, pre-flight `validate-selection.ts`, dry-run на новых курсах, `isHidden=false` обязательно, идемпотентный селектор с DB-persisted mappings, cumulative cost logging. Каждое правило прослежено до реального incident'а Sprint 2/2C. Cross-AI authoritative: `.claude/memory/vision-ingest-safety.md`. Запуск любого ingest — только по `scripts/vision-ingest/PLAYBOOK.md`.
- Details: `.claude/memory/cq-integration.md`, `.claude/memory/feedback_doi_resend_protocol.md`, `.claude/memory/vision-ingest-safety.md`

## QA

55 тестов (24 unit + 31 E2E), 0 failures. Test user: `tester@mpstats.academy`.
