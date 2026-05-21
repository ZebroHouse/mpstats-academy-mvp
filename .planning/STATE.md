---
gsd_state_version: 1.0
milestone: v1.6
milestone_name: Engagement
status: Phase 56 complete (Entry Flow Redesign)
stopped_at: Phase 56 Plan 04 complete — phase 56 complete
last_updated: "2026-05-18T12:00:00.000Z"
progress:
  total_phases: 4
  completed_phases: 1
  total_plans: 9
  completed_plans: 9
  percent: 25
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-06)

**Core value:** Пользователь проходит AI-диагностику, получает точную карту навыков и персонализированный трек обучения из реальных данных
**Current focus:** Phase 56 — entry-flow-redesign

## Current Position

Phase: 56 (entry-flow-redesign) — COMPLETE
Plan: 4 of 4 (56-01, 56-02, 56-03, 56-04 complete)

## Performance Metrics

**Velocity (v1.0):**

- Total plans completed: 20
- Total phases: 10
- Timeline: 49 days (2026-01-08 -> 2026-02-26)

**Velocity (v1.1):**

- Total plans completed: 11
- Total phases: 6
- Timeline: 2 days (2026-02-26 -> 2026-02-27)

## Accumulated Context

### Decisions

Full v1.0 decision history: `milestones/v1.0-ROADMAP.md`
Full v1.1 decision history: `milestones/v1.1-ROADMAP.md`

