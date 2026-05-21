# Roadmap: MAAL

## Milestones

- ✅ **v1.0 MVP** — Phases 1-9 (shipped 2026-02-26)
- ✅ **v1.1 Admin & Polish** — Phases 10-15 (shipped 2026-02-28)
- ✅ **v1.2 Auth Rework + Billing** — Phases 16-21 (shipped 2026-03-12)
- 🔄 **v1.3 Pre-release** — Phases 22-36 (in progress)
- 📋 **v1.4 QA Audit Fixes** — Phases 37-42 (planned)
- 📋 **v1.5 Growth & Monetization** — Phases 43+ (planned)
- 🔄 **v1.6 Engagement** — Phases 51-54 (in progress)
- 🔄 **v1.7 RAG Quality** — Phases 55+ (in progress)
- 📋 **v1.8 Launch Readiness** — Phases 56+ (planned)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-9) — SHIPPED 2026-02-26</summary>

- [x] Phase 1: Data Foundation (4/4 plans) — completed 2026-02-17
- [x] Phase 2: AI Question Generation (2/2 plans) — completed 2026-02-25
- [x] Phase 3: Video Integration (2/2 plans) — completed 2026-02-18
- [x] Phase 4: Access Control & Personalization (2/2 plans) — completed 2026-02-25
- [x] Phase 5: Security Hardening (2/2 plans) — completed 2026-02-25
- [x] Phase 5.1: VPS Infrastructure Setup (2/2 plans) — completed 2026-02-24
- [x] Phase 6: Production Deploy (2/2 plans) — completed 2026-02-24
- [x] Phase 7: Lesson & Course Name Cleanup (2/2 plans) — completed 2026-02-26
- [x] Phase 8: Documentation & Traceability Sync (1/1 plan) — completed 2026-02-26
- [x] Phase 9: Integration Wire-Up (1/1 plan) — completed 2026-02-26

