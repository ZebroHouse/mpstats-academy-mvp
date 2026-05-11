# CLAUDE.md — MPSTATS Academy MVP

**Last updated:** 2026-05-12

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
| v1.6 Engagement | In Progress (Phases 51-52 shipped, 53A awaiting merge, 53-54 planned) |
| v1.7 RAG Quality | In Progress (Phase 55 Sprint 2 + 2C shipped — 89/440 lessons; Sprint 3 prep on branch `phase-55-sprint-3-prep`) |

**Remaining work:**
1. Phase 53A — referral, awaiting Egor's merge to master
2. Phase 33-03: CQ Dashboard Setup (на стороне CQ команды)
3. Phase 47: /learn Hub-Layout — навигационный хаб
4. **Phase 55 Sprint 3** — full platform vision-RAG ingest (~351 lessons across 4 courses). Prep in progress: selector v4 + safety infra + docs. See `scripts/vision-ingest/PLAYBOOK.md`.

## Active Branches

| Branch | Worktree | PR | Status |
|--------|----------|----|----|
| `phase-55-sprint-2c` | `MAAL-phase55/` | [#4](https://github.com/zebrosha-max/mpstats-academy-mvp/pull/4) | Vision RAG 10→89 lessons of 03_ai, smoke 89%. Awaiting merge. |
| `phase-55-sprint-3-prep` | `MAAL-phase55/` | (no PR yet) | Foundation work for full-platform vision ingest: docs (ARCHITECTURE.md, PLAYBOOK.md), safety infra, selector v4 with DB-persisted mappings. Based on `phase-55-sprint-2c`. |
| `phase-53a-referral` | (in main worktree, not active) | (none) | Referral program, awaiting Egor's merge decision. Switch flag i1→i2 scheduled 2026-06-01. |
| `phase-53b-referral-admin` | (in main worktree, not active) | (none) | Admin moderation UI, QA passed 2026-05-06. Awaits merge after 53A. |

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

## Last Session (2026-05-11 evening) — Phase 55 Sprint 2C shipped + Sprint 3 prep

**Phase 55 Sprint 2C — Vision RAG expansion.** PR #4 на `phase-55-sprint-2c` (3 commits: `fee68bb` → `a664716` → `91636a5`). 79 lessons of `03_ai` ingested → DB теперь содержит 89 lessons с vision-чанками (792 frame chunks total). Стоимость $0.94 (бюджет $2). Smoke test: **16/18 = 88.9%** (pilot baseline 84%, threshold 80%) → GO Sprint 3.

Пайплайн hardened:
- Selector эволюция v1 (word-overlap, 67% recall) → v2 (greedy bipartite) → v3 (positional) + manual override для m01_intro / m08 = 100% coverage.
- `vlm-describe.ts` переписан: concurrency=5, AbortController 60s timeout, JSONL incremental save + resume. Пережил mid-run kill в этом спринте.
- `INGEST_SUFFIX` env var параметризует 5 pipeline-скриптов под изолированные артефакты.

**Sprint 3 prep — на ветке `phase-55-sprint-3-prep` (5 фаз):**
- P1: `scripts/vision-ingest/ARCHITECTURE.md` + `PLAYBOOK.md` + README + MAAL/CLAUDE.md updates
- P2: `validate-selection.ts` (pre-flight gate), `smoke-baseline.ts` (auto LLM-judge), safety memory
- P3: Selector v4 с DB-persisted mappings (`Lesson.metadata.videoSource`) + LLM judge confidence + CSV review flow
- P4: Regression на 03_ai (ожидаем 89/89 точное соответствие)
- P5: Dry-run на 1 небольшом курсе перед full Sprint 3

Полные правила (7) — в `.claude/memory/vision-ingest-safety.md`. Cross-AI.

Полный verdict + метрики Sprint 2C — `scripts/vision-ingest/results/decision-sprint2c.md`.

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
- **Vision-ingest пайплайн (`scripts/vision-ingest/`):** 7 жёстких safety rules — `AbortController` timeout на каждый external fetch, JSONL resume, pre-flight `validate-selection.ts`, dry-run на новых курсах, `isHidden=false` обязательно, идемпотентный селектор с DB-persisted mappings, cumulative cost logging. Каждое правило прослежено до реального incident'а Sprint 2/2C. Cross-AI authoritative: `.claude/memory/vision-ingest-safety.md`. Запуск любого ingest — только по `scripts/vision-ingest/PLAYBOOK.md`.
- Details: `.claude/memory/cq-integration.md`, `.claude/memory/feedback_doi_resend_protocol.md`, `.claude/memory/vision-ingest-safety.md`

## QA

55 тестов (24 unit + 31 E2E), 0 failures. Test user: `tester@mpstats.academy`.
