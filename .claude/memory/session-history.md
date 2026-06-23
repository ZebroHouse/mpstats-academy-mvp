---
name: MAAL Session History
description: Detailed session notes for all MAAL development sessions (phases 1-53)
type: project
---

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