Full details: `milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v1.1 Admin & Polish (Phases 10-15) — SHIPPED 2026-02-28</summary>

- [x] Phase 10: Superuser & Admin Panel (3/3 plans) — completed 2026-02-26
- [x] Phase 11: Summary & Sources UX (1/1 plan) — completed 2026-02-27
- [x] Phase 12: Lesson Page Performance (1/1 plan) — completed 2026-02-27
- [x] Phase 13: Watch Progress Tracking (2/2 plans) — completed 2026-02-27
- [x] Phase 14: Tech Debt Cleanup (2/2 plans) — completed 2026-02-27
- [x] Phase 15: Landing Redesign & Theme Toggle (2/2 plans) — completed 2026-02-27

Full details: `milestones/v1.1-ROADMAP.md`

</details>

<details>
<summary>✅ v1.2 Auth Rework + Billing (Phases 16-21) — SHIPPED 2026-03-12</summary>

**Milestone Goal:** Заменить Google OAuth на Яндекс ID, построить систему биллинга через CloudPayments с подписками, реализовать paywall с бесплатным превью контента, мигрировать домен.

- [x] Phase 16: Billing Data Foundation (2/2 plans) — completed 2026-03-10
- [x] Phase 17: Yandex ID Auth (2/2 plans) — completed 2026-03-10
- [x] Phase 18: CloudPayments Webhooks (2/2 plans) — completed 2026-03-10
- [x] Phase 19: Billing UI + Payment Flow (2/2 plans) — completed 2026-03-11
- [x] Phase 20: Paywall + Content Gating (2/2 plans) — completed 2026-03-12
- [x] Phase 21: Domain Migration (2/2 plans) — completed 2026-03-11

Full details: see Phase Details below

</details>

<details>
<summary>🚧 v1.6 Engagement (Phases 51-54) — IN PROGRESS</summary>

- [x] Phase 51: Notification Center Foundation — bell, /notifications, /profile/notifications, COMMENT_REPLY (shipped 2026-04-30)
- [x] Phase 52: Content Triggers — ADMIN_COMMENT_REPLY + CONTENT_UPDATE с группировкой (shipped 2026-04-30, master only, awaiting staging deploy)
- [ ] Phase 53: Retention Engine — единый scheduler с priority-resolver (PROGRESS_NUDGE / INACTIVITY_RETURN / WEEKLY_DIGEST)
- [ ] Phase 54: Marketing Broadcast — админ-форма для массовых уведомлений

Full details: see Phase Details below

</details>

<details>
<summary>📋 v1.7 RAG Quality (Phase 55+) — IN PROGRESS</summary>

- [~] Phase 55: Vision Chunking RAG — ассистент «видит» экран урока (таблицы, ссылки, скриншоты), отвечает на вопросы про визуальный контент
  - [x] Sprint 1 (PoC, shipped 2026-05-06) — gpt-4.1-mini selected, 87.5% accuracy, OCR dropped. PR #1 awaiting merge.
  - [ ] Sprint 2 (Foundation + Pilot, spec+plan ready 2026-05-07) — schema migration source_type/trust_tier + retrieval profiles + 10-lesson 03_ai pilot. Awaiting execution.
  - [ ] Sprint 2C / 3 — full 03_ai (87) или full platform (~440) + UI tooltip + auto-ingest. Зависит от Sprint 2B gate.

</details>

<details>
<summary>📋 v1.8 Launch Readiness (Phase 56+) — PLANNED</summary>

**Milestone Goal:** Доработка платформы до боевого коммерческого запуска — направления из плана CPO (Влад Токарев, «План доработки платформы», май 2026): унификация диагностики, реферальная программа, развилка входа, админка с загрузкой видео, поиск-утилита, комьюнити-блок.

- [x] Phase 56: Entry Flow Redesign — онбординг-визард `/welcome` + развилка диагностика/каталог + снятие жёсткого гейта диагностики

</details>

## Phase Details

### Phase 16: Billing Data Foundation

**Goal**: Платформа имеет модели данных для подписок, платежей и feature flags, готовые к использованию всеми последующими фазами
**Depends on**: Phase 15 (v1.1 complete)
**Requirements**: BILL-06, BILL-04
**Success Criteria** (what must be TRUE):

  1. Prisma-модели Subscription, Payment, PaymentEvent и FeatureFlag существуют в схеме и мигрированы в Supabase
  2. Feature flag `billing_enabled` читается из DB и может быть переключён через admin-панель без деплоя
  3. Поля Course.price и Course.isFree добавлены, seed-данные установлены (billing выключен по умолчанию)
  4. UserProfile.yandexId поле добавлено для будущей привязки Яндекс-аккаунтов

**Plans:** 2/2 plans complete

Plans:

- [x] 16-01-PLAN.md — Prisma billing models, migration, seed script, feature flag helper
- [x] 16-02-PLAN.md — Feature flag admin endpoints + /admin/settings page with toggles

### Phase 17: Yandex ID Auth

**Goal**: Пользователи входят через Яндекс ID вместо Google OAuth, тестовые аккаунты перерегистрируются, архитектура расширяема для будущих провайдеров
**Depends on**: Phase 16 (UserProfile.yandexId field)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04
**Success Criteria** (what must be TRUE):

  1. Пользователь может нажать "Войти через Яндекс" и авторизоваться через Яндекс ID OAuth flow
  2. Существующий Google-аккаунт автоматически связывается с Яндекс-аккаунтом по совпадению verified email -- все данные (диагностики, прогресс, профиль) сохраняются
  3. Кнопка "Войти через Google" убрана из UI, Google OAuth провайдер отключён в Supabase
  4. OAuth-архитектура реализована через абстракцию провайдера, позволяющую добавить новый провайдер (Точка ID) без переписывания core auth
  5. Вход через email/password продолжает работать как fallback

**Plans:** 2/2 plans complete

Plans:

- [x] 17-01-PLAN.md — OAuthProvider abstraction + YandexProvider + Supabase admin client + callback route
- [x] 17-02-PLAN.md — Login/register UI replacement (Google -> Yandex) + Google removal + human verify

### Phase 18: CloudPayments Webhooks

**Goal**: Платформа корректно обрабатывает все события жизненного цикла подписки от CloudPayments
**Depends on**: Phase 16 (Subscription, Payment, PaymentEvent models)
**Requirements**: BILL-02, BILL-03
**Success Criteria** (what must be TRUE):

  1. Webhook endpoint принимает события Check/Pay/Fail/Recurrent/Cancel от CloudPayments с HMAC-SHA256 верификацией
  2. Обработка идемпотентна -- повторный webhook с тем же TransactionId не создаёт дублей и не ломает состояние подписки
  3. Подписка корректно переходит между статусами (active, past_due, cancelled, expired) в ответ на события
  4. Каждый входящий webhook и результат обработки логируется в PaymentEvent для аудита

**Plans:** 2/2 plans complete

Plans:

- [x] 18-01-PLAN.md — HMAC verification + webhook route + idempotent payment processing + audit logging
- [x] 18-02-PLAN.md — Subscription lifecycle service (state machine) + wire into webhook route

### Phase 19: Billing UI + Payment Flow

**Goal**: Пользователь может выбрать тарифный план, оплатить подписку через CloudPayments и управлять ей в профиле
**Depends on**: Phase 18 (working webhooks), Phase 16 (models)
**Requirements**: BILL-01, BILL-05, PAY-02, PAY-04
**Success Criteria** (what must be TRUE):

  1. Страница тарифов отображает доступные планы подписки (per-course и full platform) с ценами из DB
  2. Пользователь может оплатить подписку через CloudPayments widget (iframe) без ввода карточных данных на нашем сайте
  3. В профиле пользователь видит статус подписки, дату следующего списания и может отменить подписку
  4. Два режима подписки работают: Режим A (отдельный курс) и Режим B (вся платформа)

**Plans:** 2/2 plans complete

Plans:

- [x] 19-01-PLAN.md — Prisma PENDING migration, billing tRPC router, CP widget wrapper, cancel API, seed price update
- [x] 19-02-PLAN.md — Pricing page, profile subscription section, sidebar navigation, CP widget integration + human verify

### Phase 20: Paywall + Content Gating

**Goal**: Платный контент заблокирован для пользователей без подписки, бесплатный контент доступен всем
**Depends on**: Phase 19 (billing works end-to-end), Phase 16 (feature flag)
**Requirements**: PAY-01, PAY-03, PAY-05
**Success Criteria** (what must be TRUE):

  1. 1-2 первых урока каждого курса доступны бесплатно, остальные показывают lock UI с CTA "Оформи подписку"
  2. Диагностика навыков остаётся полностью бесплатной для всех пользователей
  3. Централизованный access service в tRPC проверяет подписку -- обойти paywall через прямой URL невозможно
  4. При выключенном billing toggle (feature flag) весь контент доступен без ограничений (для тестирования и демо)

**Plans:** 2/2 plans complete

Plans:

- [x] 20-01-PLAN.md — Access service utility + learning router enrichment with locked flags (completed 2026-03-12)
- [x] 20-02-PLAN.md — Lock UI components, LessonCard lock icon, banners, track preview gating + human verify (completed 2026-03-12)

## Progress

**Execution Order:**
Phases 17 and 18 are independent tracks (auth and billing). Both depend on Phase 16 and can execute in parallel. Phases 19 and 20 are sequential after their dependencies.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Data Foundation | v1.0 | 4/4 | Complete | 2026-02-17 |
| 2. AI Question Generation | v1.0 | 2/2 | Complete | 2026-02-25 |
| 3. Video Integration | v1.0 | 2/2 | Complete | 2026-02-18 |
| 4. Access Control | v1.0 | 2/2 | Complete | 2026-02-25 |
| 5. Security Hardening | v1.0 | 2/2 | Complete | 2026-02-25 |
| 5.1 VPS Infrastructure | v1.0 | 2/2 | Complete | 2026-02-24 |
| 6. Production Deploy | v1.0 | 2/2 | Complete | 2026-02-24 |
| 7. Lesson Name Cleanup | v1.0 | 2/2 | Complete | 2026-02-26 |
| 8. Documentation Sync | v1.0 | 1/1 | Complete | 2026-02-26 |
| 9. Integration Wire-Up | v1.0 | 1/1 | Complete | 2026-02-26 |
| 10. Superuser & Admin Panel | v1.1 | 3/3 | Complete | 2026-02-26 |
| 11. Summary & Sources UX | v1.1 | 1/1 | Complete | 2026-02-27 |
| 12. Lesson Page Performance | v1.1 | 1/1 | Complete | 2026-02-27 |
| 13. Watch Progress Tracking | v1.1 | 2/2 | Complete | 2026-02-27 |
| 14. Tech Debt Cleanup | v1.1 | 2/2 | Complete | 2026-02-27 |
| 15. Landing Redesign & Theme Toggle | v1.1 | 2/2 | Complete | 2026-02-27 |
| 16. Billing Data Foundation | v1.2 | 2/2 | Complete | 2026-03-10 |
| 17. Yandex ID Auth | v1.2 | 2/2 | Complete | 2026-03-10 |
| 18. CloudPayments Webhooks | v1.2 | 2/2 | Complete | 2026-03-10 |
| 19. Billing UI + Payment Flow | v1.2 | 2/2 | Complete | 2026-03-11 |
| 20. Paywall + Content Gating | v1.2 | 2/2 | Complete | 2026-03-12 |
| 21. Domain Migration | v1.2 | 2/2 | Complete | 2026-03-11 |
| 22. Email Notifications | v1.3 | - | Superseded by Phase 33 | - |
| 23. Diagnostic 2.0 | v1.3 | 3/3 | Complete | 2026-03-17 |
| 24. Support Contact | v1.3 | 1/1 | Complete | 2026-03-18 |
| 25. Legal + Cookie Consent | v1.3 | 2/2 | Complete | 2026-03-26 |
| 26. Yandex Metrika | v1.3 | 1/1 | Complete | 2026-03-19 |
| 27. SEO + Custom Error Pages | v1.3 | 2/2 | Complete | 2026-03-18 |
| 28. Боевой CloudPayments | v1.3 | 0/0 | Not Started | - |
| 29. Sentry Monitoring | v1.3 | 0/0 | Not Started | - |
| 30. Content Discovery | v1.3 | 2/2 | Complete | 2026-03-18 |
| 31. Admin Roles | v1.3 | 2/2 | Complete | 2026-03-18 |
| 32. Custom Track Management | v1.3 | 2/2 | Complete | 2026-03-19 |
| 33. CQ Email Automation | v1.3 | 2/3 | Code Complete (CQ dashboard pending) | 2026-03-25 |
| 34. User Profile Enhancement | v1.3 | 2/2 | Complete | 2026-03-26 |
| 35. Lesson Comments | v1.3 | 2/2 | Complete | 2026-03-26 |
| 36. Product Tour / Onboarding | v1.3 | 2/2 | Complete | 2026-03-26 |
| 37. Watch Progress Fix | v1.4 | 1/1 | Complete    | 2026-03-27 |
| 38. Diagnostic UX Fix | v1.4 | 1/1 | Complete    | 2026-03-27 |
| 39. AI & Content Quality | v1.4 | 2/2 | Complete    | 2026-03-27 |
| 40. Navigation & Filters | v1.4 | 2/2 | Complete    | 2026-03-27 |
| 41. Pricing & Logo UX | v1.4 | 1/1 | Complete    | 2026-03-27 |
| 42. Diagnostic Prompt Tuning | v1.4 | 1/1 | Complete    | 2026-03-27 |

### Phase 21: Domain migration from DuckDNS to platform.mpstats.academy

**Goal:** Перевести production-приложение с временного academyal.duckdns.org на постоянный домен platform.mpstats.academy (DNS, SSL, Nginx, env, OAuth, Docker rebuild, верификация)
**Requirements**: DOM-01, DOM-02, DOM-03, DOM-04, DOM-05, DOM-06
**Depends on:** Phase 19 (production app running)
**Plans:** 2/2 plans complete

Plans:

- [x] 21-01-PLAN.md — DNS A-record (human), VPS infrastructure (Nginx + SSL + env + Docker rebuild) (completed 2026-03-11)
- [x] 21-02-PLAN.md — External OAuth services update (Supabase + Yandex), test fixtures, docs, E2E verification (completed 2026-03-11)

### Phase 22: ~~Transactional email notifications~~ — SUPERSEDED by Phase 33

**Status:** Superseded. All email functionality reimplemented in Phase 33 (CQ Email Automation) with updated event names (pa_ prefix), correct data flow (setUserProps → trackEvent), and expanded scope (10 events vs original 9).

### Phase 23: Diagnostic 2.0 — personalized learning track with lesson-level topic tagging, question-to-content tracing, and error-based path prioritization

**Goal:** Пользователь видит прямую связь между ошибками в диагностике и рекомендованными уроками: мульти-категорийная разметка 405 уроков, привязка вопросов к источникам с таймкодами, 4-секционный трек обучения по ошибкам, хинты с таймкодами на страницах уроков, двойной Radar Chart для повторной диагностики
**Requirements**: DIAG-01, DIAG-02, DIAG-03, DIAG-04, DIAG-05, DIAG-06, DIAG-07, DIAG-08, DIAG-09
**Depends on:** Phase 22
**Success Criteria** (what must be TRUE):

  1. Каждый из 405 уроков размечен 1-3 skillCategories, 2-5 топиками и LLM-назначенной сложностью
  2. Диагностические вопросы содержат sourceChunkIds, sourceLessonIds и sourceTimecodes
  3. "Мой трек" отображает 4 секции-аккордеона (Ошибки / Углубление / Развитие / Продвинутый) вместо плоского списка
  4. Страница урока из секции "Ошибки" показывает хинт с кликабельным таймкодом между видео и табами
  5. При повторной диагностике Radar Chart показывает два полигона (было/стало)
  6. Старые плоские треки продолжают работать (backward compatibility)

**Plans:** 3/3 plans complete

Plans:

- [x] 23-01-PLAN.md — Schema migration (multi-category, topics, sourceData) + shared types + LLM tagging script
- [x] 23-02-PLAN.md — Question source tracing + section-based path generation algorithm
- [x] 23-03-PLAN.md — Frontend: accordion track sections + diagnostic hints + dual Radar Chart + human verify (completed 2026-03-17)

### Phase 24: Support Contact — функционал связи со службой поддержки

**Goal:** Пользователь имеет публичную страницу /support с контактной информацией, FAQ аккордеоном и формой обратной связи через CQ, ссылки на поддержку доступны из sidebar, mobile-nav и landing footer
**Requirements**: SUPP-01, SUPP-02, SUPP-03, SUPP-04
**Depends on:** Phase 23
**Success Criteria** (what must be TRUE):

  1. Страница /support публичная (без авторизации) с контактами (email + CQ чат), FAQ (5 вопросов) и формой обратной связи
  2. Форма отправляет CQ event "Support Request" с темой, сообщением и email
  3. Ссылка "Поддержка" видна в sidebar footer, mobile-nav и landing footer

**Plans:** 1/1 plans complete

Plans:

- [ ] 24-01-PLAN.md — Support page (contacts, FAQ, form with CQ event) + navigation links (sidebar, mobile-nav, landing footer)

### Phase 25: Legal + Cookie Consent — оферта, политики, чекбоксы регистрации, баннер кук

**Goal:** 5 legal-страниц на платформе (/legal/offer, /legal/pdn, /legal/adv, /legal/cookies, /policy), 3 чекбокса на форме регистрации (оферта + ПДн обязательные, рекламная рассылка опциональная), cookie consent баннер, ссылки в footer
**Requirements**: LEGAL-01, LEGAL-02, LEGAL-03, LEGAL-04, LEGAL-05
**Depends on:** Phase 24
**Success Criteria** (what must be TRUE):

  1. 5 страниц с legal-контентом доступны по URL: /legal/offer, /legal/pdn, /legal/adv, /legal/cookies, /policy
  2. Оферта содержит заполненные пропуски (URL, 24 часа)
  3. Форма регистрации содержит 3 чекбокса: оферта (обязательный), ПДн (обязательный), рекламная рассылка (опциональный)
  4. Регистрация невозможна без обязательных чекбоксов
  5. Cookie consent баннер при первом визите, выбор сохраняется в localStorage
  6. Footer содержит ссылки на все legal-страницы

**Plans:** 2 plans

Plans:

- [x] 25-01-PLAN.md — Legal pages (offer, pdn, adv, cookies, policy) + LegalPageLayout + footer links (completed 2026-03-26)
- [x] 25-02-PLAN.md — Registration checkboxes (offer + PD required, adv optional) + CookieConsent banner (completed 2026-03-26)

### Phase 26: Яндекс Метрика — интеграция аналитики

**Goal:** Счётчик Яндекс.Метрики (94592073) загружается на всех страницах платформы с SPA-трекингом, 8 типизированных целей с параметрами отслеживают ключевые конверсии (регистрация, логин, диагностика, уроки, оплата, CTA), данные о целях доступны в отчётах Метрики
**Requirements**: YM-01, YM-02, YM-03
**Depends on:** Phase 25
**Success Criteria** (what must be TRUE):

  1. YandexMetrika компонент рендерится в production с webvisor, clickmap, trackLinks, accurateTrackBounce
  2. 8 целей с префиксом `platform_` определены в типизированном модуле и вызываются в 7 страницах
  3. Dockerfile содержит ARG+ENV для NEXT_PUBLIC_YANDEX_ID (build-time inlining)
  4. 8 целей созданы в дашборде Метрики как "JavaScript event"
  5. Счётчик подтверждён в production (mc.yandex.ru запросы в DevTools)

**Plans:** 1/1 plans complete

Plans:

- [x] 26-01-PLAN.md — Analytics module (constants + helper + types), YandexMetrika in layout, goal wiring in 7 pages, Dockerfile/env, dashboard goals (completed 2026-03-19)

### Phase 27: SEO + Custom Error Pages — sitemap, robots.txt, OG-теги, брендированные 404/500

**Goal:** Сайт корректно индексируется поисковиками (sitemap, robots.txt), ссылки красиво отображаются в соцсетях (OG-теги с брендированным изображением), каждая страница имеет уникальный title/description, error-страницы брендированы логотипом MPSTATS Academy
**Requirements**: SEO-01, SEO-02, SEO-03, SEO-04, SEO-05, SEO-06
**Depends on:** Phase 26
**Success Criteria** (what must be TRUE):

  1. sitemap.xml содержит 4 публичные страницы (/, /pricing, /login, /register)
  2. robots.txt блокирует /dashboard, /learn, /diagnostic, /profile, /admin, /api
  3. Root layout имеет OG-теги (og:image, og:locale ru_RU, og:type website) и title template
  4. Каждый route group имеет уникальный title и description через metadata в layout файлах
  5. Error-страницы (404, error, global-error) показывают логотип MPSTATS Academy
  6. 404 страница ведёт на / (не /dashboard)

**Plans:** 2/2 plans complete

Plans:

- [ ] 27-01-PLAN.md — SEO foundation: root metadata with OG tags + title template, sitemap.ts, robots.ts, OG image
- [ ] 27-02-PLAN.md — Error page branding (Logo on 404/500), per-page metadata via layouts, visual verification

### Phase 28: Боевой CloudPayments — переключение с тестовых на production credentials

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 27
**Plans:** 2 plans

Plans:

- [x] 44-01-PLAN.md — DB schema (PromoCode, PromoActivation) + tRPC promo router
- [x] 44-02-PLAN.md — Pricing page (promo input, auth header) + profile promo badge
- [x] 44-03-PLAN.md — Admin promo page + sidebar nav
- [ ] 44-04-PLAN.md — End-to-end verification checkpoint (run /gsd:plan-phase 28 to break down)

### Phase 29: Sentry Monitoring — мониторинг ошибок и performance

**Goal:** Подключить Sentry для мониторинга ошибок (фронтенд + бэкенд) и performance tracking (Web Vitals, API latency). Email алерты при новых issues.

**Design:** `docs/plans/2026-04-07-sentry-monitoring-design.md`

**Scope:**

- SDK: @sentry/nextjs (client + server + edge)
- Error boundary: global-error.tsx для App Router
- Performance: Web Vitals, 30% sample rate
- Custom spans: CP webhooks, email webhook, AI/LLM, cron, promo
- Sentry Crons: check-subscriptions monitoring
- Source maps upload при build
- Email алерты из коробки

**Success Criteria:**

1. Ошибки фронтенда и бэкенда появляются в Sentry dashboard
2. Web Vitals (LCP, FID, CLS) трекаются
3. CP webhook failures видны как отдельные spans
4. LLM вызовы трекаются с latency и model name
5. Email алерты приходят при новых issues

**Plans:** 2 plans

Plans:

- [ ] 29-01-PLAN.md — SDK setup, config files, next.config wrapper, global-error, instrumentation
- [ ] 29-02-PLAN.md — Custom spans (CP webhooks, email webhook, OpenRouter LLM, Sentry Crons)

### Phase 30: Content Discovery — smart search по боли, фильтры по урокам, персональный трек

**Goal:** Пользователь находит нужный контент через семантический поиск по проблеме/боли и расширенную фильтрацию (топики, сложность, длительность, курс, маркетплейс), результаты показывают релевантные фрагменты с таймкодами, уроки из рекомендованного трека маркируются badge "В вашем треке"
**Requirements**: SEARCH-01, SEARCH-02, SEARCH-03, SEARCH-04, SEARCH-05
**Depends on:** Phase 29
**Success Criteria** (what must be TRUE):

  1. Пользователь вводит запрос-боль в поисковую строку на /learn и получает top-10 релевантных уроков с 1-2 фрагментами и таймкодами
  2. 7 фильтров (категория, статус, топики, сложность, длительность, курс, маркетплейс) работают в режимах поиска, курсов и трека
  3. Клик на таймкод фрагмента открывает урок на нужной позиции видео
  4. Уроки из рекомендованного трека показывают badge "В вашем треке" в результатах
  5. Очистка поиска возвращает к обычному режиму курсов/трека

**Plans:** 2/2 plans complete

Plans:

- [x] 30-01-PLAN.md — Backend: searchLessons tRPC endpoint, getCourses extension (topics/skillCategories/skillLevel), splitLink update (completed 2026-03-18)
- [x] 30-02-PLAN.md — Frontend: SearchBar + FilterPanel + SearchResultCard components, /learn page integration, timecode deep-link + human verify (completed 2026-03-18)

### Phase 31: Admin Roles — разделение admin/superadmin, управление доступом команды

**Goal:** Трёхуровневая иерархия ролей (USER / ADMIN / SUPERADMIN) с paywall bypass для админов, защитой привилегий и обновлённым UI админки
**Requirements**: ROLE-01, ROLE-02, ROLE-03, ROLE-04, ROLE-05, ROLE-06, ROLE-07, ROLE-08
**Depends on:** Phase 30
**Success Criteria** (what must be TRUE):

  1. Prisma enum Role { USER ADMIN SUPERADMIN } заменяет boolean isAdmin в UserProfile
  2. adminProcedure разрешает ADMIN и SUPERADMIN, superadminProcedure — только SUPERADMIN
  3. ADMIN и SUPERADMIN обходят paywall через admin_bypass в checkLessonAccess
  4. changeUserRole мутация доступна только SUPERADMIN с запретом само-разжалования
  5. UserTable показывает role dropdown для SUPERADMIN и read-only badge для ADMIN
  6. Sidebar и MobileNav показывают условную ссылку "Админка" для ADMIN/SUPERADMIN

**Plans:** 2/2 plans complete

Plans:

- [x] 31-01-PLAN.md — Schema migration (Role enum), tRPC middleware, access bypass, role management mutations
- [x] 31-02-PLAN.md — Frontend: admin layout, UserTable role UI, sidebar admin link + human verify (completed 2026-03-18)

### Phase 32: Custom Track Management — ручное управление персональным треком (добавить/удалить уроки)

**Goal:** Пользователь может вручную добавлять и удалять уроки из персонального трека обучения: кнопка "+" в "Все курсы", удаление из "Мой трек", секция "Мои уроки" сохраняется при перестройке AI-трека и повторной диагностике
**Requirements**: TRACK-01, TRACK-02, TRACK-03, TRACK-04, TRACK-05, TRACK-06, TRACK-07, TRACK-08, TRACK-09, TRACK-10
**Depends on:** Phase 31
**Success Criteria** (what must be TRUE):

  1. LearningPathSection расширен id 'custom' и полем addedAt для ручных добавлений
  2. Три tRPC мутации (addToTrack, removeFromTrack, rebuildTrack) обрабатывают все edge cases
  3. Кнопка "+" на LessonCard в режиме "Все курсы" переключается на checkmark при добавлении
  4. Кнопка "Убрать" в режиме "Мой трек" удаляет урок из любой секции
  5. Секция "Мои уроки" отображается первой с фиолетовым стилем
  6. "Перестроить трек" перегенерирует AI-секции, сохраняя "Мои уроки"
  7. Завершение диагностики не перезаписывает custom-секцию

**Plans:** 2/2 plans complete

Plans:

- [x] 32-01-PLAN.md — Type extensions (custom section, addedAt) + 3 tRPC mutations + diagnostic integration (completed 2026-03-19)
- [x] 32-02-PLAN.md — Frontend: LessonCard toggle, remove buttons, rebuild dialog, optimistic updates + human verify (completed 2026-03-19)

### Phase 33: CQ Email Automation — 10 событий Carrot Quest + HTML-шаблоны + inactive tracking

**Goal:** Полная интеграция email-автоматизации через Carrot Quest: 10 событий (платежи, аутентификация, реактивация), переименование event names под CQ ТЗ (pa_ префикс), HTML-шаблоны из Stripo, трекинг активности пользователей (lastActiveAt) и cron для inactive уведомлений
**Requirements**: CQ-01 через CQ-10
**Depends on:** Phase 32
**Success Criteria** (what must be TRUE):

  1. 10 CQ событий отправляются с правильными именами (pa_ префикс) и свойствами
  2. Supabase email hook (DOI, password reset) передаёт уникальные ссылки в CQ
  3. pa_registration_completed отправляется при подтверждении email
  4. pa_subscription_expiring отправляется за 3 дня до истечения подписки
  5. lastActiveAt обновляется при каждом входе пользователя
  6. Cron-эндпоинт отправляет pa_inactive_7/14/30 для неактивных пользователей
  7. 10 automation rules настроены в CQ дашборде
  8. HTML-шаблоны из Stripo загружены в CQ

**Plans:** 3 plans (2/3 complete)

- [x] 33-01-PLAN.md — Event rename (pa_ prefix) + lastActiveAt schema + tRPC tracking (completed 2026-03-24)
- [x] 33-02-PLAN.md — New events (registration_completed, subscription_expiring, inactive) + cron endpoints + GitHub Action (completed 2026-03-24)
- [ ] 33-03-PLAN.md — CQ dashboard setup (templates + automation rules) + E2E verification (manual — pending)

### Phase 34: User Profile Enhancement — аватар, display name, завершённость профиля

**Goal:** Пользователь может загрузить аватар и указать отображаемое имя (display name) в профиле. Аватар хранится в Supabase Storage, отображается в UserNav, Sidebar и будущих комментариях. При отсутствии аватара показывается fallback на инициалы. Display name запрашивается при первом входе (profile completeness).
**Requirements**: PROF-01, PROF-02, PROF-03, PROF-04
**Depends on:** Phase 33
**Success Criteria** (what must be TRUE):

  1. Supabase Storage bucket `avatars` создан с RLS-политикой (пользователь может загружать/читать только свои файлы)
  2. Профиль содержит upload-компонент с crop/resize и preview, лимит 2MB, форматы jpg/png/webp
  3. Display name — обязательное поле, запрашивается при первом входе через модал/баннер на дашборде
  4. UserNav и Sidebar показывают аватар пользователя (или инициалы как fallback)
  5. tRPC мутация `updateProfile` обновляет name и avatarUrl атомарно

**Plans:** 2 plans

Plans:

- [x] 34-01-PLAN.md — Backend: Supabase Storage bucket, tRPC avatar endpoints, layout+UserNav refactor to UserProfile (completed 2026-03-26)
- [x] 34-02-PLAN.md — Frontend: avatar upload on profile, completeness banner on dashboard, human verify (completed 2026-03-26)

### Phase 35: Lesson Comments — комментарии к урокам с ответами (1 уровень вложенности)

**Goal:** Под каждым уроком блок комментариев с аватарами и именами пользователей. Поддержка ответов (1 уровень вложенности), кнопка "Ответить", удаление своих комментариев. На десктопе — в правой колонке под AI-чатом, на мобилке — отдельная секция под навигацией.
**Requirements**: COMM-01, COMM-02, COMM-03, COMM-04, COMM-05, COMM-06
**Depends on:** Phase 34 (аватар + display name для идентификации)
**Success Criteria** (what must be TRUE):

  1. Prisma-модель `LessonComment` с self-relation `parentId` для 1-уровневой вложенности
  2. tRPC роутер comments: list (с replies), create, delete (только свои + admin)
  3. Компонент комментария показывает аватар, display name, дату, контент и кнопку "Ответить"
  4. На десктопе комментарии отображаются под AI-чатом в правой колонке (sidebar)
  5. На мобилке комментарии — отдельная секция под навигацией урока
  6. Optimistic updates при отправке и удалении комментариев
  7. Пагинация: первые 20 комментариев, кнопка "Показать ещё"

**Plans:** 2/2 plans complete

Plans:

- [x] 35-01-PLAN.md — Backend: Prisma LessonComment model + tRPC comments router (list/create/delete) (completed 2026-03-26)
- [x] 35-02-PLAN.md — Frontend: Comment components + lesson page integration, mobile tabs (AI-chat + Comments) (completed 2026-03-26)

### Phase 36: Product Tour / Onboarding — 3 tooltip-тура для новых пользователей

**Goal:** Новые пользователи получают пошаговый tooltip-тур при первом посещении ключевых страниц: Dashboard (навигация по sidebar), Обучение (каталог, фильтры, трек), Урок (видео, summary, AI-чат, комментарии). Тур можно пропустить и повторить через кнопку `?` в хедере.
**Requirements**: TOUR-01, TOUR-02, TOUR-03, TOUR-04
**Depends on:** Phase 35 (комментарии нужны для тура урока)
**Success Criteria** (what must be TRUE):

  1. Библиотека driver.js (или аналог) интегрирована, 3 тура определены декларативно (массив шагов)
  2. Dashboard-тур (4-5 шагов): sidebar навигация (Диагностика, Обучение, Дашборд, Профиль)
  3. Learn-тур (5-6 шагов): поиск, фильтры, "Мой трек", секции (ошибки/рекомендации/custom), добавление в трек
  4. Lesson-тур (4-5 шагов): видеоплеер, summary, AI-чат, комментарии, навигация
  5. Каждый тур запускается один раз (localStorage: `tour_{page}_completed`)
  6. Кнопка `?` в хедере/на странице позволяет повторить тур
  7. Кнопка "Пропустить" завершает тур и сохраняет флаг

**Plans:** 2 plans

Plans:

- [x] 36-01-PLAN.md — Tour infrastructure: driver.js, TourProvider, HelpCircle, CSS, definitions
- [ ] 36-02-PLAN.md — data-tour attributes on Dashboard, Learn, Lesson pages + verification

---

## v1.4 QA Audit Fixes (Phases 37-42)

**Milestone Goal:** Исправить баги, найденные QA-командой при аудите платформы. 5 листов: Обучение (Настя/Алена), Диагностика (Мила), Тарифы (Ирина), Профиль (Ирина).

**Источник:** [Google Sheets](https://docs.google.com/spreadsheets/d/1ol0qu3hZyjf9zEH52zYyep4rzonFdGjiPXLd1Q1swlY)
**Полный backlog идей:** `docs/AUDIT-IDEAS-BACKLOG.md`
**Скриншоты:** `screenshots/audit/`

### Phase 37: Watch Progress Fix — прогресс уроков не работает корректно

**Goal:** Просмотр урока до конца корректно отмечает 100% прогресса и статус COMPLETED. Счётчики "Завершено" и "X/Y завершено" согласованы.

**Баги из аудита:**

- R25: Просмотр до конца не засчитывает урок завершённым
- R26: Прогресс 21% при полном просмотре (15:36/15:36)
- R27: Прогресс +1% при каждом нажатии "Следующий"
- R24: "1 завершено" vs "0/71 завершено" — несогласованность счётчиков

**Root Causes:**

1. `KinescopePlayer.tsx:149` — timer fallback использует `position * 1.1` как estimated duration → неверный %
2. `learning.ts:575` — saveWatchProgress считает % из position/duration, но duration может быть неточным
3. `learn/page.tsx` — нет auto-complete на фронте при 90%+
4. `learn/page.tsx:275` vs `learning.ts:318` — счётчики берут данные из разных sources

**Success Criteria:**

1. Duration берётся из БД (Lesson.duration), не из Kinescope events
2. Просмотр 90%+ видео → auto-complete с toast "Урок завершён"
3. Счётчик "Завершено" совпадает с "X/Y завершено" в прогрессе трека
4. "Следующий урок" не инкрементирует прогресс текущего

**Plans:** 1/1 plans complete

Plans:

- [x] 37-01-PLAN.md — Fix timer fallback, auto-complete toast, unified counters

### Phase 38: Diagnostic UX Fix — пользователи не понимают результаты диагностики

**Goal:** Результаты диагностики понятны: зоны развития корректно отображаются, секции трека логичны, badge'и имеют пояснения.

**Баги из аудита:**

- R14: "1 зона развития" но 4 рекомендации ниже
- R11: Badge "Приоритет"/"Низкий" без пояснения
- R13: Mobile — badge'и обрезаны за viewport
- R20: "0/6 ошибок" пустая при раскрытии
- p9_img2 (Мила): "Результаты не найдены" после 15/15 вопросов

**Root Causes:**

1. `results/page.tsx:127` — считает только HIGH priority, отображает все gaps > 0
2. `results/page.tsx:203` — badge без tooltip
3. CSS overflow на mobile
4. `diagnostic.ts:251` — секция "ошибки" пустая если questions без sourceData
5. Баг — session не сохранилась или query пустой

**Success Criteria:**

1. Заголовок показывает все зоны развития (gaps > 0), не только HIGH
2. Каждый badge имеет tooltip с пояснением
3. Mobile: badge'и не обрезаются
4. Пустые секции скрыты или показывают placeholder
5. "Результаты не найдены" воспроизведён и исправлен

**Plans:** 1/1 plans complete

Plans:

- [x] 38-01-PLAN.md — Tooltip component, zones counter fix, badge labels+tooltips, mobile layout, empty sections, error state

### Phase 39: AI & Content Quality — AI коверкает бренды, таймкоды не работают

**Goal:** AI корректно пишет названия брендов, таймкоды в подсказках кликабельны и перематывают видео, дубликаты уроков удалены.

**Баги из аудита:**

- R42: AI пишет "Валберес" вместо "Wildberries"
- R17: Таймкоды с иконкой Play не перематывают видео
- R18: Клик на [1][5][8] в "Основные идеи" скроллит не туда
- R35: Дублирование уроков (VPN уроки 4=6, Оплата 7=10)

**Root Causes:**

1. `generation.ts:62` — system prompt без инструкции сохранять бренды
2. `DiagnosticHint.tsx` — onSeek prop может не быть подключён к плееру
3. `SourceTooltip.tsx:58` — scrollIntoView работает, но seek не происходит
4. Данные в БД — дубликаты из manifest/seed

**Success Criteria:**

1. AI пишет "Wildberries", "Ozon", "MPSTATS" без транслитерации
2. Клик на таймкод → видео перематывается + скролл к плееру
3. Клик на footnote [N] → видео перематывается к нужному моменту
4. Дубликаты уроков удалены из БД

**Plans:** 2/2 plans complete

Plans:

- [x] 39-01-PLAN.md — Brand name fix (prompt+regex) + timecode seek fix (playerRef+highlight) + footnote scroll
- [x] 39-02-PLAN.md — Deduplicate lessons script (dry-run + execute modes)

### Phase 40: Navigation & Filters — фильтры сбрасываются, тур повторяется

**Goal:** Фильтры сохраняются в URL, онбординг-тур не повторяется, email скрыт в комментариях, Яндекс OAuth позволяет сменить аккаунт.

**Баги из аудита:**

- R21: "Назад" из урока сбрасывает фильтр "Маркетинг"
- R46: Онбординг каждые ~15 минут
- R43: Email видно в комментариях вместо имени
- R10: Яндекс OAuth не позволяет сменить аккаунт
- R22: Автовоспроизведение — разное поведение

**Root Causes:**

1. `learn/page.tsx:54` — фильтры в useState, не в URL
2. `TourProvider.tsx:64` — setTimeout re-fires при pathname change
3. `CommentItem.tsx:154` — показывает email если name null
4. OAuth URL без `prompt=login`
5. Kinescope autoplay зависит от browser policy

**Success Criteria:**

1. Фильтры в URL searchParams: `/learn?category=MARKETING`
2. Тур показывается 1 раз (per page), кнопка "?" для повтора
3. В комментариях имя или "Пользователь", не email
4. Яндекс OAuth показывает выбор аккаунта при каждом входе
5. Autoplay поведение консистентно (явно off или on)

**Plans:** 2/2 plans complete

Plans:

- [x] 40-01-PLAN.md — URL-backed filters + tour auto-start guard
- [x] 40-02-PLAN.md — Comment email strip + Yandex prompt=login + autoplay fix

### Phase 41: Pricing & Logo UX — мелкие баги тарифов и навигации

**Goal:** Логотип ведёт в ЛК (не на лендинг), курсы маппятся на категории диагностики, названия курсов корректные.

**Баги из аудита:**

- T-R6: Логотип выкидывает из ЛК
- R15: Курсы на pricing не маппятся на категории диагностики
- T-R5: Названия курсов "не настоящие"
- T-R3: CP виджет — подпись про дату/CVV
- T-R4: Таймер оплаты неконсистентный
- R40: "Мои уроки" — 2 непросмотренных

**Success Criteria:**

1. Logo в (main) layout → `/dashboard`, в auth/landing → `/`
2. Dropdown курсов показывает маппинг на оси диагностики
3. Маркетинговые названия курсов (от команды)
4. Подпись "Дата и CVV — на следующем шаге" под CP виджетом
5. Пустой custom track скрыт

**Plans:** 1/1 plans complete

Plans:

- [x] 41-01-PLAN.md — Logo navigation, axis badges, CP hint, empty custom section

### Phase 42: Diagnostic Prompt Tuning — качество вопросов диагностики

**Goal:** AI генерирует релевантные, профессиональные вопросы с корректными рубриками.

**Источник:** Google Doc от Милы — разбор 15 вопросов диагностики с комментариями.

**Проблемы:**

- Некорректные рубрики (5 из 15 вопросов)
- Нерелевантные вопросы (сертификаты, плагины, биддер)
- Очевидные ответы ("туповатые")
- Нет контекста МП (WB/Ozon)
- Выдуманные термины ("Активные стороны конкурента")

**Success Criteria:**

1. System prompt содержит правила маппинга тем → осей
2. Negative examples: не генерировать вопросы о курсе/инструментах
3. Все варианты ответа правдоподобны
4. Указан МП если вопрос специфичен
5. Тестовая генерация 3 сессий × 15 вопросов — ревью от Милы

n**Plans:** 1/1 plans complete

Plans:

- [x] 42-01-PLAN.md — Update buildSystemPrompt with 6 rule blocks from Mila review

## v1.5 Growth & Monetization (Phases 43+)

**Milestone Goal:** Инструменты роста и монетизации — промо-коды, партнёрские интеграции, аналитика.

### Phase 44: Промо-коды

**Goal:** Админ создаёт промо-коды (PLATFORM/COURSE, N дней, лимит активаций). Пользователь вводит код на /pricing и получает бесплатную подписку. Промо-подписка отображается в профиле.

**Design:** `docs/plans/2026-04-06-promo-codes-design.md`

**Scope:**

- DB: модели PromoCode, PromoActivation, Subscription.promoCodeId
- Backend: tRPC promo роутер (activatePromoCode) + admin процедуры (CRUD промо-кодов)
- Frontend: блок промо-кода на /pricing с auth-хедером, промо-бейдж в профиле
- Admin: вкладка "Промо-коды" (таблица, создание, деактивация, аудит активаций)
- CQ: событие pa_promo_activated
- Тесты: unit + E2E

**Success Criteria:**

1. Админ может создать промо-код с типом PLATFORM/COURSE, длительностью и лимитом
2. Пользователь вводит код на /pricing → получает ACTIVE подписку на N дней
3. Валидация: просроченный, исчерпанный, повторный, конфликт с активной подпиской
4. Промо-подписка корректно отображается в профиле (бейдж "Промо", без кнопки отмены)
5. /pricing показывает auth-хедер (войти / аватар)

**Plans:** 3/4 plans executed

Plans:

- [x] 44-01-PLAN.md — DB schema (PromoCode, PromoActivation) + tRPC promo router
- [x] 44-02-PLAN.md — Pricing page (promo input, auth header) + profile promo badge
- [x] 44-03-PLAN.md — Admin promo page + sidebar nav
- [ ] 44-04-PLAN.md — End-to-end verification checkpoint

### Phase 48: Staging Environment — тестовый стенд для команды на VPS

**Goal:** Команда видит WIP-фичи на `staging.platform.mpstats.academy` до выхода на прод. Прод не трогается при деплое staging. Shared Supabase DB с prod, изоляция через env flags и feature toggles.

**Мотивация:**

- Прод лежит 30-60 сек при `docker compose down && build && up` — страдают клиенты
- Показать команде библиотеку, новые лендинги, AI-фичи до деплоя — негде (локаль только у разработчика)
- Нужна возможность собрать демо-версию (например, Phase 46 Library Section через `SHOW_LIBRARY=true`)

**Архитектура:**

- `docker-compose.staging.yml` — копия prod, другой порт (3001), `.env.staging` с `NEXT_PUBLIC_STAGING=true` и фича-флагами
- Nginx: `staging.platform.mpstats.academy` → `localhost:3001` с basic auth (пароль команде)
- DNS: A-record `staging.platform.mpstats.academy` → 89.208.106.208
- SSL: certbot для нового поддомена
- Shared Supabase DB — тестовые аккаунты с префиксом `staging-*`
- Deploy workflow: ручной `git checkout <branch> && docker compose -f docker-compose.staging.yml up -d --build` (без CI/CD)
- Видимость в UI: жёлтая плашка «STAGING — данные реальные, не заказывайте» в header при `NEXT_PUBLIC_STAGING=true`
- Feature flag pattern: `NEXT_PUBLIC_SHOW_LIBRARY=true` (и похожие) для включения WIP-фич на staging

**Scope:**

- Infra: docker-compose.staging.yml, nginx config для staging поддомена + basic auth, certbot SSL, DNS
- Code: компонент `StagingBanner` в layout при `NEXT_PUBLIC_STAGING=true`; пример feature flag `NEXT_PUBLIC_SHOW_LIBRARY` в LibrarySection с учётом текущей Phase 46 работы
- Docs: раздел «Staging workflow» в `MAAL/CLAUDE.md` + memory entry про staging деплой
- Robots: `noindex` для staging поддомена (в дополнение к basic auth)
- Out of scope: отдельная БД/Supabase проект, zero-downtime deploy для prod, автоматический CI/CD деплой

**Риски:**

- Регистрация на staging создаёт юзера в prod DB — договариваемся про `staging-*@mpstats.academy` префикс
- Env var drift: STAGING-флаг случайно попадает в prod env → решение: жёстко разделённые compose файлы, разные `.env` файлы
- `nginx -t` перед `nginx reload`, чтобы не задеть prod-конфиг
- Фича-флаги не должны менять DB-запись или писать в prod Supabase в отличающемся от prod виде (read-path only для флагов)

**Success Criteria:**

1. `https://staging.platform.mpstats.academy` открывается с basic auth prompt
2. После ввода пароля — копия платформы с жёлтой плашкой «STAGING» в header
3. `NEXT_PUBLIC_SHOW_LIBRARY=true` включает Library section на staging, на prod она скрыта
4. Деплой ветки `staging` (или любой feature-ветки) через `docker-compose.staging.yml` не трогает prod контейнер
5. Prod продолжает работать без регрессов, `platform.mpstats.academy` возвращает 200
6. Staging поддомен имеет валидный SSL и `X-Robots-Tag: noindex`
7. `MAAL/CLAUDE.md` содержит раздел «Staging workflow» с командами деплоя и списком feature flags

