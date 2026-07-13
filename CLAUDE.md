# CLAUDE.md — MPSTATS Academy MVP

**Last updated:** 2026-07-13

> Детали по сессиям, спринтам, Supabase, деплою, CQ, staging — в `.claude/memory/`.
> Индекс: `.claude/memory/MEMORY.md`. Полная лента сессий: `.claude/memory/session-history.md`.

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

> Компактная таблица майлстоунов. Развёрнутые детали каждого — в соответствующем topic-файле памяти (см. `MEMORY.md`) и в `session-history.md`.

| Milestone | Status |
|-----------|--------|
| v1.0–v1.4 (Phases 1–42) | Shipped 2026-02→03 (MVP, admin, auth+billing, pre-release, QA fixes) |
| v1.5 Growth & Monetization | Shipped (Phases 44/45/46/48/49/50) |
| v1.6 Engagement | Shipped (Phases 51–53 + 56) |
| v1.7 RAG Quality | Shipped (Phase 55 — full-platform vision-RAG, 91.5% coverage) |
| v1.8 Library Redesign | Shipped 2026-05-22 (Phase 57 — `/learn` job catalog + hidden-lesson auto-sync) |
| v1.9 Agentic Search | Shipped 2026-05-25 (Track B — intent→jobs engine) |
| v1.10 Diagnostic on Jobs | Shipped 2026-05-28 (Phase 58 — top-3 джобы, slim онбординг) |
| v1.11 Ambassador Codes | Shipped 2026-05-28 (Phase 60 — AMBASSADOR реф-коды + admin UI) |
| v1.12 Marketplace-aware Diagnostic | Shipped 2026-06-01 (Phase 59 v2 — static deck 30 вопросов WB+Ozon) |
| v1.13 Обучение 2.0 | Shipped 2026-06-05 (Phase 61+61.1 — plan/solutions/library/favorites, DAU/WAU/MAU; `4145a68`) |
| v1.14 Инструменты MPSTATS | Shipped 2026-06-08 (Phase 62 — партнёр-курс `/mpstats-tools`, env-gated) |
| v1.15 Аналитика 2.0 | Shipped 2026-06-09 (Phase 63 — 4 таба, MRR-рекуррент, `UserProfile.isTest`; `90b6192`) |
| v1.16 Бесшовный вход из MPSTATS | Shipped dark 2026-06-11 (Phase 64 — ручка `/api/partner/mpstats/enter`; `60e77b6`) |
| v1.17 Cohesive entry pages | Shipped 2026-06-16 (Phase 65 — тёмные `/register`+`/login` на V8; `62e69e3`) |
| v1.18 Design System v2 reskin | Shipped 2026-06-23 (branded-light, per-section deep/middle/baseline; `932f597`) |
| v1.19 Ads playbooks remap | Shipped 2026-06-23 (17 задач MARKETING + срез суффикса в 116 названиях; `ee1ff2f`) |
| v1.20 Текстовые уроки (Фаза A) | Shipped 2026-06-24 (TipTap-редактор, публикация→`content_chunk`; `5b09617`) |
| v1.21 Интерактивные уроки (Фаза B) | Shipped 2026-06-25 (гейты+чекпоинты, `progressState`; `11a611f`) |
| v1.22 Контент-инструменты (Фаза C) | Shipped 2026-06-25 (дашборд чекпоинтов + `/admin/jobs` + карусель; `83fb681`) |
| v1.23 Аналитика+AI плейбуки remap | Shipped 2026-06-25 (+35/−15 задач, покрытие 94%; `3f7e8ba`) |
| v1.24 Триал+реф-плашка+счётчик | Shipped 2026-06-29 (авто-триал 3 дня, первый урок джобы free; `000c8d6`) |
| v1.25 Лиды → amoCRM (Albato) | Shipped 2026-06-29 (хук в `onboarding.complete`, fire-once; `1714dd6`) |
| v1.26 Sales-аналитика | Shipped 2026-06-29 (реестр клиентов+CSV, воронка реф-кодов, клики) |
| v1.27 Витрина (storefront) | Shipped 2026-06-30 (`/dashboard` полки + `badges`; `4bc08b4`) |
| v1.28 Диагностика по осям | Shipped 2026-07-03 (`AxisLearningPath v3`, разбор ошибок ожил; `1397a93`) |
| Post-v1.28 (07-06→07-08) | Контекстный возврат после урока, скролл/мобайл фиксы интерактива, курс `08_ctr`, роль SALES, единые фильтры аналитики, Tochka OAuth LIVE, пост-онбординг первый урок (`f9120da`) — см. `MEMORY.md` |
| Post-v1.28 (07-12→07-13) | Курс `09_ozon_prodvizhenie` LIVE (51 ур, 1990₽; `afd3424`), реф-код lazy-gen фикс + backfill 391 (`2c438b5`, PR #33) — см. `MEMORY.md` |

**Remaining work:**
1. Phase 33-03: CQ Dashboard Setup (на стороне CQ команды).
2. Ads playbooks — внешние долги от методологов (1 урок дозаписать, 3 пустые задачи, Ozon-версии 9 задач). Раскладка: `scripts/job-mapping/results/ADS-PLAYBOOKS-DEBT.md`.
3. Аналитика+AI плейбуки — внешние долги (1 draft-задача, 6 уроков, вся Ozon-сторона аналитики). Список: `scripts/job-mapping/results/ANALYTICS-AI-DEBT.md`.
4. Vision-RAG бэклог — 102 урока без визуального слоя (хэндов `.claude/handoffs/2026-07-07-vision-rag-backlog.md`).

## Active Branches

_No long-lived branches in flight._ Ветки фаз смерджены; worktree-остатки безопасно удалять (Windows long-path → `cmd //c rd /s /q <path>` + `git worktree prune`, либо `npx rimraf`).

**Cross-AI sync policy (read before editing this file):**
- `MAAL/CLAUDE.md` (master) — только **shipped**-статус + указатели. Развёрнутые детали фич живут в topic-файлах памяти и `session-history.md`, не здесь.
- При создании long-lived ветки — добавить строку в Active Branches; при merge/close — убрать.

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

## Sessions

Полная лента «Last/Previous Session» перенесена в `.claude/memory/session-history.md` (newest-first, 50+ сессий с 2026-03).
Свежие сессии + durable-факты/гочи — в auto-memory `MEMORY.md`.
Прод сейчас: `2c438b5` (курс Озон `09_ozon_prodvizhenie` + реф-код lazy-gen фикс). Ранее: `08_ctr`, роль SALES, Tochka OAuth, пост-онбординг `f9120da`.

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
