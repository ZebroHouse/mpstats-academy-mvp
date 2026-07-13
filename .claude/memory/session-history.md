---
name: MAAL Session History
description: Detailed session notes for all MAAL development sessions (2026-03 → ongoing). Newest first.
type: project
---

> Архив лент «Last/Previous Session» из CLAUDE.md. Компактный статус — в CLAUDE.md, индекс — в MEMORY.md.

## Session (2026-07-03) — Ось-центричный редизайн диагностики/плана + оживший разбор ошибок shipped to prod

**Merge `1397a93` (`--no-ff` `feature/diagnostic-plan-axis-redesign` → master) + prod deploy `maal-web-1`.** Переработка диагностики/плана по фидбэку с реальных аккаунтов (Марина Кисельникова / Татьяна Непа): ошибки в тесте не давали разбора, финальный экран непонятен, план — «полотно». Полный цикл за сессию: факт-чек прод-данных → спека → 2 плана → subagent-driven (23 задачи, каждая имплементер + spec-ревью + quality-ревью + финальное холистическое) → RAG-привязка ошибок → staging UAT → прод.

- **Факт-чек (подтверждён на прод-данных):** задачи рекомендуются честно (не мок); «разбор ошибок» мёртв для новых юзеров — статик-дек Phase 59 не нёс `sourceLessonIds` (у Татьяны блок был — диагностика 01.06 до статик-дека; у Марины 01.07 — нет); план раздувался + growth/advanced брали уроки по `order` («VPN в продвинутом»); две таксономии (радар=оси, план=«уровни»).
- **Ось-хребет:** `AxisLearningPath v3` (`packages/shared` + `packages/api/src/utils/axis-path.ts` + `generateAxisPath` в `diagnostic.ts`), капы `PER_AXIS=5`+`GLOBAL=20`, relevance-подбор (первичная категория+уровень, без эмбеддингов v1), migrate-on-read. `getRecommendedPath` отдаёт обогащённый `{isAxis:true, sections:[{axis,label,score,tier,collapsed,jobs,lessons,errorLessons}], ...}` — **дискриминированный union 3 веток**. completion/rebuildTrack/legacy-rebuild все пишут v3.
- **Разбор ошибок:** RAG-скрипт против прода → **29/30 вопросов** привязаны к урокам-ответкам (q-wb-04 без — топ был мимо), флаг «⚠ Разбор ошибки» в плане, going-forward.
- **UI:** экран результатов один поток (`HowLearningWorks` + задачи с «Закрывает: {ось}—N%» + capped teaser 5 + CTA→`/learn/plan`; стена трёх списков убрана). План `/learn/plan` ось-аккордеон (слабые сверху, сильные свёрнуты, ошибки флагом). Paywall-CTA урока (`LockOverlay`/`PaywallBanner`/`CourseLockBanner`) → внутренний `/billing` (было маркет `/pricing`).
- **Гочи:** `removeFromTrack`/`addToTrack`/`addLessonsToTrack` бросают BAD_REQUEST на v3 → UI не вешает per-lesson remove на ось-секции; новый tRPC-контракт сломал не-внесённых в план консьюмеров (`learn/[id]`, `DiagnosticSummary`) → урок: новый контракт ответа = grep ВСЕХ консьюмеров + сузить union; staging=прод-Supabase → UAT тест-аккаунтом `axis-uat@mpstats.academy` (isTest).

**Деплой:** staging `--no-cache web` UAT → merge `--no-ff` → прод build `--no-cache web` + recreate + smoke internal+public 200 (DB connected). Аддитивно, без миграций, `LessonProgress` не тронут. Тесты: api 366/366, shared 4/4, оба backend typecheck 0, web typecheck 0, web 362/363 (1 = known yandex-oauth флейк). **Откат:** `git revert -m 1 1397a93` + редеплой. Roadmap-запись добавлена в master (`526f24f`, поедет со след. прод-релизом; прод сейчас `1397a93`). **Бэклог:** воскрешение `DiagnosticHint` (перемотка-в-видео на момент ответа на проваленный вопрос) — нужны question-level таймкоды (глубокий RAG chunk-match / методологи); скаффолд помечен dormant в `learn/[id]/page.tsx`. Память: `project_diagnostic_axis_redesign.md`.

## Session (2026-07-01) — Пересборка CTA главной + go-live партнёрской ручки MPSTATS

Сессия дебага/фич по запросам owner. Всё через изолированные worktree → TDD → staging build-gate → PR merge → прод `build --no-cache web`. Детали — в памяти (`project_landing_cta_rework.md`, `project_partner_entry_golive.md`).