**Demo:** Phase 46 Library Section — задеплоить staging ветку с `NEXT_PUBLIC_SHOW_LIBRARY=true`, команда видит UI без трогания prod.

**Plans:** 3/3 plans executed

Plans:

- [x] 48-01-vps-infra-PLAN.md — DNS A-record, htpasswd, nginx vhost (HTTP→SSL), certbot, basic auth + noindex (Wave 1)
- [x] 48-02-code-changes-PLAN.md — Dockerfile ARG/ENV, StagingBanner + unit tests, LibrarySection feature flag, Yandex Metrika guard, docker-compose.staging.yml, CLAUDE.md Staging Workflow, memory entry (Wave 1, parallel with 48-01)
- [x] 48-03-deploy-demo-PLAN.md — .env.staging на VPS, docker build & up, 10 smoke-проверок, Phase 46 Library demo, team signoff, VPS checkout master (Wave 2)

**Status:** Shipped 2026-04-24. Staging работает, Library feature-flag подтверждён визуально командой. 5-layer debug incident — см. `.claude/memory/project_phase48_debug_postmortem.md`.

### Phase 49: Lesson Materials — полезные материалы (презентации, таблицы, чек-листы) к урокам

**Goal:** Дать клиентам доступ к учебным материалам, привязанным к урокам (презентации, таблицы расчётов, чек-листы, памятки, ссылки на доп.сервисы). Дать методологам админку для управления.

