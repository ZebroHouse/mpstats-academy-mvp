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

**Remaining work:**
1. Phase 33-03: CQ Dashboard Setup (на стороне CQ команды).

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

## Last Session (2026-06-08) — Phase 62 «Инструменты MPSTATS» partner course shipped to prod

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

- VPS: **89.208.106.208** (deploy user, Docker Compose)
- Redeploy: `git pull && docker compose down && docker compose build --no-cache && docker compose up -d`
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