- **Пересборка CTA маркетинг-главной `/`** (PR #23 `37ec228`). Главный CTA «Попробовать бесплатно» (гость→`/register`, authed «Перейти в обучение»→`/dashboard`) в хиро+финале+плавашке; диагностика — вторичный CTA в mid-секции (гость→`/skill-test`, authed→`/diagnostic`); юзернейм `V8Header`→`/dashboard` (было `/profile`); фикс бага плавашки `StickyCTA` (`hideWhenId` + IntersectionObserver — не наезжает на футер/дубль). Хелпер `getMarketingCta(isAuthed)` (`apps/web/src/lib/marketing-cta.ts`). Гоча роутинга: форма `/login` игнорит `?next` (middleware его кладёт) → «сохранение намерения» НЕ работает, поэтому гость на диагностику через `/skill-test`.
- **Партнёрская ручка `/api/partner/mpstats/enter` (Phase 64) ОТКРЫТА на проде** для тестеров Игоря (инструменты MPSTATS): IP rate-limit (PR #24 `apps/web/src/lib/rate-limit.ts`, 10 req/60s/IP), затем `PARTNER_ENTRY_ENABLED: "true"` в git-версии `docker-compose.yml` (PR #25, runtime env, без пересборки). Работает: новый email→авто-сессия, existing-залогиненный→молча. **Партнёрских НЕ шлём в amoCRM** (PR #26 `572b352`): durable-метка `user_metadata.partner_source='mpstats'` в `createPartnerUser` → `onboarding.complete` пропускает `sendAcademyLead`. Выборка партнёрских: `SELECT ... FROM auth.users WHERE raw_user_meta_data->>'partner_source'='mpstats'`. Живое подтверждение: `elena.zaton@mail.ru` (партнёрская, онбординг прошла, в amoCRM НЕ улетела).
- **ПЕНДИНГ (внешнее, owner→CQ):** правило CarrotQuest `pa_partner_magic_link` (автописьмо magic-link для existing-НЕ-залогиненных). ТЗ: `docs/partner/carrotquest-magic-link-rule-spec.md`.

**Откаты:** каждый `git revert -m 1 <merge>` + редеплой; ручку выключить = убрать `PARTNER_ENTRY_ENABLED` из compose + `up -d web`.

## Session (2026-06-30) — Витрина (storefront) на /dashboard shipped to prod

**Merge `4bc08b4` (`--no-ff` → master) + prod deploy `maal-web-1`. Задача #3 funnel-roadmap закрыта.** Полный цикл: brainstorm (визуальный компаньон) → спека → план (3 волны, 14 задач) → subagent-driven TDD (имплементер `coder` + spec-ревью + code-quality-ревью на каждую содержательную) → owner local review (`pnpm dev`, читает прод) → 4 UX-доработки (R1–R4) → деплой. Детали + гочи: память `project_storefront_dashboard.md`.

**Суть:** `/dashboard` из «пары кнопок куда идти» → редакторская витрина для low-intent (половина регистраций не открывала ни урока). Лента полок на онбординг-сигнале + ручные `badges` (хребет: аддит. колонка на `Lesson`+`Job` via Mgmt API). State-aware порядок полок, страница-коллекция (смешанный вывод Задачи+Уроки — поверхности не было), возврат фильтров в библиотеку, визуальное различение Задача(тонировка)/Урок(белый). Первая пачка тегов 12ур+6джоб owner-approved на проде.

**UX-доработки по owner-фидбэку (после local review):** R1 state-aware порядок (Продолжить↔Начни отсюда по прогрессу), R2 сжатый верх + убран дубль «Продолжить урок», R3 цветные кнопки-входы, R4 различение карточек (вариант B из 3-х в визуальном компаньоне).

**Деплой/интеграция:** origin/master уехал +10 коммитов (PR #19–22 параллельной команды) за сессию → merge origin/master в ветку (чисто, без конфликтов). staging `--no-cache web`+content-check → master `--no-ff` → прод build+recreate → smoke (`/`200 `/api/health`200 `/dashboard`307). Тесты на релиз: api 335/ai 82/web 324/typecheck 6/6 (web-флейк yandex-oauth отбит изоляцией). **Откат:** `git revert -m 1 4bc08b4` (badges аддитивны). Хвосты: админ-редактор тегов, авто-HOT, fallback верхней полки для «всё прошёл».

## Session (2026-06-30) — 3 фикса на прод: телефоны лидов, ассистент урока, склонение плашек

Дебаг-сессия по жалобам owner. 3 фикса зашиплены на прод, каждый: изолированный git worktree от master → TDD → staging build-gate (`--no-cache web`) → PR merge → прод `build --no-cache web` + recreate + smoke (internal+public 200). Параллельно в каталоге шёл storefront-агент → работал в worktree-изоляции, общее дерево не дёргал. Детали — в памяти.

- **Телефоны лидов не доходили до amoCRM и в реестр `/admin/analytics/clients`** (PR #19 + Supabase Mgmt API). Email-телефон собирался (required → `auth.users.raw_user_meta_data.phone`), но триггер `handle_new_user` создавал `UserProfile` БЕЗ него, а `ensureUserProfile` (update-ветка) не бэкафиллил → 100% email-юзеров с пустым `UserProfile.phone`; и реестр, и лид `sendAcademyLead` слали пусто. Яндекс не затронут (callback явно upsert'ит phone). Фикс via Mgmt API (без table DDL): `phone` добавлен в `handle_new_user` + бэкафилл 176 строк из метаданных. amoCRM задним числом НЕ дозаполнен (ушедшие лиды). Память `project_email_phone_persistence_fix.md`.
- **Ассистент в уроке отвечал «в этом фрагменте урока ответа нет» на нормальные вопросы** (PR #20 `5dd806c`). Два корня: (1) порог ретрива 0.5 слишком строг для чата ВНУТРИ урока (`lessonId` уже сужает пул до одного урока) → fallback `threshold:0`, когда первый проход пуст; (2) селлерские аббревиатуры (ЦА, ДРР, CPO, SKU…) ломали эмбеддинг → `expandSellerQuery` (`packages/ai/src/seller-lexicon.ts`, ~30 терминов из глоссария команды `docs/obshchiy_glossariy_sellera_2026.docx`) дописывает расшифровку к ЭМБЕДДИНГ-запросу в чате урока + `searchLessons` + `intent.resolve` (сообщение юзеру/LLM — оригинал). e2e против прод OK. Отложено в задачу сквозного платформенного ассистента: ингест глоссария в RAG (объяснять термины) + разговорные фразы-боли как синонимы. Спек `docs/superpowers/specs/2026-06-30-rag-recall-seller-lexicon-design.md`, память `project_lesson_chat_retrieval_recall_fix.md`.
- **Склонение «3 дней» вместо «3 дня» на реф-плашках** (PR #21 `73880d2`). Триал стал 3/7/14 дн → захардкоженное «дней» в реф-баннере главной (текст + кнопка «Забрать») и в бабле `/register` врало. Хелпер `pluralizeDays(n)` + generic `pluralRu(n,[one,few,many])` в `apps/web/src/lib/plural.ts`; `TrialCountdown.trialDaysPhrase` отрефакторен на тот же хелпер (DRY, один источник правды). Поправлен тест, зашивавший сам баг («21 дней»→«3 дня»). Переиспользовать хелпер для будущих склонений.

**Откаты:** каждый `git revert -m 1 <merge-commit>` + редеплой. Телефоны — обратимо на уровне функции триггера. Миграций нет (кроме DB-side `CREATE OR REPLACE FUNCTION handle_new_user` — обратимо, таблицы не трогает).

## Session (2026-06-29) — Sales/monetization analytics cluster shipped to prod (next: витрина)

Большая сессия поверх лидов→amoCRM (см. ниже). Зашиплено на прод 5 фич воронки/продаж, каждая ветка→TDD→code-review субагент→staging build-gate→master `--no-ff`→прод `--no-cache web`. Все детали + гочи: память `project_sales_analytics_cluster.md` (+ `project_leads_amocrm.md`).

**Что на проде (новое→старое):**
- **Триал-колонка в реестре + checkout-стадия в воронке** (`1c53ceb`): «Клиенты» получил «Триал до» (TRIAL `currentPeriodEnd`); «Рефералы» — стадию «Открывал оплату» (distinct реферальные из `CheckoutAttempt`).
- **Реестр клиентов** (`4d51df2` + hotfix `1b4b261`): таб «Клиенты» + CSV. Источник = наша БД (CloudPayments в `Payment`/`PaymentEvent`). Hotfix: `auth.users.id` uuid vs text-параметры → «0 клиентов» → фикс `id::text IN`.
- **Воронка по реф-кодам + клики** (`2c37a57`): таб «Рефералы», `ReferralCodeClickDay`, middleware-beacon, `REF_CLICK_SECRET` fail-closed (staging не льёт в прод-БД).
- **Выбор цели амбассадор-кода** (`6bcb0cc`): `landingTarget` HOME/REGISTER в `/admin/referrals/codes`.

**Разобрано (без изменений):** триал амбассадор-кода ЗАМЕНЯЕТ базовый (`BASE_TRIAL_DAYS=3`), не суммируется; 0-day код нельзя (min=1) — для «без лишних дней» ставить `refereeTrialDays=3`.

**Следующая сессия — ВИТРИНА (#3 funnel-roadmap).** Вся монетизационная обвязка готова (триал, коды, воронка, реестр). Витрина: общий дизайн есть, детали неясны → начать с брейншторма. Хендофф: `.claude/handoffs/2026-06-29-storefront.md`.

## Session (2026-06-29) — Лиды регистрации → amoCRM (Albato) shipped to prod

**Merge `1714dd6` (`--no-ff` `feature/leads-amocrm` → master) + prod deploy `maal-web-1`.** Задача #4 funnel-roadmap. Платформа в боевом режиме, менеджеры продаж тестируют → лиды нужны в amoCRM. Витрина (#3) сдвинута на ПОСЛЕ лидов (решение owner). Owner подтвердил: лид с прода долетел чисто.

**Что на проде:**
- Лид уходит в amoCRM через **Albato-вебхук** (отдельный URL на платформу, паттерн sibling-проекта go.mpstats `lib/albato.ts`) на **завершении онбординга** — мутация `onboarding.complete` (единственный персист непропускаемого визарда `/welcome`; гард `(main)/layout.tsx` редиректит пока `onboardingCompletedAt==null`). Значит лид у **каждого** зарегавшегося — и email-DOI, и Yandex. Триггер «после визарда» выбран owner (vs «первый вход») — визард непропускаем, тут уже полная квалификация.
- `sendAcademyLead` (`packages/api/src/utils/albato-lead.ts`): плоский payload 14 полей (`user_id, name, phone, email, registration_source, referral_code, marketplaces, experience, goals, goal_text, trial_active, trial_ends_at, registered_at, timestamp`), enum-коды → **рус-лейблы** из визарда (мапы продублированы, не импорт client-модуля `options.ts`). `ALBATO_WEBHOOK_URL` env (no-op без него), 8с таймаут, best-effort try/catch (не блокирует онбординг), fetch-ошибка санитизирована (URL не течёт в логи).
- **Fire-once race-proof:** `onboardingCompletedAt` клеймится атомарно `updateMany(where:{onboardingCompletedAt:null})`; `count===1` гейтит И лид, И существующее CQ-событие `pa_onboarding_completed` (попутно сделал race-proof старое CQ). Квалификация персистится отдельным `update` на каждый вызов (правка профиля цела). Реф-код (`Referral`) + триал (`Subscription TRIAL`) читаются параллельно в first-completion блоке.

**Связка Albato (собрал owner вживую, я помогал флоу + слал тест-payload'ы через `node -e fetch`):** триггер «Вебхук» → amoCRM «Новый контакт» (дедуп по телефону/email) → «Новая сделка» (воронка/этап) → «Новое примечание» со всеми полями текстом. **Сделки НЕ дедупятся** (amoCRM не умеет + не нужно: fire-once на нашей стороне). Гоча при сборке: токен `{%...:pname...%}` в названии сделки = в Albato вставили amoCRM-макрос вместо вебхук-переменной → чинится маппингом на вебхук-`name`.

**Деплой:** staging build `--no-cache web` (без env → инертна, проверка что собирается) → master merge → prod build `--no-cache web` + recreate + `ALBATO_WEBHOOK_URL` в `.env.production` (НЕ на staging — общий прод-Supabase). Smoke internal+public 200, content-check маркера `sending lead` в `/app/apps/web/.next/server/chunks`. **Kill-switch:** убрать `ALBATO_WEBHOOK_URL` из `.env.production` + `up -d web` (no-op мгновенно). Откат: `git revert -m 1 1714dd6` + редеплой. Тесты: albato-lead 9, onboarding 11, api 301/301, typecheck чисто. Тест-лиды test-0001..0003 в amoCRM (owner чистит). Память: `project_leads_amocrm.md`.

## Session (2026-06-29) — Триал-рерайт + реф-плашка лендинга + счётчик триала/промо shipped to prod

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

## Session (2026-06-25) — Контент-инструменты (Фаза C) shipped to prod

**Merge `83fb681` (`--no-ff` `feature/phase-c-content-tools` → master) + prod deploy `maal-web-1`.** Завершает оригинальный 3-фазный дизайн text/interactive-уроков. 3 независимые owner-confirmed фичи, каждая своим циклом spec→plan→TDD (coder + code-review субагенты), **БЕЗ единой миграции** (главный риск проекта — DDL по prod-Supabase — не задействован).

**Что на проде:**
1. **Дашборд аналитики чекпоинтов** (`/admin/analytics/checkpoints`) — методолог видит распределение ответов учеников по вариантам каждой развилки. Read-only over `LessonProgress.progressState.checkpointChoices` (Фаза B); pure-утилы `extractCheckpoints`/`tallyCheckpoints` (лейблы из `checkpointOption.label`, у `checkpoint`-ноды текста нет → контекст из предшествующего абзаца; bucket «(удалённый вариант)»); `admin.analytics.{listInteractiveLessons,getCheckpointAnalytics}`; тест-юзеры (`isTest`) исключены.
2. **Редактор состава джоб** (`/admin/jobs`) — управление «решениями под задачу» без `seed-jobs.ts`. Новый `admin.job.*` суброутер: add/remove/reorder уроков (contiguous renumber, **без temp-park** — у `JobLesson` нет `@@unique([jobId,order])`), publish-тогл, поиск уроков по всем курсам (incl. hidden), **создание джоб с server-side embedding** (`embedQuery`→`$executeRawUnsafe ...::vector`, embed-fail не теряет джобу) + «Переиндексировать». Мету (title/desc) из админки НЕ редактируем (остаётся в seed → re-embed состава не нужен).
3. **Карусель картинок** (редактор уроков) — TipTap atom-нода `imageCarousel`, node-view ветвится на `editor.isEditable` (авторская правка vs студенческая карусель со стрелками/точками/свайпом), реюз upload `requestLessonImageUploadUrl`, alt-текст в `extractPlainText`. Чистый фронтенд, без бэкенда.

**Деплой:** owner локально проверил через `pnpm dev` (читает прод-БД) → дал ОК на прод. Раннбук: push ветки → staging `--no-cache web` build-gate (dev-режим ≠ прод-build!) + tRPC-probe DEPLOYED → merge `--no-ff`→master → прод `--no-cache web` build (старый контейнер обслуживает) → recreate → internal health 200 + tRPC-probe UNAUTHORIZED + public `platform.mpstats.academy/`+`/api/health` 200. **Откат:** `git revert -m 1 83fb681` + редеплой.

**Tests:** typecheck 6/6, api 273/273, ai 71/71, web 286/287 (1 = известный yandex-oauth флейк). Память: `project_phase_c_content_tools.md`. **Deferred** (до реального запроса): квиз с проверкой, ответ ученика на проверку, версионирование контента. Ветки A/B/C смержены — можно удалять вместе.

## Session (2026-06-24) — Текстовые уроки (Фаза A) shipped to prod

**Merge `5b09617` (`--no-ff` `feature/text-interactive-lessons` → master) + prod deploy `maal-web-1`.** Полный цикл: brainstorm → спека (`docs/superpowers/specs/2026-06-23-text-interactive-lessons-design.md`, 3 фазы A→B→C) → план (`docs/superpowers/plans/2026-06-23-phase-a-text-lessons.md`) → 17 задач субагентами (TDD + spec/quality ревью) → 2 раунда UAT-правок owner'а → деплой.

**Что на проде:**
- **Модель:** `Lesson.contentType` {VIDEO/TEXT/INTERACTIVE} + `contentStatus` {DRAFT/PUBLISHED} + `body` (TipTap JSON). Аддитивная миграция `20260623000000_add_lesson_content` + публичный bucket `lesson-images` применены к prod-Supabase **через Mgmt API** (по пути убиты 3 зомби idle-in-tx сессии, висевшие 13 дней и блокировавшие `ALTER TABLE Lesson`).
- **Админка:** создание урока из `CourseManager` → редактор `/admin/content/lessons/[id]` (TipTap **v3**). Сохранение черновика (без индексации) / публикация (индексирует plain-text тела в `content_chunk` `source_type='academy_text'` → AI-чат+`searchLessons` видят текст). Редактирование/удаление (с явным чекбокс-подтверждением; видео удалять нельзя) из списка и редактора.
- **Ученик:** рендер тела (read-only TipTap) + «Завершить урок» (реюз `completeLesson`); DRAFT скрыты (`getLesson`→null).
- **Редактор UX:** scoped-типографика `.lesson-content` (НЕ ставили `@tailwindcss/typography` — есть 2 существующих `prose`-потребителя), предпросмотр черновика, **липкие тулбары**, контекст-панель таблиц (add/del row/col, merge, header), ресайз картинок (пресеты ширины) + выравнивание, ссылки-поповер (+ кликабельны у ученика), символы форматирования (¶).
- **Глобальный фикс:** `position:sticky` чинился во всём приложении — `html,body { overflow-x: hidden }` → `clip` (hidden делал body нескроллящимся scroll-контейнером, ломая sticky у всех потомков). Диагностировано вживую через браузер.

**Деплой:** staging (`--no-cache web` build + HTTP 200) → ОК → прод (`--no-cache web` build при работающем контейнере → recreate → smoke `/` 200 + `/api/health` 200). Тесты: typecheck 6/6, ai 67/67, api 226/226, web (мои все зелёные; 1 предсущ. флейк `yandex-oauth`). **Откат:** `git revert -m 1 5b09617` + редеплой.

**Осталось:** карусель картинок (бэклог), **Фаза B** (интерактив: гейты + ветвление), **Фаза C** (редактор состава джоб в админке). Ветки `feature/text-interactive-lessons` НЕ удаляли (снесём все 3 фаза-ветки вместе после готовности B+C). Память: `project_phase_a_text_lessons.md`. Хендофф на Фазу B: `.claude/handoffs/`.

## Session (2026-06-23) — Ads playbooks remap под методологов + чистка названий уроков shipped to prod

**Merge `ee1ff2f` (`--no-ff` `feature/ads-playbooks-remap` → master, запушено).** Методологи переразбили блок «Реклама» в Google-листе «Решения задач» (`1xs0TkCrvu4...`, gid=70389265, **строки 4–29**) на **17 задач/плейбуков**. Пересобрали раздел «решения под задачу» (`Job`/`JobLesson`, ось MARKETING). **Аддитивно** (решение owner): нейронка/визуал/контент/аналитика/Ozon-плейбуки НЕ трогали — обновим, когда методологи доготовят те блоки.

**Что на проде (чистая правка данных в shared prod-Supabase, БЕЗ схемы/кода/деплоя):**
- **14 published** WB-плейбуков (уроки + AI-эмбеддинги) + **3 draft** (`isPublished=false`: выкупы/защита бренда/юр-риски, скрыты) + **2 старых дубля сняты с публикации** (`provesti-analiz-i-optimizaciyu-reklamnyh-kampaniy-na-wildber`, `nastroit-i-optimizirovat-reklamnye-kampanii-s-ispolzovaniem-`). Published-джоб 29→41. Уроки сматчены на курс `02_ads`; axes/skillBlocks выведены из самих уроков.
- **Чистка названий:** срезан методологический суффикс `Название \| Блок-источник, N` (артефакт skill-batch ingest, торчал в UI) — **116 уроков по всем курсам**. Защищены **4** (суффикс = единственный различитель: FBO/FBS на Ozon, «Ищем категории») + 2 легитимных `\|` не тронуты. Rollback-снапшот `scripts/job-mapping/results/title-cleanup-snapshot.json`.

**Скрипты (idempotent):** `scripts/seed/seed-ads-playbooks.ts` (upsert + unpublish ретайра, `--dry-run`, pre-flight на lessonId), `scripts/seed/strip-lesson-title-suffix.ts` (`--apply`), `seed-jobs.ts` (`buildJobUpsert` теперь уважает per-job `isPublished`). Вход сида: `results/JOB-PROPOSAL-ads.json`. Запуск: `NODE_OPTIONS=--dns-result-order=ipv4first npx tsx ...`; **`embed-jobs.ts` требует `--conditions=react-server`** (обход `server-only` при запуске вне Next через tsx).

**Долги** (внешние, от методологов) — `scripts/job-mapping/results/ADS-PLAYBOOKS-DEBT.md`: 1 урок дозаписать («Чистка неэффективных запросов»), 3 пустые задачи, Ozon-версии 9 задач, опечатки в листе. **Процедура раскладки, когда уроки придут скопом** — в доке. Память: `project_ads_playbooks_remap.md`.

## Session (2026-06-23) — Design System v2 «branded-light» рескин продукта shipped to prod

**Merge `932f597` (`--no-ff` `design-system-v2-reskin` → master) + prod deploy `maal-web-1`.** Продукт сведён к маркетинговому облику, **остаётся светлым** (Onest везде, meet-in-middle радиусы, тёмные острова для глубины, дисциплина палитры). Спек `docs/design-system/v2-product-alignment-spec.md`, гайдлайн `docs/design-system/{README,tokens,dark,light}.md`.

**Метод (ключевой паттерн):** owner не мог выбрать глубину в абстракции → собрали **3 локальных билда бок-о-бок** для визуального выбора: baseline (:3000), DEEP (worktree, :3100 — тёмные `DarkIsland`-шапки + `BentoCard` + тёмный сайдбар) и MIDDLE (worktree, :3101 — светлые soft-tint карты + крупная Onest-типошкала + синий active-pill). Два варианта сверстаны параллельными `coder`-субагентами (посекционные коммиты). Owner дал вердикт по каждому разделу → cherry-pick по файлам.

**Что на проде (вердикты owner):**
- **deep** (тёмные острова): Избранное `/learn/favorites`, Карточка задачи `/learn/job/[slug]`, Инструменты MPSTATS `/mpstats-tools` (+ зелёный `#17BF50` MPSTATS-нод).
- **middle** (светлые, приглушённая палитра): Диагностика интро `/diagnostic` + результаты `/diagnostic/results`.
- **baseline (как есть):** сайдбар/моб.меню, профиль, рефералка, история, уведомления, плеер, прохождение диагностики.
- Глобально (раньше, на этой же ветке): Onest+радиусы+примитивы `DarkIsland`/`BentoCard` + dashboard/`/learn/plan`/search-island/`/billing`.

**Visual-only:** без схемы/миграций/изменений данных/auth. Прод-флаг `PARTNER_COURSES_ENABLED:"true"` уже стоял → mpstats deep виден. Деплой: staging (`--no-cache web` + base64-content-check бандла, т.к. кириллица в SSH→docker grep мангается) → ОК owner → прод (`--no-cache web` + recreate + content-check + smoke 200). Откат: `git revert -m 1 932f597` + редеплой. typecheck зелёный, web 247.

**Готчи:** Windows `git worktree remove` падает на файл-локе (worktree разрегистрируется, папка остаётся → добивать `cmd //c rd /s /q` + `git worktree prune`); на ветке висели чужие uncommitted-файлы контент-инжест-инстанса (merge делал в отдельном чистом worktree, чтобы не попали в релиз). Память: `~/.claude/projects/.../memory/project_design_system_v2_reskin_shipped.md`.

## Session (2026-06-16) — Phase 65 «Cohesive dark /register + /login» shipped to prod

**Merge `62e69e3` (`--no-ff` `phase-65-register-split-layout` → master) + prod deploy `maal-web-1`.** Обе входные страницы переоформлены в цельный тёмный маркет-стиль.

**Что на проде:**
- `/register` и `/login` выведены из центрированной `(auth)`-группы (`git mv`) в **собственные тёмные лейауты, переиспользующие маркетинговый дизайн** (а не перерисовывающие): `V8Header` (прозрачный над тёмным, белый wordmark-лого, нав, синяя pill, white-on-scroll) + `V8Footer` (`#0a0f1e`, `rounded-t-[40px]`, `wrapperBg="dark"`) + шрифт **Onest** через `next/font` на обёртке + фон `#0F172A`, форма — белая парящая карта.
- `/register` — сплит: форма слева (col1 row-span-2 self-center), справа промо = заголовок (`RegisterValueTeaser`) + 4 плашки-тезиса + полоса цены (`RegisterValueStats`); мобайл order заголовок→форма→тезисы. `RegisterValuePanel` удалён.
- `/login` — форма центрирована на тёмной канве (`min-h-[68vh]`), без промо.
- **Формы не тронуты** (реальный `react-international-phone`, Яндекс, согласия, реф-баннер по `?ref=`). `/forgot-password` и прочие `(auth)`-страницы остались на старом светлом лейауте.
- Создан гайдлайн дизайн-системы `docs/superpowers/specs/2026-06-16-marketing-design-system.md` (токены/тайпскейл/кнопки/карточки/V8Header/V8Footer/motion + чек-лист переиспользования).

**Урок:** первая итерация регистрации собрана в отрыве от маркет-стиля (плоская синяя панель, самопал-лого, белый хедер) → owner забраковал. Пивот: переиспользовать `V8*`-компоненты + Onest. Gotchas: внешний `<svg><use>` без `viewBox`=300px (ломал лого/мобайл в превью); стейл `.next/types/app/(auth)/...` после `git mv` валит `tsc` (TS2307) — удалить стейл-типы. **Шрифт:** root layout грузит Inter, маркет-страницы ставят Onest по-странично — вход обязан явно ставить Onest.

**Tests:** web 244/244, typecheck 6/6. Staging-прогон (`--no-cache`+content-check) перед прод. **Откат:** `git revert -m 1 62e69e3` + редеплой. Память: `project_phase65_entry_pages_redesign.md`. Ветка `phase-65-register-split-layout` смержена (можно удалять). На VPS staging-дерево возвращено на master (был на phase-65).

## Session (2026-06-11) — Phase 64 «Бесшовный вход из MPSTATS» shipped DARK to prod

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

## Session (2026-06-09) — Phase 63 «Аналитика 2.0» shipped to prod

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

## Session (2026-06-08) — Phase 62 «Инструменты MPSTATS» partner course shipped to prod

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

## Session (2026-06-05) — Onboarding hotfix: required answer per wizard step

**Hotfix `dc645c7` (direct to master, prod deploy `maal-web-1`).** Прод-баг: кнопка «Продолжить»/«Далее» в визарде `/welcome` пропускала шаг даже без выбранного ответа — юзеры проскакивали онбординг с пустыми полями квалификации (goals/marketplaces/experience).

**Фикс** (`apps/web/src/app/welcome/page.tsx`): добавлен `canAdvance` — гейт по шагам, кнопка `disabled` пока нет ответа. Шаг 1 = хотя бы один чип цели **или** непустой свободный текст; шаг 2 = ≥1 маркетплейс; шаг 3 = выбран уровень опыта. Подсказка под кнопкой меняется на «Выберите хотя бы один вариант, чтобы продолжить», пока ответа нет. Тест `apps/web/tests/unit/welcome-page.test.tsx`: старый regression-тест навигации обновлён (выбирает ответы), +2 новых теста (гейт на каждом шаге; свободный текст = ответ на шаге 1). web 210/210, typecheck зелёный.

**Деплой:** master clean == origin до пуша (зашипился только этот фикс), VPS ff-pull → `build --no-cache web` → recreate (healthy). Content-check: новая строка в свежем `.next` (2 файла, не стейл — node-скан внутри контейнера, т.к. grep по кириллице через SSH→docker мангалит кодировку). Прод-smoke: `/` 200, `/welcome` 307 (auth-redirect). Откат: `git revert dc645c7` + редеплой.

## Session (2026-06-05) — Обучение 2.0 (Phase 61 + 61.1 + DAU/WAU/MAU) shipped to prod

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

## Session (2026-06-01) — Phase 59 v2 (static-deck diagnostic) shipped to prod

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

## Session (2026-05-28) — Phase 58 + Phase 60 + admin-analytics + register-banner hotfix shipped to prod

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

## Session (2026-05-25) — Track B (agentic search) shipped to prod

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

## Session (2026-05-22) — Phase 57 Library Redesign shipped to prod

**PR #8 (`bb84013`) + PR #9 (`3059ad8`) merged to master and deployed to prod (https://platform.mpstats.academy).**

- **PR #8 — Phase 57 base + polish round.** Job catalog `/learn` live: lens «По задачам / Все курсы», WB/Ozon switch, 29 jobs across 5 axes. New screens `/learn/job/[slug]` (with «+ В трек» toggle + chevron affordance) and `/learn/track` (with «Мои плейбуки» section + dedup). Always-visible track banner on `/learn` with empty-state CTA to `/diagnostic`. Polish round added: `LearningPath.addedJobs` Json column (additive migration `20260521000000_learning_path_added_jobs` applied to prod), tRPC `learning.addJobToTrack` / `removeJobFromTrack`, `JobDetail.isInTrack`. Critical Rules-of-Hooks fix on `/learn/job/[slug]` — `useMutation`/`useUtils` were below `if (isLoading) return`, broke hook count, produced "first-load Ошибка загрузки, retry works" symptom across all playbooks; hoisted hooks above early returns (`72facc9`). Content team approved `JOB-PROPOSAL.validated.json` byte-identical to provisional — no re-seed needed.
- **PR #9 — Hidden-lesson auto-sync.** DB-level filter `where: { lesson: { isHidden: false, course: { isHidden: false } } }` added to JobLesson includes in `job.getCatalog`, `job.getJob`, `learning.getRecommendedPath.addedJobsRaw`. Admin sets `Lesson.isHidden=true` (or course-level) → urok auto-disappears from job cards, job detail, playbooks; `lessonCount`/`totalDurationMin`/`completedLessons` auto-recompute. `JobLesson` rows preserved — restoring `isHidden=false` brings lesson back into jobs. Use case: duplicate "Автобидер. Пошаговая настройка" lessons — owner now hides one via admin, no SQL needed.

**Staging deploy gotchas captured this session (see `.claude/memory/`):**
- `feedback_rules_of_hooks_early_returns.md` — Rules of Hooks pattern with «first load fails, retry works» symptom.
- `feedback_staging_docker_no_cache_required.md` — Always `--no-cache` on docker rebuild when .tsx/.ts changed + `grep` content-check in `.next` bundle BEFORE declaring deploy successful. Avoids "healthy container running stale bundle" trap.

**Phase 58 (next, separate spec):** migrate diagnostic onto jobs — `diagnostic.ts` recommends whole jobs; track becomes job-aware. Phase 57 built bridge data (`Job.axes` canonical-5 + `Job.skillBlocks`), did not touch `diagnostic.ts`.

## Session (2026-05-21) — Supabase keys migration after JWT leak

**Инцидент:** в коммите `76356cf` файл `docs/superpowers/plans/2026-05-07-phase-55-sprint-2-pilot.md:1604` содержал ЖИВОЙ `SUPABASE_SERVICE_ROLE_KEY` (полный JWT, exp 2035) — оставлен AI-агентом вместо placeholder'а в shell-command example. Полная утечка bypass-RLS доступа к `saecuecevicwjkpmaoot`.

**Сделано:**
- **Postgres пароль ротирован** (новый `<new-postgres-password>`) — обновлён в MAAL прод/staging .env, backup-cron .env, локально (3 файла), worktree (2 файла). Прод и staging пересозданы, `database: connected`.
- **Миграция формата API-ключей: legacy `anon`/`service_role` JWT → новые `sb_publishable_*`/`sb_secret_*`** (Supabase deprecates legacy keys к концу 2026). Code rename: `NEXT_PUBLIC_SUPABASE_ANON_KEY` → `_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` → `SECRET_KEY` (26 файлов, master `4cfeee8`). Полный rebuild MAAL prod+staging (build-time inlining `NEXT_PUBLIC_*` в Next.js bundle).
- **Параллельно: миграция go_mpstats и academy-marketing-agent** на ту же модель (общий Supabase проект с MAAL). go_mpstats — 8 файлов, master `75e96dd`.
- **Legacy JWT-based API keys revoked** в Supabase Dashboard → утёкший в git history JWT мёртв.
- GH Actions secrets обновлены (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PUBLISHABLE_KEY` для keepalive).

**Worktree `phase-57-library-redesign`:** значения ключей обновлены, имена переменных НЕ переименованы (бранч в работе, код на старых именах). При merge — accept master-версию переименованных файлов.

**Деталь инцидента + recovery + правила:** [.claude/memory/incident_2026-05-21_supabase_keys_leak.md](.claude/memory/incident_2026-05-21_supabase_keys_leak.md). Глобальное правило про секреты в docs — обновлено в `~/.claude/CLAUDE.md`.

## Session (2026-05-19) — Phase 56 + referral banner shipped to prod, entry-flow hotfix

**Задеплоено на прод в этой сессии:**
- **Phase 56 — Entry-flow redesign + CQ mirroring** (merged → prod, master `230d4a3`). Онбординг-визард `/welcome` (3 шага + развилка диагностика/каталог), 5 полей квалификации в `UserProfile` + additive-миграция (применена на prod), снятие жёсткого гейта диагностики (`DiagnosticGateBanner` → закрываемый хинт), редактирование квалификации в `/profile`, зеркалирование ответов визарда в CarrotQuest (`pa_marketplaces/experience/goals/goal_text` props + событие `pa_onboarding_completed`). Все ~170 существующих юзеров видят визард при следующем входе (one-time). GSD verification — `human_needed`: 2 пункта в `.planning/phases/56-entry-flow-redesign/56-HUMAN-UAT.md` (реальный Yandex-OAuth новый аккаунт + E2E-прогон в CI).
- **Phase 56 hotfix** (master `b8242c3`) — петля на развилке визарда: `router.push` → Next Router Cache отдавал протухший рендер `(main)`-гарда → юзера зацикливало назад в визард. Фикс: уход с развилки через `window.location.assign` (жёсткая навигация). Инцидент на `evasilev@mpstats.io`, подтверждён резолвлен. См. Gotchas + регресс-тест `apps/web/tests/unit/welcome-page.test.tsx`.
- **Реферальный баннер** (ПРОТОТИП 02 плана CPO; master `6615611`). Закрываемая промо-полоса в `(main)` поверх хедера — «Приведи друга → 14 дней доступа», CTA → `/profile/referral`. Все залогиненные, скрыт на `/profile/referral`, повтор через 14 дней после закрытия. `apps/web/src/components/referral/ReferralBanner.tsx`.

**Смержено ранее (status-sync с git):**
- **Phase 53A + 53B — Referral Program** (merged 2026-05-05/06). Реферальные коды, ручная активация пакетов, 14-дневный TRIAL, анти-фрод; админка `/admin/referrals`. Флаг i1→i2 — вручную ~2026-06-01.
- **Phase 55 Sprint 3 — Vision-RAG full platform** (PR #6, merged 2026-05-18). 5 курсов, smoke 89-100%, покрытие ~91.5%.

**Phase 57 — Library Redesign** (`/learn` на джобах) — в работе: ветка `worktree-phase-57-library-redesign` + PR #8, на staging. Детали — в Active Branches и `.claude/memory/`.

## Session (2026-05-12) — Phase 55 Sprint 2C + Sprint 3 prep shipped to master + PITR recovery + L2 backup

**Two PRs merged to master:**
- `a3967ce` — Sprint 2C: 79 lessons of `03_ai` ingested (DB: 89 lessons / 792 frame chunks). Smoke 16/18 = 88.9% with `gpt-4.1-mini`. Cost $0.94.
- `0e20628` — Sprint 3 prep: docs (ARCHITECTURE + PLAYBOOK + safety memory) + safety infra (validate-selection + smoke-baseline) + selector v4 with DB-persisted mappings (`Lesson.metadata.videoSource` column added via R1 manual ALTER pattern) + backup L2 (daily pg_dump → nikear via Tailscale, activated on VPS).

**PITR incident 2026-05-12 — recovered.** Sibling `D:/GpT_docs/Ai_MP_manager/` ran `prisma db push --accept-data-loss` against shared MAAL Supabase, dropped 24 prod tables. Restored via Supabase PITR (12hr loss window). R1: Lesson.order migration re-applied (manual ALTER + manual INSERT into `_prisma_migrations`). R2: Sprint 2C 644 frame chunks re-ingested from local VLM dumps (~$0.001 — embedding-only). R3: LagerPro re-ingest handed back to `E:/LagerPro` pipeline owner (2299 chunks lost, out of MAAL scope). New `🚨 PROD DATABASE SAFETY` section at top of this file codifies zero-exception rules. See `scripts/vision-ingest/results/RECOVERY_2026-05-12.md`.

**Backup L2 active.** Cron @ 03:00 UTC daily on VPS deploy@89.208.106.208: docker `postgres:17-alpine` pg_dump → GPG → scp via Tailscale to nikear `/home/zebrosha/backups/maal/`. 30-day rolling. First backup 52MB on nikear. Setup guide: `scripts/backup/README.md`.

**Sprint 3 (full-platform ingest) ready.** Selector v4 + validator + smoke-baseline + DB-persisted mappings via `Lesson.metadata.videoSource` (88 already backfilled). Remaining courses: 04_workshops (24 lessons), 01_analytics (66), 02_ads (71), 05_ozon (76), 06_express (64). Total ~301 unmapped visible lessons. Est cost ~$4-5. Procedure: `scripts/vision-ingest/PLAYBOOK.md`. Safety rules: `.claude/memory/vision-ingest-safety.md`.

**CI test fixes (`9fde3ea`)** — pre-existing master failures from Phase 45 (login:default_phone scope), Phase 53A (register/page split), 2026-04-27 (prisma.$queryRaw on auth.users). 6 tests fixed, 148/148 passing.

## Session (2026-05-11 daytime) — Cancel flow + Lesson.order tech debt + referral link tweak

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

## Session (2026-05-05)

**Tester Mila feedback batch — track UX + chat disclaimer. Задеплоено (`ade7768`). Phase 55 vision chunking записана в roadmap (`7c15dc2`).**

- Бэк: `learning.addLessonsToTrack({ lessonIds[] })` — bulk до 500 уроков.
- `/learn`: кнопка `Перестроить трек` → `Перестроить по диагностике`, расширенный диалог. Hint под шапкой про фильтры. Кнопка `+ В трек (N)` на карточке курса в каталоге.
- Чат урока (desktop+mobile): дисклеймер про границы RAG (отвечает по аудио-транскрипту, не «видит» экран → дисклеймер уберём после Phase 55).

Phase 55 Vision Chunking RAG (v1.7) записано в `.planning/ROADMAP.md`.

## Session (2026-05-04)

**Phase 53A — Referral Program. Branch `phase-53a-referral`, 19 commits, awaiting Egor's merge.**

При мерже задеплоится: TRIAL enum + Referral + ReferralBonusPackage + UserProfile.referralCode @unique. REF-* generator + backfill (140 юзеров без кода). Cookie attribution через middleware. Orchestrator `issueReferralOnSignup` (resolve → fraud → mode flag → transaction → CQ events). Хуки в `/auth/confirm` и Yandex callback. tRPC router `referral.{getMyState, validateCode, activatePackage}` + `/profile/referral` page + баннер «🎁 +14 дней» на `/register?ref=`. Полный детальный лог: `.claude/memory/project_phase53a_referral_program.md`.

**Технический долг:** Task 14 переместил `activation.ts`/`attribution.ts` из `apps/web/src/lib/referral/` в `packages/api/src/services/referral/`. Re-export шимы — чище через `@mpstats/api` index.

**Ждёт от Егора:** мерж в master или staging-test через push ветки → backfill на проде → QA → решение по флагу `referral_pay_gated` (i1 default = no payment required).


## Session (2026-06-23) — Git hygiene cleanup (repo → одна ветка master)

**Навели порядок в гите после релиза дизайн-системы (master `bd340b1`).** Repo разросся ветками/worktree/стэшами от параллельных инстансов и зашипленных фаз. Итог — чистый repo: одна ветка `master`, 0 worktree (кроме main), 0 стэшей.

1. **Зависшую работу контент-инжеста** (batch 17.06.26, лежала uncommitted на чужой ветке `design-system-v2-reskin`) перенёс на `chore/skill-lesson-ingest-batch-17-06-26` от `origin/master` и закоммитил (`9ed85c3`): фикс `seed-skill-lessons.ts` + переклассификация (496) + map батча + session-note. Committed-база файлов идентична на обеих ветках → перенос без конфликтов.
2. **`.gitignore`** дополнен эфемерным мусором (`chore/gitignore-tooling-artifacts`, `08aca29`): `.superpowers/`, `.tmp-slide/`, `.playwright-mcp/`, `screenshots/`, `download.html`, `scheduled_tasks.lock`, vision-ingest `test*.md`. Реальные доки (Track B planы/спека, handoffs, lesson-order snapshot) НЕ игнорируются.
3. **Удалено:** 27 локальных + 26 remote веток (зашипленное/superseded), 4 worktree, 4 стэша (`git stash clear`), 23 осиротевшие `agent-*` worktree-папки с диска.
4. **Обе chore-ветки смержены в master** (`--no-ff`, merge `2488d2f`) и удалены (local+remote). master запушен.

**Гочи (детали → память `feedback_git_hygiene_cleanup.md`):**
- Squash-merged ветки (`track-b` PR#10, `phase-60-banner` PR#14, sprint-2c/3-prep) git видит как `--no-merged` — до-squash коммиты не предки master. Сверять со записями проекта (PR#/hash), не только `git branch --merged`.
- `git branch -d` (safe) для merged; `-D` для влитых-в-HEAD-но-не-в-upstream (`phase-56-entry-flow`).
- **Windows long-path:** agent-worktree папки в `.claude/worktrees/` не удаляются ни cmd rd, ни robocopy, ни .NET `Directory.Delete('\\?\…')` (файлы с недопустимыми Linux-именами + пути >260). Работает `npx rimraf` — но exit 2 + удаление с задержкой (проверять `ls`, не exit-код).

## Session (2026-06-22) — Batch 17.06.26 «analytics» Phase B ingest (15 уроков LIVE)

**Пачка новых навыковых уроков 17.06.26 залита и видима на проде в курсе `01_analytics`.** Phase A (транскрипт→чанки→embeddings→Supabase) сделана ранее в репо `E:/Academy Courses`; эта сессия — Phase B в MAAL. Полный handoff: `E:/Academy Courses/.claude/handoffs/2026-06-22-batch-17-06-26-analytics.md`. Durable-факты пайплайна: `~/.claude/projects/.../memory/project_skill_lesson_ingest_pipeline.md`.

1. **Классификация** (`scripts/skill-mapping/skill-mapper.ts discover+classify --resume`): 78 уроков (15 пачки + 63 ранее не классифицированных хвоста), 0 ошибок. `classification.json` → 496.
2. **Хвост из 63 разобран:** все имели Lesson-запись + видео; 21 реальный академический урок получил `skillBlocks`. **42 урока `07_instruments` (партнёрка) осознанно не трогали** — изоляция через `Course.partnerKey`, не через skillBlocks.
3. **Seed** (`scripts/seed/seed-skill-lessons.ts`): 15 уроков созданы, блоки на 454 урока всего.
4. **Решение владельца:** все 15 (analytics+finance+ops) → `01_analytics` (#109–123, в хвост), «так хотели методологи». `skillCategory` оставлены точными (ANALYTICS 8/FINANCE 2/OPERATIONS 5). Контейнеры `skill_finance`/`skill_operations` заведены, но пусты (staging).
5. **Kinescope:** 15 видео (5.4 ГБ) → папка `01_analytics` (`71777756...`), `videoId`/`videoUrl` проставлены, 0 ошибок. Map: `scripts/kinescope-video-map-batch-17-06-26.json`.
6. **`isHidden` снят** → уроки живые. Верификация прод-БД зелёная (123 урока, 0 дублей `order`, партнёрка 0 skillBlocks).

**Доработан `seed-skill-lessons.ts` (uncommitted в рабочем дереве, лежит на ветке `design-system-v2-reskin` — вынести на профильную ветку):** `AXIS_TO_CATEGORY`/`AXIS_TO_COURSE` на все 5 осей + throw на неизвестную (был молчаливый фолбэк finance/ops→skill_marketing+ANALYTICS), 2 контейнера, контейнер-уникальный `order` (rename_map order по блоку ломал `@@unique([courseId,order])`), мигрированные уроки не трогаются, partner-skip в Step 3, фикс Json-null count.

**Осталось (не моё):** (1) плейбуки — `JobLesson` строится из ручного `lessonIds` в `JOB-PROPOSAL.validated.json`, 15 уроков туда не попадут без контент-команды; (2) закоммитить фиксы seed-скрипта; (3) спот-чек воспроизведения 1–2 уроков; (4) судьба папки-источника. **Готча:** локальные tsx→Supabase падали из-за битого IPv6 на ПК → `NODE_OPTIONS='--dns-result-order=ipv4first'` (тот же баг давал «зависание» прода в браузере локально; прод здоров).

## Session 22 (2026-04-30, session 2) — Phase 52 Content Triggers

**Phase 52 — Content Triggers. Закодено в master, ждёт staging deploy.**

Перешли с GSD на Superpowers workflow (brainstorming → writing-plans → executing-plans) ради экономии токенов. План: `docs/superpowers/plans/2026-04-30-phase-52-content-triggers.md`. Спека: `docs/superpowers/specs/2026-04-30-phase-52-content-triggers-design.md`.

1. **ADMIN_COMMENT_REPLY supersede** — `notifyCommentReply` (apps/web/src/lib/notifications/notify.ts) теперь резолвит роль автора reply через `userProfile.findUnique` и выбирает `ADMIN_COMMENT_REPLY` для ADMIN/SUPERADMIN, иначе обычный `COMMENT_REPLY`. Один объект на reply, никогда оба. Anti-self-notify сохранён (admin отвечает сам себе → no-op).
2. **Visual accent ADMIN_COMMENT_REPLY** в `NotificationItem.tsx` — `border-l-4 border-mp-blue-500 pl-3` + кружок иконки `bg-mp-blue-100 text-mp-blue-700`. Эмодзи `👨‍🏫` уже стояло в Phase 51.
3. **CONTENT_UPDATE schema widening** в `packages/shared/src/notifications.ts` — Phase 51 placeholder `lessonIds: string[]` → discriminated array `items: Array<{kind:'lesson'|'material', ...}>`. Discriminator `kind` (не `type`, чтобы не конфликтовать с payload `type`).
4. **Rolling 24h grouping** — `apps/web/src/lib/notifications/grouping.ts`. Поиск по `(userId, type='CONTENT_UPDATE', readAt=null, createdAt > now-24h, payload->courseId = X)` через Prisma JSON path. Если найдено → append items с дедупом, обновить ctaUrl. Иначе → новая запись. Read row → новый объект (старый не трогаем).
5. **Progress-gated targeting** — `targeting.ts` с raw SQL: active subscription AND (`COMPLETED` OR `IN_PROGRESS AND watchedPercent >= 50`). Cold targeting явно исключён.
6. **Orchestrator** — `content-update.ts` дёргает targeting, batch fetch preferences, per-user merge + CQ event. Failures изолированы через Sentry.
7. **Route handler** `/api/admin/notify-content-update` — admin auth + Zod validation + дёргает orchestrator.
8. **Admin UI:** Lesson unhide — расширил `HideConfirmDialog` опциональным `notifyOption`. В `CourseManager` подключил state, fan-out fetch на confirm. Material attach — `LessonMultiAttach` принял `materialTitle`, добавил Checkbox + fetch в onSuccess attach.
9. **Yandex Metrika** — 2 новых goal в `constants.ts` (`NOTIF_ADMIN_REPLY_OPEN`, `NOTIF_CONTENT_UPDATE_OPEN`), `NotificationItem` обёрнут handleClick wrapper'ом.
10. **Тесты:** 17 unit (3 targeting + 8 grouping + 6 admin-comment-reply); все 33 в `apps/web/src/lib/notifications/` зелёные. E2E `phase-52-content-update.spec.ts` env-gated.
11. **Доки** — `docs/admin-guides/lesson-materials.md` плюс секция «Анонс нового контента»; `/roadmap` запись от 30.04 retention-tone.

**Без миграций БД** — Phase 51 заранее заложила `NotificationType.ADMIN_COMMENT_REPLY` + `CONTENT_UPDATE` в enum и универсальный `payload Json`.

**14 коммитов:** `1c179f8` (schema) → `167a6ca` (targeting) → `d69e06b` (grouping) → `3c6e605` (orchestrator) → `27da24e` (supersede) → `fd2c281` (visual + ym) → `7f40f48` (route) → `96cf2a8` (lesson unhide UI) → `ec2eb7e` (material attach UI) → `0e57257` (e2e) → `2a1334b` (admin guide) → `358fe04` (roadmap).

**Gotchas:** `@prisma/client` import в apps/web падает (vite resolve) — использовать `@mpstats/db` (re-exports). Skill-batch ingest (seed-скрипты) обходит триггер — рекомендованный workflow `isHidden=true` → unhide через UI с галкой.

---

## Session 21 (2026-04-30, session 1) — Hotfix: DOI links + password UX

1. **Auth confirm route — фикс broken DOI links на `*.supabase.co`** (commit `1b619a4`). Жалобы от двух юзеров: bakha.73@yandex.ru `ERR_CONNECTION_ABORTED` (Yandex Browser режет supabase.co), Sd-vn@mail.ru белый экран. Корень: webhook `/api/webhooks/supabase-email` строил confirmUrl на `https://saecuecevicwjkpmaoot.supabase.co/auth/v1/verify?token=pkce_...`. ISP/Яндекс.Браузер/AdGuard режут `*.supabase.co`. Плюс PKCE требует `code_verifier` cookie на нашем домене → cross-browser email opens ломались. **Фикс:** новый `/auth/confirm` route вызывает `supabase.auth.verifyOtp({ token_hash, type })` server-side, ставит cookies на нашем домене, redirect на `next` (или `/reset-password` для recovery). `/auth/callback` НЕ удалён — продолжает работать для OAuth. Memory: `project_auth_confirm_route.md`.

2. **Password rules — упрощение** (commit `e7f040c`). Жалобы: «8 букв + 3 цифры → отказ» без понятной причины. Корень: `password_hibp_enabled: true` в Supabase (HaveIBeenPwned check) реджектил пароли из утечек, без визуальной обратной связи. **Фикс:** `password_min_length: 6 → 8`, `password_hibp_enabled: false`. Hint в `/register` и `/reset-password`: «Минимум 8 символов. Цифры и спецсимволы по желанию.»

3. **Третий случай к концу сессии** — Галина (`galina_30811@mail.ru`) не получила DOI-письмо, webhook отработал чисто. Hotfix: `email_confirmed_at = now()` через Management API. **Open question:** на mail.ru второй случай за неделю — паттерн потерь писем при доставке через CarrotQuest SMTP. Требует исследования: SPF/DKIM/DMARC у CQ-отправителя.

**Bonus:** научились видеть email юзеров в Supabase — `Authentication → Users` в dashboard, либо `select email from auth.users where ...` через Management API (`UserProfile` намеренно не дублирует email, source of truth = `auth.users`).

---

## Session 20 (2026-04-27) — Phase 49 Lesson Materials + Skill batch 24.04.26

**Phase 49 — Lesson Materials. SHIPPED.**

1. **Schema + Storage (49-01)** — `Material` / `LessonMaterial` / `MaterialType` enum в Prisma; bucket `lesson-materials` private, 25 MB hard limit, MIME whitelist (PDF / XLSX / DOCX / CSV); `prisma db push` ПЕРЕД docker rebuild (recurring Phase 28 lesson).
2. **tRPC router (49-02)** — 9 procedures, 8 admin + 1 protected; ACL: `getSignedUrl` проверяет access к ≥1 прикреплённому уроку; locked lesson → `materials: []` в payload.
3. **Ingest (49-03)** — `scripts/ingest-materials.ts`, dry-run + apply, ~120 строк Google Sheet → 62 unique Material + 97 LessonMaterial links. Дедуп по `(title, normalizedUrl)` с trim, fuzzy match, идемпотентный, Sentry custom span на блок урока, 16 unmatched в `49-03-NOTES.md`.
4. **Lesson UI (49-04)** — секция «Материалы к уроку» между summary и навигацией; `MaterialCard` с иконкой по типу + accent-цветом; locked lesson не рендерит секцию; Yandex Metrika `MATERIAL_OPEN` + `MATERIAL_SECTION_VIEW`.
5. **Admin (49-05)** — `/admin/content/materials` список с фильтрами + create/edit с XOR (URL XOR upload); drag-n-drop file upload через signed PUT URL прямо в Storage; Combobox для multi-attach.
6. **Polish (49-06)** — E2E Playwright тесты, cron `/api/cron/orphan-materials` (раз в сутки 03:00 UTC), запись в `/roadmap`, гайд методолога `docs/admin-guides/lesson-materials.md`, deploy на прод.

**Commits:** `a0ea1df` (cron + E2E), плюс серия предыдущих волн (49-01..49-05).

**Skill batch 24.04.26 — Integrated (parallel session).** 16 ANALYTICS skill-уроков прошли весь pipeline от MP4 до Production-DB. AI-классификация (16 новых записей в `classification.json`, avg 2.7 блоков/урок), seed-skill-lessons.ts создал 16 Lesson, перенос courseId `skill_analytics` → `01_analytics` (108 уроков), Kinescope upload (6.77 GB). Метрики после батча: 437 Lesson records, 5,700 chunks, 434 уроков с AI-классификацией.

---

## Session 19 (2026-04-23 → 2026-04-24) — Phase 48 Staging Environment

**Phase 48 — Staging Environment. SHIPPED + 5-layer debug incident resolved.**

1. **Staging стенд на VPS 89.208.106.208** — `staging.platform.mpstats.academy` (поддомен + DNS A-record). Второй Docker-контейнер `maal-staging-web` на порту 3001 (prod остаётся 3000). Nginx vhost с basic auth (`team`), SSL через certbot, `X-Robots-Tag: noindex`. Shared Supabase DB с prod, тестовые аккаунты с префиксом `staging-*`. Swap увеличен с 512 MB до 2 GB.

2. **Feature flag pattern** — `NEXT_PUBLIC_STAGING` (жёлтая плашка в header) + `NEXT_PUBLIC_SHOW_LIBRARY` (показывает Phase 46 Library). Хардкодить флаги в `docker-compose.staging.yml` `args` как literal `"true"` — substitution через `${VAR}` не работает с Next.js SWC.

3. **5-layer debug incident** (3 часа, 5 rebuild) — LibrarySection не показывался. Все баги починены: Turbo v2 strict env mode → `turbo.json` `build.env: ["NEXT_PUBLIC_*"]`; Compose `${VAR}` substitution → хардкод в args; `ReferenceError: process is not defined` → `dynamic(ssr:false)` + прямой `process.env.X`; `getLibrary` фильтр `course.id startsWith 'skill_'` → фильтр по `skillBlocks != null`; `<LibrarySection />` был только в view='courses' branch → вынес наружу. **Полный post-mortem:** `.claude/memory/project_phase48_debug_postmortem.md`.

4. **Результат:** Staging работает, Library видна в `/learn` в обеих view, prod не задет.

---

## Session 18 (2026-04-22, session 2) — Phase 46 Skill Lessons + Library

**Phase 46 — Skill Lessons Integration + Library foundation.**

1. **17 новых skill-уроков** полностью интегрированы: транскрибация (Whisper large-v3) → 182 чанка → embeddings → Supabase (5,473 total). Видео залиты на Kinescope (5.7 GB, 17 файлов). Lesson записи созданы, перемещены в существующие курсы (10→Аналитика, 7→Реклама).
2. **AI skill-классификация всех 422 уроков** (3-фазный пайплайн по контенту): Discovery (2047 навыков → 163 консолидированных), Taxonomy (32 skill-блока × 5 осей), Classification (1146 присвоений, avg 2.7 блоков/урок, 90% high confidence). Schema: `Lesson.skillBlocks Json?`.
3. **Retrieval**: убран `Course.isHidden` фильтр — skill-контент доступен в RAG/диагностике.
4. **CATEGORY_TO_COURSES**: добавлены `skill_analytics`, `skill_marketing`.
5. **Library UI**: компонент `LibrarySection` (оси→блоки→уроки), endpoint `learning.getLibrary`. Пока пустой — уроки в курсах. Готов для будущего контента.
6. **Архитектурное решение**: /learn → hub-layout (курсы свёрнуты, библиотека, мой трек наверху) — Phase 47.

---

## Session 17 (2026-04-22, session 1) — V8 Marketing Pages Launch

**V8 Marketing Pages Launch — переезд 10 страниц на боевые публичные URL + SEO. Задеплоено на прод.**

1. **Переезд путей** `design-new-v8-*` → боевые публичные URL: `/`, `/pricing`, `/about`, `/skill-test` (новый слаг для AI-диагностики), `/roadmap`, `/courses`, `/courses/analytics|ads|ai|ozon`. Внутренняя `/diagnostic` (после логина) не тронута.
2. **CP-виджет встроен в новую `/pricing`**: перенесена логика из старой `/pricing` (trpc.billing.initiatePayment, openPaymentWidget, CP SDK через next/script, промо через trpc.promo.activate), сохранён V8-дизайн.
3. **V8 компоненты обновлены**: V8Header/V8Footer/StickyCTA — NAV_LINKS на новые пути, диагностика-CTA → `/skill-test`.
4. **SEO**: 9 layout.tsx с per-page metadata (title через `absolute`), root layout.tsx обновлён под канон v2.1, `sitemap.ts` со всеми 10 URL + приоритеты.
5. **5 коммитов**, все на проде: `6206104` + `4c8e1a5` + `35b4061` + `d8bfdcb` + `d0b398c`.
6. **QA**: все 10 URL отдают 200, title/description/canonical корректны на каждой.

---

## Session 16 (2026-04-21) — Phase 45 Phone Collection

**Phase 45 — Сбор телефонов + Pricing redirect swap. Задеплоено на прод.**

1. **Обязательный телефон при регистрации**: `react-international-phone` с дропдауном стран (дефолт Россия), поддержка СНГ/международных номеров. Имя тоже стало обязательным.
2. **Yandex OAuth**: добавлен scope `login:phone`, телефон автоматически сохраняется из Яндекса. Новые юзеры без телефона → `/complete-profile`.
3. **DB**: `UserProfile.phone String?` (E.164), миграция применена на Supabase.
4. **Backend**: `profile.update` принимает phone с E.164 валидацией, `ensureUserProfile` подтягивает phone из user_metadata.
5. **CQ**: `pa_phone` + `$phone` отправляются при регистрации.
6. **Pricing redirect**: неавторизованные юзеры → `/register` (было `/login`).

---

## Session 15 (2026-04-16 → 2026-04-20) — Marketing Pages Sprint

Дизайн-система, 10 маркетинговых страниц, выбор V8 Brand Bento. Статус: ожидание доработки позиционирования от Егора → обновление текстов → деплой на прод.

---

## Session 14 (2026-04-16) — Diagnostic prompt v3

**Анализ 9 ревью Милы + обновление промпта генерации вопросов.**

1. **Анализ Google Doc** «CHECK платформы» (12 вкладок: GPT 1-3, Qwen 1-3, GPT nano 1-3). Лидер: GPT-4.1 сессия 3 (12+/15). Выявлено 10 системных проблем: повторяющиеся вопросы, ссылки на учебные материалы, обтекаемость, фактологические ошибки, неправильная терминология (ампостат), отсутствие ситуативности.
2. **Обновлён промпт** — вынесен в `packages/ai/src/question-prompt.ts` (без server-only зависимостей). 7 новых блоков: РАЗНООБРАЗИЕ, ФАКТОЛОГИЧЕСКАЯ ТОЧНОСТЬ, СИТУАТИВНОСТЬ, КАЧЕСТВО ОБЪЯСНЕНИЙ, ТЕРМИНОЛОГИЯ, ПЛОХИЕ ПРИМЕРЫ. Расширен ЗАПРЕЩЕНО: +4 правила.
3. **Сгенерированы 2 тестовые сессии** для Милы (промпт v3): `docs/test-session-gpt-41-nano-v3-1.md`, `docs/test-session-gpt-41-nano-v3-2.md`.

---

## Session 13 (2026-04-14) — Yandex OAuth: 3 bugs fixed

1. **Callback падал с `auth_callback_error` на проде** — пользователи не могли регистрироваться через Yandex ID. Sentry молчал, потому что catch-ветки использовали `console.error` без `Sentry.captureException`. **Root cause:** Node 20 undici fetch делает Happy Eyeballs, гонит IPv4 и IPv6 одновременно. На VPS нет IPv6 (`ENETUNREACH`), а IPv4 cold-connect до `87.250.251.227` периодически таймаутит. **Fix:** `NODE_OPTIONS=--dns-result-order=ipv4first` в `docker-compose.yml` + `fetchWithRetry` в `YandexProvider`. Добавлены `Sentry.captureException` в 4 catch-ветках.
2. **Yandex login не показывал account picker** — `prompt=login` Yandex молча игнорирует. **Fix:** `force_confirm=yes` (Yandex-specific параметр).
3. **Sentry cron alert false-positive fix** — `checkinMargin: 180` в `api/cron/check-subscriptions/route.ts`.

Commits: `0e87fda`, `e5b7648`, `15e3e86`.

---

## Session 12 (2026-04-13) — Sentry triage + 2 critical fixes + price change

1. **CP recurrent webhook crash** (MAAL-PLATFORM-2) — был бы блокером для Phase 28. Recurrent webhook использует **отдельную схему** (`Id`/`AccountId`/`Status`/`SuccessfulTransactionsNumber`), а не payment-схему. Старый handler пытался читать `TransactionId`/`InvoiceId`/`DateTime` → `PrismaClientValidationError`. Новые pure-модули: `parse-webhook.ts`, `decide-recurrent-update.ts`. 27 unit-тестов с реальным payload из Sentry. `Subscription.cpSubscriptionId String? @unique` добавлено — захватывается из `pay` event.
2. **Cron false-positive alert** (MAAL-PLATFORM-1) — GitHub Actions schedules дрейфят 60-100+ минут под нагрузкой. Margin расширен до 180 минут.
3. **Смена цен**: COURSE 2990→1990, PLATFORM 4990→2990. `UPDATE` прямо в Supabase + обновлён `seed-billing.ts`.

---

## Session 11.5 (2026-04-07) — Phase 44 Promo + Phase 29 Sentry

**Phase 44 — Промо-коды** (v1.5): design → plan → execute → deploy.
- DB: PromoCode, PromoActivation + Subscription.promoCodeId
- Backend: tRPC promo router (validate, activate, 4 admin CRUD), 5-step validation, $transaction
- /pricing: auth header, collapsible promo input, redirect /login?promo=КОД
- Admin: /admin/promo — create, table, deactivate, activations view

**Phase 29 — Sentry Monitoring**: @sentry/nextjs full stack. Org: mpstats-academy, project: maal-platform. Client/server/edge config, global-error boundary, instrumentation hook. Custom spans: CP webhooks, email webhook, OpenRouter LLM, Sentry Crons. Alert rules: new issue + regression → email.

---

## Session 11 (2026-04-02)

**Phase 43 — Diagnostic Model Switch & Prompt v2 (deployed):**

**Источник:** [Разбор Милы](https://docs.google.com/document/d/1vD-fsB_Bj_XY4ue7I6iZJ7zA1P65jqXwG6VA2fIhQxI) — 6 тестовых сессий (3 Qwen, 3 GPT), таблица итогов, выводы.

**Результаты ревью Милы:**
- GPT 3: 12/15 хороших вопросов (+), GPT 2: 7/15, GPT 1: 6/15
- Qwen 2: 5/15, Qwen 1: 3/15, Qwen 3: 0/15
- Вердикт: GPT значительно лучше Qwen по качеству диагностических вопросов

**Переключение модели:**
- Primary: `openai/gpt-4.1-nano` (было `qwen/qwen3.5-flash-02-23`)
- Fallback: `qwen/qwen3.5-flash-02-23` (было `openai/gpt-4.1-nano`)

**Обновление промпта (5 блоков):**
- Новый блок "САМОДОСТАТОЧНОСТЬ" — вопрос понятен без курса, fallback на общие знания при запрещённом контексте
- Новый блок "КАЧЕСТВО ФОРМУЛИРОВОК" — DRR > CPO, стандартные термины, запрет обтекаемых фраз
- Расширен ЗАПРЕЩЕНО (+6 пунктов): налоги, маркировка, серые схемы, промо-механики, кейсы из уроков, ссылки на материалы
- Разнообразие: запрет 2+ вопросов на одну подтему
- Explanation: фактологический, без ссылок на источник

**Фильтр chunks (SQL):**
- Исключены `m00_bonus` и `m01_intro` уроки — содержат VPN, плагины, IT-определения
- Фильтр в `fetchRandomChunks()`: `AND lesson_id NOT LIKE '%_m00_%' AND lesson_id NOT LIKE '%_m01_intro_%'`

**Таймаут LLM:** 15s → 25s (GPT-4.1-nano с json_schema strict mode иногда не укладывался)

**Тестовые сессии для Милы:** 3 штуки по 15 вопросов → `docs/test-session-gpt41-new-prompt{,-2,-3}.md`

**Ключевые файлы:**
- `packages/ai/src/openrouter.ts` — model swap
- `packages/ai/src/question-generator.ts` — prompt v2, chunk filter, timeout
- `docs/test-session-gpt41-new-prompt*.md` — 3 тестовые сессии

---

## Session 10 (2026-04-01)

**Quick fixes (deployed):**
- Убрана подпись "Дата и CVV — на следующем шаге" с обеих карточек на `/pricing`
- Добавлен favicon (`apps/web/src/app/icon.svg`) — логотип MPSTATS в тёмном цвете (#1a1a2e), auto-discovery Next.js

---

## Session 9 (2026-03-27-29)

**v1.4 QA Audit Fixes — 6 фаз через GSD workflow (37-42):**

**Источник:** [Google Sheets "Аудит Платформы"](https://docs.google.com/spreadsheets/d/1ol0qu3hZyjf9zEH52zYyep4rzonFdGjiPXLd1Q1swlY) — 5 листов: Обучение (Настя/Алена), Диагностика (Мила), Тарифы (Ирина), Профиль (Ирина), Платформа (Карина).

**Phase 37 — Watch Progress Fix (R24-R27):**
- `KinescopePlayer.tsx`: убран timer fallback `position * 1.1` → duration из БД
- Auto-complete toast "Урок завершён!" при 90%+ (sonner)
- Счётчики "Завершено" унифицированы → единый source `recommendedPath`

**Phase 38 — Diagnostic UX Fix (R11-R14, R20):**
- Заголовок "зон развития" считает ВСЕ gaps > 0, не только HIGH
- Badges переименованы: Высокий/Средний/Низкий + tooltips (Radix)
- Error boundary на results page с retry:2

**Phase 39 — AI & Content Quality (R17, R18, R35, R42):**
- `fixBrandNames()` regex + system prompt → "Валберес" → "Wildberries" (9 unit tests)
- DiagnosticHint таймкоды → `playerRef.seekTo()` + scrollIntoView + amber highlight 800ms

**Phase 40 — Navigation & Filters (R10, R21, R22, R43, R46):**
- Фильтры в URL searchParams: `/learn?category=MARKETING` (browser back работает)
- Тур: `hasAutoStartedRef` guard — 1 раз per page per lifetime
- Комментарии: `sanitizeUserName()` на бэкенде
- Яндекс OAuth: `prompt=login` — выбор аккаунта при каждом входе

**Phase 41 — Pricing & Logo UX (T-R3, T-R6, R15, R40):**
- Logo в sidebar → `/dashboard` (не на лендинг)
- `COURSE_AXIS_MAP` badge'и в dropdown курсов на pricing

**Phase 42 — Diagnostic Prompt Tuning (ревью Милы, 12 замечаний):**
- 6 блоков правил в `buildSystemPrompt()`
- `skill_category` колонка добавлена в `content_chunk` (backfill 5291 chunks)
- 6 тестовых сессий для Милы

---

## Session 8 (2026-03-27)

**CQ/Auth Bugfix Session 2 — live QA с email-командой (Андрей Лобурец):**

**CQ даты:** `pa_period_end` / `pa_access_until` → `DD.MM.YYYY HH:MM` (МСК) + `_tech` → ISO 8601

**DOI-ссылка (critical fix):** Supabase `site_url` уже содержит `/auth/v1`, дублирование → 404

**pa_registration_completed (critical fix):** Событие стреляло при `signUp()` ДО подтверждения email. Убрано из `actions.ts`, оставлено только в `auth/callback/route.ts`

**pa_name:** Webhook читал `user_metadata.name`, но регистрация сохраняет как `full_name`

**Reset-password:** `redirect()` бросал NEXT_REDIRECT → возвращаем `{ success: true }` + client redirect

**Login:** Unconfirmed юзеры видели "Неверный email" → "Подтвердите email"

**Supabase SMTP — Resend:** smtp.resend.com, 30 emails/h, min interval 30s

**Открытый вопрос — CQ склейка лидов:** `by_user_id=true` создаёт дубликаты, нужен рефакторинг

---

## Session 7 (2026-03-26)

**Platform Audit — баг-фиксы из Google Sheets:**
- "0 мин" длительность: fetch из Kinescope API → PATCH в Supabase (405 уроков)
- Одинаковые таймкоды: `sourceIndices` в LLM JSON schema — LLM указывает номера фрагментов per question
- Неверное "Урок 1": бонусные модули (m00_*) сортировались первыми → `aIsBonus ? 1 : -1`
- Tooltip на лампочку, "Назад" с pricing → `router.back()`
- Google Sheets интеграция через gspread

---

## Session 6 (2026-03-26)

**CQ/Auth Bugfix Session — QA с email-командой:**
(Дублирует Session 8 — те же фиксы были начаты здесь)

---

## Session 5 (2026-03-26)

**Phase 36 — Product Tour / Onboarding (complete + deployed):**
- driver.js, 3 tooltip-тура: Dashboard (4), Learn (3 или 5 по CJM), Lesson (5)
- CJM-логика: Learn без диагностики → "Все курсы" (3 шага), с диагностикой → "Мой трек" (5 шагов)
- UX fixes: sidebar footer профиль убран, UserNav на tRPC, mobile nav compact, admin mobile бургер

**Phase 34 — User Profile Enhancement (complete + deployed):**
- Supabase Storage bucket `avatars` с 4 RLS-политиками
- Avatar upload: canvas resize до 256x256 webp
- Profile completeness баннер на дашборде
- OAuth name copy при первом `profile.get`

**Phase 35 — Lesson Comments (complete):**
- Prisma `LessonComment` с self-relation для 1-level threading
- Desktop: комментарии под AI-чатом; Mobile: табы "AI-чат" / "Комментарии (N)"
- **RAG fix:** `getChunksForLesson` переведена с Supabase PostgREST на Prisma `$queryRaw` (TCP)
- Summary footnotes: CollapsibleFootnotes, только реально цитированные

---

## Session 4 (2026-03-26)

**LLM Model Switch — Qwen 3.5 Flash:**
- `openai/gpt-4.1-nano` → `qwen/qwen3.5-flash-02-23` ($0.26/M vs $0.40/M, IFBench 76.5)
- Позже отменено в Session 11 (GPT лучше по качеству диагностики)

**Phase 36 — Product Tour (initial implementation):**
- 3 тура, TourProvider, HelpCircleButton, 14 data-tour атрибутов
- Баги: scope, infinite loop, CSS overrides, popover arrow, dynamic steps

---

## Session 3 (2026-03-25-26)

**Phase 33 — CQ fix:** `setUserProps` → `trackEvent`, CQ подтвердили 10/10 событий
**Phase 25 — Legal + Cookie Consent:** 5 legal-страниц, 3 чекбокса, cookie consent, 12 E2E тестов

**CQ gotcha (critical):** Свойства через `setUserProps` на лида, НЕ через `params` в `trackEvent`

---

## Session 2 (2026-03-24)

**QA Test Suite — 55 тестов, 0 failures:** 24 unit + 31 E2E (5 файлов)
**Phase 33 — CQ Email Automation:** 12 событий с `pa_` prefix, cron endpoints, GitHub Action

---

## Session 1 (2026-03-19)

**Phase 26 — Яндекс Метрика:** счётчик 94592073, 8 целей с `platform_` prefix
**Phase 32 — Custom Track Management:** 3 tRPC мутации, toggle/remove, rebuild

---

## Earlier Sessions (2026-03-18 and before)

**Phase 22 — CQ Integration:** JS widget, HMAC auth, Standard Webhooks, form-encoded API
**Phase 27 — SEO + Custom Error Pages:** sitemap, robots, OG-tags, 404/error
**Phase 31 — Admin Roles:** USER/ADMIN/SUPERADMIN enum, paywall bypass
**Security Hardening:** RLS на 18 таблицах, function search_path fix
**Perf splitLink:** AI queries в отдельном батче (instant page load)
**Phase 14 — Mobile Responsive:** viewport meta, landing nav, hero, overflow fixes
**Pricing bugfixes:** dropdown + redirect для unauthenticated
**Phase 19 — Billing UI + Phase 21 — Domain Migration**
**Kinescope Player Fix:** aspect-video + iframe вместо react-kinescope-player
**Phase 6 — Production Deploy:** Docker, Nginx, SSL
**Auth Registration Bug:** handle_new_user trigger без createdAt/updatedAt
**Kinescope Upload:** 405 видео, 209.4 GB