- [v1.2]: Yandex ID via server-side OAuth proxy (Supabase has no native provider)
- [v1.2]: Paywall in tRPC procedure, NOT middleware (Edge Runtime cannot use Prisma)
- [v1.2]: CloudPayments webhooks need HMAC + idempotency by TransactionId
- [v1.2]: Auth and Billing are independent tracks after Phase 16
- [16-01]: Baselined existing DB with prisma migrate (0_init) since project used db push
- [16-01]: Feature flags via FeatureFlag model + isFeatureEnabled() safe-default helper
- [16-01]: All NOT NULL billing fields have defaults for safe migration on existing data
- [Phase 16]: Feature flag admin: toggleUserField pattern reused for toggleFeatureFlag with TRPCError re-throw
- [17-01]: OAuthProvider interface for extensible server-side OAuth (Yandex now, Tochka later)
- [17-01]: Supabase session via generateLink(magiclink)+verifyOtp pattern for custom OAuth providers
- [17-01]: Used @mpstats/db/client singleton in callback route instead of direct PrismaClient
- [17-02]: Inline SVG for Yandex Ya logo (no external asset dependency)
- [17-02]: File-system grep tests to enforce no-Google policy at CI level
- [Phase 18]: Single catch-all webhook route with query param for event type resolution
- [Phase 18]: Return {code: 0} on DB errors to prevent CloudPayments retry storms
- [Phase 18]: Recurrent extends from currentPeriodEnd (not now) to avoid billing gaps
- [Phase 18]: Cancel sets CANCELLED but does NOT expire — access until currentPeriodEnd
- [Phase 19]: Inline CP cancel logic in tRPC router instead of cross-package import
- [19-02]: Pricing page outside (main) layout — own header with back nav, no sidebar
- [19-02]: Protected queries on public page use retry:false for graceful unauthenticated handling
- [19-02]: CardFooter + mt-auto pattern for equal-height plan card button alignment
- [21-01]: HTTP-only Nginx config before certbot (let certbot add SSL directives automatically)
- [21-01]: No redirect from old DuckDNS domain — just disabled
- [Phase 21]: No automated Supabase/Yandex config — requires dashboard access (human-action checkpoint)
- [20-01]: FREE_LESSON_THRESHOLD=2: lessons with order<=2 are always free
- [20-01]: Batch subscription fetch per procedure (not per lesson) for performance
- [20-01]: getRecommendedPath keeps videoId visible (track preview is frontend-only)
- [20-02]: Paywall LockOverlay takes priority over DiagnosticGateBanner in render chain
- [20-02]: Track blur gating: first 3 lessons visible, rest CSS-blurred with pointer-events-none
- [Phase 22]: noreply@mpstats.academy as sender, CQ events with $ prefix, auth emails via Supabase Hook not CQ
- [Phase 22]: Feature flag cache with 60s TTL to avoid DB query per email send
- [Phase 22]: Fire-and-forget email pattern: sendXxxEmail().catch(console.error) -- email failure never breaks billing
- [23-01]: Keep single skillCategory alongside new skillCategories Json for backward compat (8+ consumers)
- [23-01]: Tagging.ts has own OpenRouter/Supabase clients (no server-only import) for CLI script compatibility
- [23-01]: Two-stage topic pipeline: LLM free tagging then LLM clustering into canonical dictionary
- [23-02]: Source tracing fields optional on DiagnosticQuestion — mock/FINANCE gracefully omit them
- [23-02]: generateSectionedPath with try/catch fallback to flat generateFullRecommendedPath
- [23-02]: getRecommendedPath returns isSectioned flag for frontend format detection
- [23-03]: Errors section open by default in accordion, permanent localStorage hint dismissal
- [23-03]: Dual Radar Chart via previousData prop with dashed "before" + solid "after" polygons
- [31-01]: Three-level Role enum (USER/ADMIN/SUPERADMIN) replaces boolean isAdmin
- [31-01]: adminProcedure for ADMIN+SUPERADMIN, superadminProcedure for SUPERADMIN-only
- [31-01]: Self-demotion and self-deactivation guards prevent SUPERADMIN lockout
- [31-02]: Profile query reused for role detection in sidebar/mobile-nav (no new endpoint)
- [31-02]: Privilege-aware UI: SUPERADMIN sees dropdowns/toggles, ADMIN sees read-only badges
- [Phase 27]: Title template '%s | MPSTATS Academy' + metadataBase for correct OG URL resolution
- [Phase 27]: Next.js Metadata API verification.yandex for Yandex Webmaster meta tag
- [Phase 31]: Settings page restricted to SUPERADMIN via superadminProcedure (not adminProcedure)
- [30-01]: findUnique for LearningPath (userId @unique, no isActive field) instead of findFirst+isActive
- [30-01]: protectedProcedure for searchLessons — splitLink AI_PROCEDURES handles batching separation
- [30-02]: Switched vector search from Supabase RPC to Prisma raw SQL (RPC timeout at threshold 0.3)
- [30-02]: Raised vector similarity threshold 0.3→0.5 to reduce noise and avoid timeouts
- [30-02]: Timecode deep-link conditional on ?t= param presence (preserves saved watch position)
- [24-01]: Supabase browser client for auth detection on public /support page (not tRPC protectedProcedure)
- [24-01]: window.carrotquest accessed via `as any` cast to avoid conflicting global type declarations
- [Phase 32]: findUnique for SkillProfile by userId (not sessionId — field does not exist on model)
- [Phase 32]: Custom section kept even if empty on removeFromTrack (preserve user intent)
- [32-02]: getRecommendedPath always fetched (not gated by hasDiagnostic) to support custom-only tracks
- [32-02]: Checkmark in courses view uses no-op callback (visual-only, no remove from courses view)
- [32-02]: CTA banner only shown when no diagnostic AND no recommendedPath