**Мотивация:**

- Клиенты спрашивают про материалы, которые упоминаются в видео и были на прошлой LMS
- Методологи отдали Google Sheet с 120 материалами на ~65 уроков (далеко не все 422)
- Без админки методологи зависят от разработки для каждой правки

**Архитектура:**

- Prisma schema: `Material` + `LessonMaterial` (many-to-many), `MaterialType` enum (5 значений: PRESENTATION, CALCULATION_TABLE, EXTERNAL_SERVICE, CHECKLIST, MEMO)
- Гибрид storage: `externalUrl` (Google Drive) или `storagePath` (Supabase Storage bucket `lesson-materials`, private, signed URLs TTL 1ч)
- One-shot ingest: `scripts/ingest-materials.ts` (Sheet → DB с дедупом и fuzzy-match)
- tRPC router `material` (CRUD + attach/detach + signed URLs)
- UI секция «Материалы к уроку» на `/learn/[id]` (карточки с иконками по типу)
- Админка `/admin/content/materials` (список, create/edit, multi-attach, drag-n-drop upload)
- Доступ: гейтинг материалов = гейтинг урока (залоченный урок → секция не рендерится)

**Scope:**

- Schema + миграция, Storage bucket setup, ingest скрипт, tRPC router, расширение `learning.getLesson`, UI секция на странице урока, админка, Yandex Metrika events (`MATERIAL_OPEN`, `MATERIAL_SECTION_VIEW`), cron на orphan-файлы
- Out of scope: RAG-индексация контента материалов (отрезано как overengineering), каталог standalone-материалов в Library, bulk-импорт через CSV в админке, версионность, health-check внешних ссылок, watermark/PDF protection