- [34-01]: Direct Prisma query in layout for profile fetch (faster than tRPC server caller, follows admin layout pattern)
- [34-01]: Public avatars bucket — avatars not secret, avoids signed URL complexity
- [34-01]: OAuth name copy is one-time in profile.get — transparent, no migration needed
- [36-01]: overlayClickBehavior uses no-op DriverHook (driver.js 1.4 has no 'none' option)
- [36-01]: TourProvider wraps main content inside <main> (not entire layout) for clean server/client boundary
- [34-02]: Client-side canvas resize (no external lib) — 256x256 square crop, webp 0.85 quality
- [34-02]: next/image with unoptimized for Supabase Storage public avatar URLs
- [34-02]: Avatar path extraction from public URL via regex for Storage delete flow
- [35-01]: Plain text comments (not markdown) -- no XSS surface, simpler for short user messages
- [35-01]: Cascade delete on parent comment removes all replies (CommentReplies self-relation)
- [35-01]: Cursor-based pagination (20/page) for comments list query
- [35-02]: Mobile tabs (AI-chat + Comments) instead of stacked sections -- AI-chat was buried below comments
- [35-02]: Optimistic comments use currentUser profile data for instant name/avatar display
- [35-02]: Desktop sidebar wrapped in hidden lg:block -- mobile gets MobileChatCommentsTabs component
- [Phase 37]: Remove position*1.1 estimation entirely — no progress when DB duration unknown
- [Phase 38]: Tooltip follows existing popover.tsx shadcn/ui pattern for consistency
- [Phase 38]: Pre-filter sections with _filteredLessons to avoid double-filtering and fix counter mismatch
- [Phase 39]: Keep lesson with lowest order when duplicates found; transfer progress with @@unique conflict check
- [Phase 39]: Do NOT replace Ozon — valid Russian spelling, only Wildberries transliterations fixed
- [Phase 39]: SourceTooltip already correct (uses handleTimecodeClick), no changes needed
- [Phase 40]: Server-side email sanitization in comments (not frontend) to prevent any leak path
- [Phase 40]: router.replace for URL filter state (no history pollution)
- [Phase 40]: Session-scoped useRef<Set> guard for one-time auto-start effects (tour)
- [Phase 41]: COURSE_AXIS_MAP hardcoded mapping (no DB query) since course-to-axis relationship is stable
- [Phase 42]: Prompt-only change, no code logic modifications — 6 rule blocks added to buildSystemPrompt from Mila QA review
- [49-01]: Гибрид externalUrl/storagePath на одной таблице Material — XOR валидируется в Zod на уровне tRPC, не CHECK constraint
- [49-01]: order Int на join LessonMaterial, не на Material — один материал может быть «3-м» в одном уроке и «1-м» в другом
- [49-01]: Bucket lesson-materials private + zero RLS — весь доступ через service_role в material.getSignedUrl (Wave 2)
- [49-01]: MIME whitelist на bucket-уровне дублирует frontend whitelist (defense in depth, D-12)
- [49-01]: Phase 49 константы в @mpstats/shared, не в db — UI и tRPC импортируют без затягивания Prisma client
- [49-02]: Sentry as soft-optional require (try/catch require '@sentry/nextjs') — @mpstats/api decoupled from Next-only deps, fallback noop in tests
- [49-02]: z.nativeEnum(MaterialType) over z.enum(string-tuple) — fixes Prisma create input typing
- [49-02]: requestUploadUrl uses upload-id proxy (Date.now+random), not materialId — avoids two-roundtrip UX, documented vs D-09
- [49-02]: DB-level isHidden filter on attached lessons in getSignedUrl include (W#1 perf, not JS post-fetch filter)
- [49-02]: storagePath never sent to client — public payload exposes hasFile boolean only
- [49-02]: vitest added as devDep to @mpstats/api — minimal runner setup for unit tests on routers
- [49-03]: Sheet column layout differs from plan (6 cols not 7, no description column) — verified live, parser adjusted
- [49-03]: URL-based type inference fallback for blank Type cells (docs.google.com/spreadsheets → CALCULATION_TABLE etc.) — saves 30+ rows from unmatched bucket
- [49-03]: «нет»-marker rows skipped silently (not parse errors) — methodologist convention for "lesson has no material"
- [49-03]: Multi-variant title indexing (full + before-pipe + after-pipe + base-normalized) — boosts match rate 70%→87%
- [49-03]: Force-commit ingest-results past .gitignore for one-shot prod write audit trail
- [49-05]: Native <label> вместо shadcn Label — компонента нет в ui/, паттерн уже виден в admin/promo
- [49-05]: In-memory lesson filter в LessonMultiAttach (~422 уроков) — отдельный searchLessonsForAttach endpoint избыточен
- [49-05]: XHR PUT (не fetch) для upload progress events — fetch не имеет upload progress API
- [49-05]: Один [id]/page.tsx для create+edit (params.id === 'new' as discriminator)
- [49-05]: Inline confirmation modal без shadcn Dialog — паттерн HideConfirmDialog уже в codebase
- [56-01]: String[] вместо Prisma enum для marketplaces/goals — повторяет паттерн toursCompleted
- [56-01]: Additive-миграция на prod (nullable/DEFAULT колонки) применена через Supabase Management API query endpoint, _prisma_migrations синхронизирована ручным INSERT — zero data-loss (170 users целы)
- [56-02]: onboarding tRPC-роутер — копия паттерна profile.ts (protectedProcedure + ensureUserProfile + handleDatabaseError); z.enum whitelist на marketplaces/goals/experienceLevel отклоняет tampered-ключи до DB-записи
- [56-02]: Гард (main)/layout читает onboardingCompletedAt напрямую через prisma — getState оставлен для /profile; один лишний select-field, ноль новых round-trip'ов
- [56-02]: Unit-тест onboarding: ctx prisma stub дискриминирует middleware-findUnique (lastActiveAt debounce) по select-аргументу, возвращая свежий lastActiveAt → debounce пропускает side-effect update
- [56-03]: /welcome — standalone top-level роут вне (main), свой fullscreen layout + server-side auth-guard; гард (main)/layout читает onboardingCompletedAt прямым prisma.findUnique (один select-field, ноль новых round-trip'ов)
- [56-03]: Визард — клиентский useState-степпер (1|2|3|'fork'), одна финальная мутация onboarding.complete на развилке; router.push строго в onSuccess — защита от redirect-loop при сбое мутации
- [56-03]: /welcome добавлен и в middleware protectedRoutes, и в welcome/layout getUser-проверку — defense in depth (middleware быстрее, layout надёжнее)
- [56-04]: Жёсткий гейт диагностики на уроке снят — урок доступен на подписке без теста; удалена ТОЛЬКО ветка hasDiagnostic === false, подписочный LockOverlay нетронут
- [56-04]: DiagnosticGateBanner — закрываемый хинт; dismissed инициализируется true (не false), чтобы карточка не мелькала у юзеров с установленным localStorage-флагом до useEffect-проверки
- [56-04]: QualificationSection вынесена в отдельный компонент (паттерн SecurityCard) — profile/page.tsx уже 838 строк; переиспользует welcome-options без хардкода списков

### Blockers/Concerns

- Supabase Admin API session creation for custom OAuth needs sandbox validation (Phase 17)
- CloudPayments webhook payload format needs sandbox testing (Phase 18)
- Pricing structure (actual prices) needed from product owner before Phase 19

### Roadmap Evolution

- Phase 21 added: Domain migration from DuckDNS to platform.mpstats.academy
- Phase 22 added: Transactional email notifications (billing, auth, system)
- Phase 23 added: Diagnostic 2.0 — personalized learning track with lesson-level topic tagging, question-to-content tracing, and error-based path prioritization
- Phase 24 added: Support Contact — функционал связи со службой поддержки
- Phase 25 added: Legal + Cookie Consent — оферта, ПК, ПС, баннер кук
- Phase 26 added: Яндекс Метрика — интеграция аналитики
- Phase 27 added: SEO + Custom Error Pages — sitemap, robots.txt, OG-теги, 404/500
- Phase 28 added: Боевой CloudPayments — production credentials
- Phase 29 added: Sentry Monitoring — мониторинг ошибок в продакшене
- Phase 30 added: Content Discovery — smart search, фильтры, персональный трек
- Phase 31 added: Admin Roles — admin/superadmin, управление доступом команды
- Phase 32 added: Custom Track Management — ручное управление персональным треком (добавить/удалить уроки)
- Phase 33 added: CQ Email Automation — 10 событий Carrot Quest + HTML-шаблоны + inactive tracking
- Phase 34 added: User Profile Enhancement — аватар upload, display name, завершённость профиля
- Phase 35 added: Lesson Comments — комментарии к урокам с ответами (1 уровень вложенности)
- Phase 36 added: Product Tour / Onboarding — 3 tooltip-тура для новых пользователей

### Pending Todos

None.

## Performance Metrics (v1.2)

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 16    | 01   | 4min     | 2     | 6     |
| Phase 16 P02 | 3min | 2 tasks | 4 files |
| 17    | 01   | 5min     | 2     | 6     |
| 17    | 02   | 3min     | 2     | 3     |
| Phase 18 P01 | 3min | 2 tasks | 4 files |
| 18    | 02   | 2min     | 2     | 2     |
| Phase 19 P01 | 3min | 2 tasks | 6 files |
| 19    | 02   | 4min     | 2     | 4     |
| 21    | 01   | 4min     | 2     | 3     |
| Phase 21 P02 | 5min | 3 tasks | 3 files |
| 20    | 01   | 3min     | 2     | 3     |
| 20    | 02   | 5min     | 3     | 6     |
| Phase 22 P01 | 3min | 1 tasks | 1 files |
| Phase 22 P02 | 3min | 2 tasks | 9 files |
| 23    | 01   | 4min     | 2     | 6     |
| 23    | 02   | 3min     | 2     | 3     |
| 23    | 03   | 5min     | 3     | 6     |
| 31    | 01   | 4min     | 2     | 7     |
| 31    | 02   | 4min     | 2     | 5     |
| Phase 27 P01 | 3min | 2 tasks | 5 files |
| Phase 27 P02 | 5min | 3 tasks | 8 files |
| Phase 31 P02 | 4min | 3 tasks | 6 files |
| 30    | 01   | 4min     | 2     | 4     |
| 30    | 02   | 25min    | 3     | 14    |
| 24    | 01   | 5min     | 2     | 9     |
| Phase 32 P01 | 4min | 2 tasks | 3 files |
| Phase 32 P02 | 5min | 2 tasks | 4 files |
| Phase 26 P01 | 5min | 3 tasks | 14 files |
| 34    | 01   | 4min     | 2     | 4     |
| 36    | 01   | 4min     | 2     | 8     |
| 34    | 02   | 3min     | 2     | 2     |
| 35    | 01   | 3min     | 2     | 4     |
| 35    | 02   | 3min     | 3     | 4     |
| Phase 37 P01 | 3min | 2 tasks | 3 files |
| Phase 38 P01 | 12min | 3 tasks | 4 files |
| Phase 39 P02 | 1min | 1 tasks | 1 files |
| Phase 39 P01 | 5min | 2 tasks | 5 files |
| Phase 40 P02 | 3min | 1 tasks | 3 files |
| Phase 40 P01 | 3min | 2 tasks | 2 files |
| Phase 41 P01 | 2min | 2 tasks | 3 files |
| Phase 42 P01 | 3min | 2 tasks | 1 files |
| 49    | 01   | 31min    | 3     | 3     |
| 49    | 02   | 6min     | 3     | 8     |
| 49    | 03   | 12min    | 2     | 9     |
| 49    | 05   | 38min    | 3     | 7     |
| 56    | 01   | 10min    | 2     | 2     |
| 56    | 02   | 6min     | 2     | 3     |
| 56    | 03   | 9min     | 3     | 11    |
| 56    | 04   | 6min     | 2     | 4     |

## Session Continuity

Last session: 2026-05-18T12:00:00.000Z
Stopped at: Phase 56 Plan 04 complete — Phase 56 (Entry Flow Redesign) завершена (де-гейтинг урока + DiagnosticGateBanner → закрываемый хинт + редактирование квалификации в /profile)

### Session 2026-03-12 — Billing Payment Flow Testing & Fixes

**7 commits fixing billing end-to-end:**

1. `82427f4` — CP public key missing from Docker build args → widget silent fail
2. `ea5d6a1` — CP sends form-urlencoded webhooks, not JSON → parse error → "Платёж не может быть принят"
3. `77efd98` — Cancel sent our CUID to CP API (they expect their ID) → cancel locally instead
4. `9fdec81` — CANCELLED subscription hidden in profile → now shows with "Доступ до" date
5. `751da56` — Course name missing in payment history → include course relation
6. `5eaf750` — Unauthenticated user on /pricing gets raw error → friendly message + redirect to /login; table layout fix for long course names

**Verified on prod (platform.mpstats.academy):**

- [x] Widget opens from button click
- [x] Test card 4242...4242 accepted
- [x] 3D Secure test page works
- [x] Check webhook → 200, Pay webhook → 200
- [x] Subscription becomes ACTIVE in profile
- [x] "Ваш план" badge on /pricing
- [x] Payment history with course names
- [x] Cancel subscription → CANCELLED with access-until date
- [x] Re-subscribe after cancel works
- [x] currentPeriodEnd = +30 days (confirmed on screenshot)

**Remaining checks — ALL VERIFIED:**

- [x] /pricing incognito → redirect to /login works
- [x] Verify table layout fix on profile (course name on separate line)

### Session 2026-03-12 (later) — Pricing Page Bugfixes

**2 commits fixing pricing page for unauthenticated users:**

1. `04c38f7` — Course dropdown empty in incognito: `learning.getCourses` was protectedProcedure → added public `billing.getCourses` (id+title only)
2. `21ed7a0` — "Not authenticated" error without redirect: protectedProcedure throws message "Not authenticated" but catch checked for "UNAUTHORIZED" → added case-insensitive check

**Next step:** Phase 20: Paywall + Content Gating — `/gsd:plan-phase 20`