**Риски:**

- Имена уроков в Sheet ≠ `Lesson.title` в БД — fuzzy match + dry-run отчёт unmatched
- Methodologist загружает 50MB-файл — hard limit 25 MB на frontend + serverside
- External Drive ссылки технически открыты «всем по ссылке» — известный компромисс, контроль через не-отображение залоченным юзерам
- Migration order: schema migration ПЕРЕД rebuild docker (`feedback_schema_migration_order.md`)

**Success Criteria:**

1. 120 материалов из Sheet залиты в БД с корректным mapping к урокам (unmatched < 10, согласованы с методологами)
2. Методолог в админке `/admin/content/materials` создаёт новый материал с загрузкой файла, прикрепляет к нескольким урокам через multi-select
3. Юзер с подпиской на странице урока видит секцию «Материалы к уроку» с карточками, клик открывает signed URL / external URL
4. Залоченный урок (без подписки, order > 2) — секция «Материалы» не рендерится, signed URL запрос возвращает FORBIDDEN
5. Yandex Metrika получает события `MATERIAL_OPEN` и `MATERIAL_SECTION_VIEW`
6. Запись в `/roadmap` (публичный changelog) от первого лица — клиенты узнают о фиче

**Demo:** Методолог создаёт «Шаблон ABC-анализа» (CALCULATION_TABLE, XLSX upload), прикрепляет к 3 урокам. Подписчик открывает один из этих уроков — видит карточку, скачивает шаблон. Без подписки — секция не видна.

**Plans:** 6/6 plans complete

**Status:** Shipped 2026-04-27. На прод — 62 Material + 94 LessonMaterial в курсе «Аналитика для маркетплейсов» (3 spillover-привязки откатили после ingest fuzzy-match). 18 материалов ждут ручной привязки методологом через админку — детали в `.planning/phases/49-lesson-materials/49-03-NOTES.md`.

Plans:

- [x] 49-01-schema-storage-PLAN.md — Prisma schema (Material, LessonMaterial, MaterialType) + Storage bucket lesson-materials + smoke test signed URL
- [x] 49-02-trpc-router-PLAN.md — material tRPC router (9 procedures) + extend learning.getLesson + ACL unit tests
- [x] 49-03-ingest-PLAN.md — scripts/ingest-materials.ts (Sheet → DB dry-run + apply with dedup and fuzzy match)
- [x] 49-04-lesson-ui-PLAN.md — LessonMaterials section on /learn/[id] + MaterialCard + Yandex Metrika events
- [x] 49-05-admin-PLAN.md — /admin/content/materials list + create/edit form + multi-attach + drag-n-drop file upload
- [x] 49-06-polish-deploy-PLAN.md — E2E Playwright tests + cron orphan cleanup + roadmap entry + memory + production deploy

---

## v1.6 Engagement (Phases 51-54)

**Milestone Goal:** Дать юзерам понять что на платформе что-то происходит — система уведомлений (in-app + опциональный email через CQ), которая поддерживает реактивные триггеры (ответы на комменты, апдейты курсов от админа), retention-циклы (возврат к незавершённым урокам, инактив-возвраты, weekly digest), и маркетинговые рассылки. Email-флаги создаём на старте, но включаем только когда CQ-шаблоны готовы.

### Phase 51: Notification Center Foundation — фундамент in-app уведомлений + COMMENT_REPLY

**Goal:** Юзер получает in-app уведомления через bell-иконку в шапке и страницу `/notifications`. Первый живой триггер — ответы на комменты в уроках. Инфраструктура (Notification + NotificationPreference) рассчитана на 7 типов и расширяемая для фаз 52-54.

**Мотивация:**

- Сейчас юзер узнаёт об ответе на свой коммент только если случайно вернётся на урок и проскроллит ветку — никакого сигнала
- Первые юзеры начали активно общаться в комментах, обратной связи нет → отвечающий не знает что его прочли
- Нужен фундамент под фазы 52-54 (контентные триггеры, retention, broadcast) — строим один раз, переиспользуем

**Архитектура:**

- DB: `Notification { userId, type, payload Json, ctaUrl, readAt, createdAt, broadcastId? }` + `NotificationPreference { userId, type, inApp, email }`
- Enum `NotificationType` со всеми 7 значениями (COMMENT_REPLY, ADMIN_COMMENT_REPLY, CONTENT_UPDATE, PROGRESS_NUDGE, INACTIVITY_RETURN, WEEKLY_DIGEST, BROADCAST) — ready для будущих фаз
- Centralized service `services/notifications.ts` с `notify(userId, type, payload)` + `notifyMany()` — единственная точка создания уведомлений
- `notify()` всегда триггерит `pa_notif_<type>` event в CQ через `setUserProps` + `trackEvent` (Phase 33 pattern); email-флаг проверяется CQ-правилом, не нашим кодом
- tRPC router `notifications`: `list`, `unreadCount`, `markRead`, `markAllRead`, `getPreferences`, `updatePreference`
- Frontend: `<NotificationBell />` в Header (badge с unread count, polling каждые 60с), dropdown с 10 последними, `/notifications` page с фильтром «все/непрочитанные» и пагинацией, `/profile/notifications` для toggle preferences per type
- COMMENT_REPLY hook: в `comments.create` если `parentId != null` → `notify(parentAuthorId, COMMENT_REPLY, { commentId, lessonId, lessonTitle, replyAuthorName, preview })`

**Scope:**

- Schema migration (Notification, NotificationPreference, NotificationType enum)
- Service `services/notifications.ts` (notify, notifyMany, markRead helpers)
- tRPC router `notifications` (6 procedures) + Zod schemas
- UI: NotificationBell в Header, страница /notifications, /profile/notifications
- Триггер: COMMENT_REPLY в comments.create (с parentId !== null)
- CQ events: `pa_notif_comment_reply` стреляет всегда; email-доставка отключена на старте через CQ-правило (per-type CQ-команда включит когда готов шаблон)
- Defaults: все email-флаги = `false` на старте; in-app = `true` для всех типов кроме WEEKLY_DIGEST (`false`)
- Anti-self-notify: не уведомляем юзера об ответе на его собственный коммент

**Out of scope (передаётся в 52-54):**

- ADMIN_COMMENT_REPLY trigger — Phase 52 (требует доп. логику для admin role detection и accent-стилизации в UI)
- CONTENT_UPDATE — Phase 52 (галка «уведомить» в админке Lesson/Material publish)
- Retention crons (PROGRESS_NUDGE, INACTIVITY_RETURN, WEEKLY_DIGEST) — Phase 53
- BROADCAST UI и сегментация — Phase 54
- WebSocket / Server-Sent Events — на текущем масштабе polling 60с достаточно
- Push-уведомления браузера / Telegram — не делаем
- CQ email-шаблоны — в зоне ответственности CQ-команды/Милы, параллельно

**Риски:**

- Polling каждые 60с от каждого активного юзера → нагрузка на tRPC. Mitigation: лёгкий unreadCount endpoint (одна COUNT-query по индексу), не загружает список
- Schema migration на проде с rebuild — recurring Phase 28 lesson; миграция ПЕРЕД rebuild docker
- COMMENT_REPLY race — если родительский коммент удалён к моменту триггера, fail silently
- Bell в Header может перекрыть существующие dropdowns на mobile — проверить z-index
- Notification spam при flood комментов — пока нет throttling, в Phase 52 добавим если понадобится

**Success Criteria:**

1. Schema applied: `Notification` и `NotificationPreference` таблицы созданы, indexes на `(userId, readAt, createdAt)` присутствуют
2. Юзер A пишет reply на коммент юзера B → юзер B видит badge «1» в bell-иконке через ≤60с после reply
3. Клик на уведомление → переход на `/learn/[lessonId]` с anchor `#comment-<id>` (скролл к ответу) и `readAt` ставится
4. `/notifications` page показывает список всех уведомлений с пагинацией (20 на страницу), фильтр «все/непрочитанные», mark-all-read
5. `/profile/notifications` показывает таблицу всех 7 типов с toggle in-app/email; смена тоггла сохраняет в БД
6. Юзер не получает уведомление если отвечает сам себе (`commentAuthorId === parentAuthorId`)
7. Юзер не получает уведомление если в `NotificationPreference.inApp = false` для COMMENT_REPLY
8. CQ event `pa_notif_comment_reply` стреляет на каждый reply с props `{ pa_lesson_title, pa_reply_author, pa_preview }` — проверено в CQ dashboard
9. Email НЕ отправляется (CQ-правило для `pa_notif_*` ещё не настроено — это намеренно)
10. Unit tests на `services/notifications.ts` (notify, notifyMany, anti-self), tRPC router (preferences toggle, list pagination, markRead permission)
11. E2E Playwright: юзер A reply → юзер B видит badge → клик → markRead → badge исчезает

**Demo:** Тестер 1 пишет коммент на уроке. Тестер 2 (другой акк) отвечает на коммент. Тестер 1 в течение 60с видит badge «1» в шапке, кликает → dropdown показывает «Тестер 2 ответил на ваш коммент в "Анализ ниши"» → клик → переход на урок с подсветкой ответа.

**Plans:** 7 plans

Plans:

- [ ] 51-01-PLAN.md — Schema (Notification + NotificationPreference + enum + UserProfile.lastNotificationsSeenAt) + shared types + CQEventName + db:push
- [ ] 51-02-PLAN.md — notify() service (apps/web/src/lib/notifications/notify.ts) + notifyMany + notifyCommentReply + Vitest tests
- [ ] 51-03-PLAN.md — tRPC notifications router (7 procedures) + appRouter registration + permission tests
- [ ] 51-04-PLAN.md — COMMENT_REPLY trigger via /api/notifications/notify-reply route handler + CommentInput onSuccess hook
- [ ] 51-05-PLAN.md — NotificationBell в Header + NotificationItem + /notifications page (infinite list)
- [ ] 51-06-PLAN.md — /profile/notifications preferences + /profile link + CommentItem anchor + /learn/[id] highlight + globals.css
- [ ] 51-07-PLAN.md — /api/cron/notifications-cleanup + GitHub Actions workflow + Playwright E2E + manual smoke gate

### Phase 52: Content Triggers — ADMIN_COMMENT_REPLY + CONTENT_UPDATE с группировкой

**Goal:** Расширить Notification Center контентными триггерами: ответы методологов на комменты пользователей (выше приоритет визуально) и опциональные уведомления о новом контенте (lessons/materials) с авто-группировкой при массовой публикации.

**Мотивация:**

- Когда методолог отвечает на коммент — это сильный сигнал, юзер должен заметить (отдельный visual treatment)
- При публикации skill-батча 16 уроков за раз авто-уведомления = спам ленты на годы вперёд
- Решение: ручная галка «Уведомить подписчиков курса» при публикации + автогруппировка 3+ уроков в 24h в одно уведомление
- Скорее всего будут материалы которые мы тоже захотим анонсировать вручную через тот же механизм

**Архитектура:**

- ADMIN_COMMENT_REPLY триггер в `comments.create` если автор имеет `role IN (ADMIN, SUPERADMIN)` И отвечает не другому админу
- Visual: accent-цвет в UI (синий), иконка 🎓 (методолог), сортировка выше обычных reply в dropdown
- CONTENT_UPDATE: checkbox «Уведомить подписчиков курса» в админке `Lesson` (publish action) и `LessonMaterial` (attach action)
- Targeting: уведомление получают юзеры с активной подпиской на курс **И** прогрессом ≥1 завершённый урок в этом курсе (без прогресса не пушим — холодные)
- Группировка: если за последние 24h уже было CONTENT_UPDATE по тому же курсу для того же юзера и оно не прочитано — апдейтим payload (накопительный счётчик «X новых уроков») вместо создания новой записи. Если прочитано — создаём новую
- Никаких автоматических CONTENT_UPDATE — только когда админ явно кликнул чекбокс

**Scope:**

- Триггер ADMIN_COMMENT_REPLY (отдельный от COMMENT_REPLY tip)
- Чекбоксы в админке Lesson publish и Material attach
- Bulk targeting service (выбрать получателей по subscription + progress)
- Группировка CONTENT_UPDATE логика
- UI accent-styling для ADMIN_COMMENT_REPLY в bell dropdown и /notifications
- Yandex Metrika events на клик по уведомлениям

**Out of scope:**

- Email-дубли для CONTENT_UPDATE (in-app достаточно — email спам)
- Уведомление юзеров без прогресса в курсе (cold targeting)
- Автоматические уведомления при публикации без галки админа

**Success Criteria:**

1. Методолог отвечает на коммент юзера → юзер видит accent-уведомление с иконкой 🎓
2. Админ публикует урок с галкой → юзеры с прогрессом в курсе получают CONTENT_UPDATE через ≤2 минут
3. Админ публикует 5 уроков за час с галкой → юзер видит **одно** уведомление «Добавлено 5 новых уроков в "Аналитика"»
4. Юзер БЕЗ прогресса в курсе не получает CONTENT_UPDATE
5. Если юзер прочитал CONTENT_UPDATE — следующий накопительно создаст новое (не апдейтит прочитанное)

**Plans:** TBD

### Phase 53: Retention Engine — единый scheduler с priority-resolver

**Goal:** Возвращать юзеров на платформу через retention-уведомления. Один cron, который для каждого юзера выбирает наиболее релевантный тип (PROGRESS_NUDGE / INACTIVITY_RETURN / WEEKLY_DIGEST). Архитектура заранее готова к будущему TASK_OVERDUE.

**Мотивация:**

- In-app уведомления не работают для тех кого нет на платформе → нужен внешний канал (email через CQ)
- Прогноз: будущий Task Tracker должен вытеснять PROGRESS_NUDGE если есть просроченные задачи
- Решение: один scheduler с приоритетами вместо N независимых cron'ов

**Архитектура:**

- Cron `/api/cron/retention-engine` (раз в сутки 09:00 МСК), Sentry checkin slug `retention-engine`
- Priority registry в `services/retention/index.ts`: `[ { type, priority, applies(user), buildPayload(user) } ]`
- Scheduler iterate users → для каждого проходит candidates по убыванию priority → первый кто проходит `applies()` И не нарушает hard-cap → `notify()` → break
- Hard-cap: 1 retention email на юзера в 7 дней (через таблицу `NotificationDelivery { userId, type, channel, sentAt }` или поле в существующей)
- Predicates изолированы в `services/retention/predicates.ts`
- PROGRESS_NUDGE: 72h простоя на начатом-незавершённом уроке, отправка вт/чт 10:00, дружелюбный тон, конкретный урок, one-click pause-30d ссылка в email
- INACTIVITY_RETURN: 14 дней без визита + active subscription, max 1/14d
- WEEKLY_DIGEST: пятница 10:00, opt-in (default `email = false`), список новых уроков + ответов в моих ветках за неделю
- Hard preference в `/profile/notifications`: toggle «Напоминания о возврате» — выключает класс целиком (не per-type)
- Soft anti-spam: 2 nudge'а подряд без открытия → auto-pause на 30 дней
- Все три типа = email-обязательны для эффекта; in-app тоже создаём как fallback на случай если юзер всё-таки зашёл

**Scope:**

- Cron retention-engine + Sentry monitoring
- Priority registry + predicates
- 3 типа: PROGRESS_NUDGE, INACTIVITY_RETURN, WEEKLY_DIGEST
- NotificationDelivery (или extension) для hard-cap
- Pause-30d flow (token-link → API → DB update)
- CQ events: `pa_notif_progress_nudge`, `pa_notif_inactivity_return`, `pa_notif_weekly_digest`
- /profile/notifications: блок «Уведомления о возврате» с master-toggle

**Out of scope:**

- TASK_OVERDUE — будущий Task Tracker (но архитектура готова принять без рефакторинга)
- Real-time retention (websocket-based)
- Per-course preferences

**Success Criteria:**

1. Юзер начал урок 72ч назад без `completedAt` → во вторник/четверг 10:00 МСК получает PROGRESS_NUDGE (in-app + CQ event)
2. Юзер не заходил 14 дней с активной подпиской → получает INACTIVITY_RETURN
3. Юзер с обоими условиями выше получает только PROGRESS_NUDGE (приоритет 50 > 30)
4. Hard-cap: юзер получивший retention в среду НЕ получает в четверг даже если applies другой тип
5. Pause-link в email → клик → API ставит `pausedUntil = now + 30d` → следующие 30 дней retention skip
6. Юзер с master-toggle off в profile НЕ получает retention-уведомления вообще
7. Sentry получает успешные checkins от cron каждый день
8. WEEKLY_DIGEST в пятницу для opt-in юзеров: список новых уроков + reply в моих ветках за неделю

**Plans:** TBD

### Phase 54: Marketing Broadcast — админ-форма для массовых уведомлений

**Goal:** Админ может отправить in-app уведомление сегменту юзеров (опционально с email-копией) с метриками доставки/прочтения/клика.

**Мотивация:**

- Запуск нового курса, промо-кампании, вебинары — нужен канал чтобы достучаться до своих платящих
- Существующая инфраструктура (Notification Center) даёт это почти бесплатно — нужна только админка
- Альтернатива (только CQ broadcast email) — не показывает уведомление в UI платформы, юзер не возвращается

**Архитектура:**

- `/admin/notifications/broadcast` — форма: title, body, ctaLabel, ctaUrl, expiresAt, audience selector, optional email toggle
- Audience сегменты (готовые, не дин. конструктор):
  - Все юзеры
  - Активная подписка
  - Триал / истёкшая подписка
  - По курсу (мульти-выбор)
  - Без активности 14+ дней
- Preview перед отправкой: «Это получит ~N юзеров»
- Async dispatch: Worker queries audience → bulk insert в Notification (с `broadcastId`) → если `email = true`, отправляем `pa_notif_broadcast` с per-user props
- BROADCAST в UI визуально отличается: **баннер сверху** notification feed (не строка) с кнопкой dismiss
- Метрики: `Broadcast { id, title, sentTo, openedCount, clickedCount, sentAt, ... }`, открытие = `readAt`, клик = трекаем по `ctaUrl` + `?b=<broadcastId>`
- expiresAt: после даты автоматически hidden из feed (но история живёт)

**Scope:**

- DB: Broadcast model + `Notification.broadcastId` FK
- Audience selector в админке (5 сегментов готовых)
- Worker для async dispatch (batch insert по 1000)
- UI: BroadcastBanner на /notifications + dismissible
- Метрики UI: `/admin/notifications/broadcast/[id]/stats`
- CTA tracking через redirect API `/r/<broadcastId>?to=<encodedUrl>`

**Out of scope:**

- Динамический конструктор сегментов (фильтры по полям) — пока 5 готовых хватит
- A/B варианты broadcast'а
- Schedule send time (только «отправить сейчас»)
- Recurring broadcasts

**Success Criteria:**

1. Админ заполняет форму, выбирает «Активная подписка» → preview показывает корректное количество юзеров
2. После send все юзеры в сегменте видят BROADCAST (баннер сверху feed) в течение 5 минут
3. Email-копия (если `email = true`) уходит через CQ event `pa_notif_broadcast` per-user
4. `/admin/notifications/broadcast/[id]/stats` показывает: sentTo, openedCount, clickedCount, openRate%, clickRate%
5. CTA-клик из in-app или email → редирект через `/r/<id>` → инкремент `clickedCount`
6. expiresAt прошёл → BROADCAST hidden из feed (но в /admin сохраняется для истории)
7. Dismiss-кнопка → юзер больше не видит конкретный broadcast (`dismissedAt` на Notification)

**Plans:** TBD

---

## v1.7 RAG Quality (Phases 55+)

### Phase 55: Vision Chunking RAG — ассистент «видит» экран урока

**Goal:** Юзер задаёт вопрос ассистенту про то, что показано в видео — таблицы, ссылки, интерфейсы, формулы, скриншоты — и получает корректный ответ с тайм-кодом и превью кадра.

**Мотивация (от тестера Милы, 2026-05-05):**

- Текущий RAG ищет только по аудио-транскриптам через `content_chunk`. Если спикер молча тыкает в ячейку D6 или показывает сайт без озвучки URL — этого нет в индексе.
- Тестеры спрашивают «дай мне текст из ячейки D6», «какая ссылка на сайте», «что за инструмент показан» — ассистент молчит. Это снижает воспринимаемое качество продукта (по мнению тестера — главная боль).
- Доп. материалы (Phase 49) часть закрывают, но не всё на экране будет в материалах. Vision-индекс закрывает 80% паттерна «спрашиваю про то, что вижу прямо сейчас».
- Дисклеймер в чате (добавлен 2026-05-05) — это honest expectation, временный пластырь до запуска этой фазы.

**Архитектура:**

1. Frame extraction: ffmpeg scene-detection (`select='gt(scene,0.3)'`) на каждом видео → ~30-60 кадров на 30-мин урок (вместо 1800 при fixed interval) → upload в Supabase Storage bucket `lesson-frames` (private)
2. Vision pass: GPT-4o-mini / Gemini Flash / Claude Haiku VL (выбор по итогам PoC) с промптом «опиши кадр + extract URL/числа/имена; не выдумывай конкретных значений если не уверен»
3. OCR pass (tesseract local, бесплатно) на тех же кадрах → точный текст с экрана как complement к VLM (числа, URL, код)
4. Объединение: `[FRAME @ MM:SS] описание VLM. Текст с экрана: <OCR>` → embedding (text-embedding-3-small, как сейчас) → `content_chunk` с `source_type='frame'` + `frame_url` + `timecode`
5. Retrieval update: `searchChunks` возвращает mix (5 transcript + 3 frame), context builder в `generation.ts` форматирует кадры явно с тайм-кодом
6. UI: при клике на источник-кадр в чате → seek видео на тайм-код + превью кадра в `SourceTooltip`
7. Pipeline integrated: новый урок при ingest проходит через vision-pass автоматически

**Scope:**

- DB: миграция `content_chunk` — добавить `source_type` enum (`'transcript' | 'frame'`), `frame_url String?`, `metadata Json?`
- Скрипт `scripts/extract-frames.ts` (ffmpeg subprocess + Storage upload)
- Скрипт `scripts/vision-index.ts` (VLM + OCR + embedding + insert)
- Обновление `packages/ai/src/retrieval.ts` (mixed search, optional `source_type` filter)
- Обновление `packages/ai/src/generation.ts` (context builder для кадров)
- UI обновление `SourceTooltip` (превью кадра)
- Документация в `E:/Academy Courses/CLAUDE.md` секция «End-to-End Pipeline» — добавить vision-step
- Pilot прогон на одном курсе (AI-инструменты, 87 уроков) с контрольным датасетом 20 «визуальных» вопросов от Милы/Кати

**Out of scope (для v1):**

- Multi-modal embedding (CLIP-style без extraction) — оставляем на v2 если recall окажется низким
- Видео-понимание целиком (Gemini 2.5 video input) — слишком дорого и не кэшируется per-question
- Переиндексация при изменении видео (assume immutable после публикации)
- Hybrid search (BM25 + vector) — добавим в Sprint 2 если понадобится по итогам Pilot

**Success Criteria:**

1. PoC: на 1 уроке VLM описание кадров не галлюцинирует таблицы (контроль на 10 кадрах вручную)
2. Pilot: ассистент отвечает корректно на ≥70% контрольных «визуальных» вопросов от Милы (датасет ~20 вопросов на курсе AI-инструменты)
3. Цитирование работает: при клике на frame-источник видео скакнуло на нужный тайм-код, миниатюра кадра видна в tooltip
4. Production: все ~440 уроков проиндексированы, новый урок при ingest автоматически проходит vision-pass без ручных шагов
5. Стоимость: <$10 на единоразовый прогон всей платформы, <$0.05 на каждый новый урок
6. Дисклеймер в чате обновлён (убрать «не могу про то, что показано на экране», заменить на «могу ответить и про экран»)

**Sprints (gates между ними):**

- **Sprint 1 (1-2 дня): PoC.** 3 VLM на 1 уроке, замер качества + цены. Решение: какая модель и идём ли дальше.
- **Sprint 2 (2 дня): Pilot.** Полный pipeline на курсе AI-инструменты (87 уроков). Контрольные вопросы от Милы. Решение: качество достаточно или переосмысление.
- **Sprint 3 (1 день): Production.** Прогон на всех уроках + интеграция в ingest pipeline + UI updates + документация.

**Открытые вопросы (резолвить перед стартом):**

- Где исходники видео для extraction — Kinescope download или локальная копия `E:/Academy Courses`?
- Какой VLM API использовать — общий OpenRouter аккаунт или отдельный?
- Кто составляет контрольный датасет «визуальных» вопросов — Мила, Катя, обе?
- Privacy: VLM-промпт должен пропускать персональные данные продавцов в скриншотах кабинета (артикулы/email/имена)

**Зависимости:** нет блокеров. Может стартовать в любой момент после согласования бюджета и приоритета.

**Plans:** TBD (создаются после PoC по итогам выбора VLM)

## v1.8 Launch Readiness (Phase 56+)

### Phase 56: Entry Flow Redesign — развилка входа на платформу

**Goal:** Новый пользователь получает комфортный вход — мягкий онбординг-визард с равноценным выбором пути (диагностика или каталог уроков) вместо обязательной диагностики. Уроки доступны в рамках подписки без прохождения диагностики.

**Source:** План CPO (Влад Токарев), НАПРАВЛЕНИЕ 03 + ПРОТОТИП 03. Дизайн-спек: `docs/superpowers/specs/2026-05-18-entry-flow-redesign-design.md`.

**Мотивация:**

- Жёсткий гейт диагностики на странице урока (`learn/[id]/page.tsx:641-645`) — без пройденной диагностики весь контент урока подменяется блокирующим баннером. Опытный селлер упирается в стену, новичок получает нерелевантный план — оба теряются на activation.
- Платформа не собирает квалификацию (маркетплейс / опыт / цели) — нет основы для персонализации.

**Scope:**

- Новый роут `/welcome` — онбординг-визард: намерение+цели → маркетплейсы → опыт → развилка (standalone-роут, полноэкранный layout вне `(main)`)
- 5 новых полей `UserProfile`: `onboardingCompletedAt`, `marketplaces[]`, `experienceLevel`, `goals[]`, `goalText` + schema migration
- tRPC-роутер `onboarding` (`getState`, `complete`)
- Гард в server-layout `(main)`: редирект на `/welcome` при `onboardingCompletedAt == null` (ловит и текущих ~200 пользователей)
- Снятие жёсткого гейта диагностики в `learn/[id]/page.tsx`; `DiagnosticGateBanner` → ненавязчивый закрываемый хинт
- Редактирование квалификации в `/profile`

**Out of scope:** редизайн библиотеки/плейбуков; AI-ответ на экране 1 (v3, отложено до стабилизации поиска); счётчики дашборда (НАПРАВЛЕНИЕ 06); диагностика как лид-магнит; подписочный гейт `lesson.locked`/`LockOverlay` не затрагивается.

**Success Criteria** (what must be TRUE):

  1. Новый пользователь после регистрации попадает в `/welcome`-визард (3 шага + развилка), не сразу на `/dashboard`
  2. Квалификация (маркетплейсы / опыт / цели / свободный текст) сохраняется в `UserProfile` через `onboarding.complete`
  3. С развилки пользователь уходит в `/diagnostic` или `/learn` — обе карточки равноценны
  4. Без пройденной диагностики пользователь смотрит все уроки в рамках своей подписки; жёсткий гейт снят, подписочный `LockOverlay` сохранён
  5. Визард показывается один раз; повторные входы → `/dashboard`. Текущие ~200 пользователей видят визард один раз при следующем входе
  6. Квалификацию можно отредактировать в `/profile`

**Handoff:** собранные `marketplaces` + `goals` — вход для будущего направления «Унификация диагностики» (НАПРАВЛЕНИЕ 01).

**Зависимости:** нет блокеров.

**Plans:** 2/4 plans executed

Plans:
**Wave 1**

- [x] 56-01-PLAN.md — Schema +5 полей UserProfile + [BLOCKING] additive-миграция на prod

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 56-02-PLAN.md — tRPC-роутер onboarding (getState + complete) + unit-тесты

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 56-03-PLAN.md — /welcome route + fullscreen layout + визард (3 шага + развилка) + гард (main)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 56-04-PLAN.md — Де-гейтинг урока + DiagnosticGateBanner в хинт + редактирование квалификации в /profile
