---
phase: 56-entry-flow-redesign
verified: 2026-05-18T12:00:00Z
status: gaps_found
score: 5/6
overrides_applied: 0
gaps:
  - truth: "Новый пользователь после регистрации попадает в /welcome-визард (3 шага + развилка), не сразу на /dashboard"
    status: partial
    reason: "Гард в (main)/layout.tsx срабатывает только когда profile != null. Первый Yandex OAuth вход может иметь profile === null (UserProfile создаётся лениво в ensureUserProfile), и тогда условие `if (profile && ...)` молча пропускает redirect. Email-DOI пользователи покрыты лучше, но layout не должен зависеть от порядка вызовов."
    artifacts:
      - path: "apps/web/src/app/(main)/layout.tsx"
        issue: "Строка 60: `if (profile && profile.onboardingCompletedAt === null)` — при profile === null guard не срабатывает, пользователь попадает на (main)-роут минуя визард"
    missing:
      - "Изменить условие на `if (!profile || profile.onboardingCompletedAt === null) { redirect('/welcome'); }` чтобы отсутствующий профиль трактовался как не прошедший онбординг"
human_verification:
  - test: "Открыть платформу с новым Yandex OAuth аккаунтом (никогда не авторизовывался). Сразу перейти на /learn или /dashboard."
    expected: "Должен произойти редирект на /welcome. С текущим кодом этого НЕ произойдёт, если UserProfile не был ещё создан."
    why_human: "Requires real Yandex OAuth flow and fresh account without prior tRPC calls."
  - test: "Прогнать E2E-спеку `phase-56-entry-flow.spec.ts` в окружении с рабочими test-credentials (CI/staging с `TEST_NEW_USER_EMAIL` + `TEST_NEW_USER_PASSWORD`)"
    expected: "Все 3 сценария проходят: новый юзер → /welcome → /learn; новый юзер → /welcome → /diagnostic; повторный вход не показывает визард"
    why_human: "E2E требует живого Supabase test-пользователя — sandbox auth недоступен (pre-existing issue, подтверждён в deferred-items.md)"
---

# Фаза 56: Entry Flow Redesign — Отчёт верификации

**Цель фазы:** Новый пользователь получает комфортный вход — мягкий онбординг-визард `/welcome` с равноценным выбором пути (диагностика или каталог уроков) вместо обязательной диагностики. Уроки доступны в рамках подписки без прохождения диагностики.
**Верифицировано:** 2026-05-18T12:00:00Z
**Статус:** gaps_found
**Ревёрификация:** Нет — начальная верификация

## Достижение цели

### Наблюдаемые истины (Observable Truths)

| # | Истина | Статус | Свидетельство |
|---|--------|--------|---------------|
| 1 | Новый пользователь после регистрации попадает в /welcome-визард (3 шага + развилка), не сразу на /dashboard | ⚠️ ЧАСТИЧНО | Гард существует в (main)/layout.tsx:60, но только срабатывает когда `profile != null`. Первый Yandex OAuth вход с `profile === null` гард обходит. |
| 2 | Квалификация (marketplaces / experience / goals / goalText) сохраняется в UserProfile через onboarding.complete | ✓ VERIFIED | `onboarding.ts`: мутация `complete` записывает все 4 поля + `onboardingCompletedAt: new Date()` в `where: { id: ctx.user.id }`. 4 unit-теста подтверждают персистентность, whitelist-отклонение, `null` experienceLevel. |
| 3 | С развилки пользователь уходит в /diagnostic или /learn — обе карточки равноценны | ✓ VERIFIED | `ForkScreen.tsx`: две карты `grid sm:grid-cols-2`, обе вызывают `onChoose()`, router.push строго в `onSuccess`. Badge-стиль: синий `variant="primary"` + зелёный `variant="success"` — визуально разные, но структурно равноценны. |
| 4 | Без пройденной диагностики пользователь смотрит все уроки в рамках подписки; жёсткий гейт снят, подписочный LockOverlay сохранён | ✓ VERIFIED | `learn/[id]/page.tsx:641-648`: `{lesson.locked ? <LockOverlay/> : <div>...}`. Внутри — `{hasDiagnostic === false && <DiagnosticGateBanner />}` над плеером (хинт, не блокировка). Блокирующая ветка `hasDiagnostic === false ? <DiagnosticGateBanner/>` удалена. |
| 5 | Визард показывается один раз; повторные входы → /dashboard. Текущие ~200 пользователей видят визард один раз при следующем входе | ✓ VERIFIED | Гард (main)/layout.tsx:60 читает `onboardingCompletedAt`. После прохождения `complete` ставит timestamp, дальнейшие входы проходят гард. Пользователи с `onboardingCompletedAt = null` (все после миграции) увидят визард однократно. Логика корректна для пользователей с существующим `profile` — см. Gap. |
| 6 | Квалификацию можно отредактировать в /profile | ✓ VERIFIED | `QualificationSection.tsx` (230 строк): загружает через `trpc.onboarding.getState.useQuery()`, рендерит все 4 поля, кнопка «Сохранить» вызывает `onboarding.complete` с `toast.success`/`toast.error`, инвалидирует `getState`. Импортирована и рендерится в `profile/page.tsx:501`. |

**Счёт: 5/6 истин верифицировано**

### Обязательные артефакты

| Артефакт | Ожидается | Статус | Детали |
|----------|-----------|--------|--------|
| `packages/db/prisma/schema.prisma` | 5 новых полей на UserProfile | ✓ VERIFIED | Строки 35-39: `onboardingCompletedAt DateTime?`, `marketplaces String[] @default([])`, `experienceLevel String?`, `goals String[] @default([])`, `goalText String?` |
| `packages/db/prisma/migrations/20260518000000_add_onboarding_fields/migration.sql` | Additive ALTER TABLE x5 | ✓ VERIFIED | 5 операторов ADD COLUMN, без DROP, nullable/DEFAULT. 170 пользователей целы (из SUMMARY). |
| `packages/api/src/routers/onboarding.ts` | tRPC router getState + complete | ✓ VERIFIED | 59 строк, `protectedProcedure` на обеих процедурах, z.enum whitelist, `where: { id: ctx.user.id }` |
| `packages/api/src/routers/__tests__/onboarding.test.ts` | Unit-тесты | ✓ VERIFIED | 4 теста: персистентность + Date-stamp, whitelist-rejection, null experienceLevel, getState возврат |
| `packages/api/src/root.ts` | Регистрация onboarding router | ✓ VERIFIED | Строка 13: `import { onboardingRouter }`, строка 27: `onboarding: onboardingRouter` |
| `apps/web/src/app/welcome/layout.tsx` | Fullscreen layout + auth-guard | ✓ VERIFIED | `getUser()` → `redirect('/login')`, fullscreen div, без импортов Sidebar/MobileNav/UserNav |
| `apps/web/src/app/welcome/page.tsx` | Клиентский useState-степпер | ✓ VERIFIED | `'use client'`, `useState<Step>(1)`, маппинг step → компонент, `complete.mutate` в `finish()`, `router.push` строго в `onSuccess` |
| `apps/web/src/components/welcome/WizardStepper.tsx` | 3-сегментный прогресс | ✓ VERIFIED | Файл существует |
| `apps/web/src/components/welcome/StepIntent.tsx` | Шаг 1: Цели | ✓ VERIFIED | Файл существует |
| `apps/web/src/components/welcome/StepMarketplaces.tsx` | Шаг 2: Маркетплейсы | ✓ VERIFIED | Файл существует |
| `apps/web/src/components/welcome/StepExperience.tsx` | Шаг 3: Опыт | ✓ VERIFIED | Файл существует |
| `apps/web/src/components/welcome/ForkScreen.tsx` | Развилка — 2 равные карты | ✓ VERIFIED | `grid sm:grid-cols-2`, обе с `mt-auto` CTA, loading-state `isSaving` |
| `apps/web/src/components/welcome/options.ts` | GOAL/MARKETPLACE/EXPERIENCE_OPTIONS | ✓ VERIFIED | Импортируется в welcome/page.tsx и QualificationSection.tsx |
| `apps/web/src/app/(main)/layout.tsx` | Гард redirect('/welcome') | ⚠️ PARTIAL | `onboardingCompletedAt` добавлен в select:55, redirect существует на строке 61, НО условие `if (profile && ...)` пропускает profile === null |
| `apps/web/src/middleware.ts` | /welcome в protectedRoutes | ✓ VERIFIED | Строка 10: `/welcome` присутствует в массиве |
| `apps/web/src/components/learning/DiagnosticGateBanner.tsx` | Закрываемый хинт | ✓ VERIFIED | `Card border-l-4 border-mp-blue-500`, `localStorage diagnosticHintDismissed`, `dismissed` инициализируется `true`, `Sparkles` + `X` из lucide, `aria-label="Закрыть подсказку"`, без inline SVG, без `py-12` |
| `apps/web/src/app/(main)/learn/[id]/page.tsx` | Урок без жёсткого гейта | ✓ VERIFIED | Строка 641: `lesson.locked ? <LockOverlay/>`, строка 648: `{hasDiagnostic === false && <DiagnosticGateBanner />}` — хинт над плеером, не блокировка |
| `apps/web/src/components/profile/QualificationSection.tsx` | Редактирование квалификации | ✓ VERIFIED | 229 строк, `getState.useQuery()`, все 4 контрола, `complete.useMutation()`, toast, `getState.invalidate()` |
| `apps/web/src/app/(main)/profile/page.tsx` | QualificationSection в профиле | ✓ VERIFIED | Импорт строка 13, рендер строка 501 после SecurityCard |
| `apps/web/tests/e2e/phase-56-entry-flow.spec.ts` | E2E спека 3 сценария | ✓ VERIFIED | 3 теста: /learn после визарда, /diagnostic после визарда, no-repeat. Сценарии 1-2 env-gated. Функциональный прогон отложен (pre-existing sandbox auth issue). |

### Верификация ключевых связей (Key Links)

| От | До | Через | Статус | Детали |
|----|----|-------|--------|--------|
| (main)/layout.tsx | /welcome | redirect при onboardingCompletedAt null | ⚠️ PARTIAL | Гард существует, но `if (profile && ...)` — при `profile === null` redirect не срабатывает |
| welcome/page.tsx | trpc.onboarding.complete | useMutation, router.push в onSuccess | ✓ WIRED | Строки 37-51: `complete.mutate(...)`, `{ onSuccess: () => router.push(dest) }` |
| ForkScreen.tsx | /diagnostic, /learn | finish() callback после mutation success | ✓ WIRED | `onChoose('/diagnostic')` / `onChoose('/learn')` → `finish(dest)` → router.push в onSuccess |
| onboarding.ts | UserProfile | prisma.userProfile.update where id ctx.user.id | ✓ WIRED | Строка 50-53: подтверждено unit-тестом |
| root.ts | onboardingRouter | import + registration | ✓ WIRED | `onboarding: onboardingRouter` в appRouter |
| learn/[id]/page.tsx | DiagnosticGateBanner | non-blocking render над плеером | ✓ WIRED | `{hasDiagnostic === false && <DiagnosticGateBanner />}` строка 648 |
| DiagnosticGateBanner.tsx | localStorage | diagnosticHintDismissed flag | ✓ WIRED | `useEffect` читает, `handleDismiss` пишет |
| profile/page.tsx | trpc.onboarding | getState query + complete mutation | ✓ WIRED | Через `QualificationSection`, подтверждено grep и чтением файла |

### Data-Flow Trace (Level 4)

| Артефакт | Переменная данных | Источник | Реальные данные | Статус |
|----------|-------------------|----------|-----------------|--------|
| welcome/page.tsx | goals, marketplaces, experienceLevel, goalText | useState — клиентский ввод | Да — пользователь вводит сам, сохраняется в complete.mutate | ✓ FLOWING |
| QualificationSection.tsx | state (getState) | trpc.onboarding.getState → DB | Да — prisma.userProfile.findUnique select 5 полей | ✓ FLOWING |
| DiagnosticGateBanner.tsx | dismissed | localStorage | Да — реальный localStorage.getItem | ✓ FLOWING |
| (main)/layout.tsx | profile.onboardingCompletedAt | prisma.userProfile.findUnique | Да — select { onboardingCompletedAt: true } | ✓ FLOWING |

### Поведенческие spot-checks (Step 7b)

| Поведение | Проверка | Результат | Статус |
|-----------|----------|-----------|--------|
| onboarding router зарегистрирован в appRouter | grep root.ts | `onboarding: onboardingRouter` найдено | ✓ PASS |
| complete содержит where: id ctx.user.id | grep onboarding.ts | Строка 51: `where: { id: ctx.user.id }` | ✓ PASS |
| DiagnosticGateBanner не блокирует (без py-12) | grep DiagnosticGateBanner | 0 совпадений `py-12` | ✓ PASS |
| LockOverlay сохранён | grep learn/[id]/page.tsx | Строка 641: `lesson.locked ? <LockOverlay/>` | ✓ PASS |
| router.push строго в onSuccess | grep welcome/page.tsx | `router.push(dest)` внутри `{ onSuccess: () => ... }` | ✓ PASS |
| E2E функциональный прогон | pnpm test:e2e (sandbox) | Не запущен — pre-existing auth failure (деферировано) | ? SKIP |

### Покрытие требований

Фаза 56 не объявляет явных requirement ID из REQUIREMENTS.md. Верификация по success criteria roadmap выполнена выше.

### Найденные анти-паттерны

| Файл | Строка | Паттерн | Серьёзность | Влияние |
|------|--------|---------|-------------|---------|
| `apps/web/src/app/(main)/layout.tsx` | 60 | `if (profile && ...)` — null-check пропускает гард для profile === null | 🛑 Блокер | Yandex OAuth новый пользователь может обойти визард при первом входе до создания UserProfile |
| `apps/web/src/components/profile/QualificationSection.tsx` | 68 | `goalText.trim() \|\| undefined` — очистка goalText не работает | ⚠️ Предупреждение | Пользователь очищает поле и сохраняет — старое значение в БД сохраняется, пользователь думает что стёр |
| `apps/web/src/app/welcome/page.tsx` | 43-47 | `goals as never`, `marketplaces as never`, `experienceLevel as never` — каст через never | ℹ️ Инфо | Компилятор не поймает дрейф ключей options.ts ↔ z.enum. Безопасно сейчас, хрупко при изменениях |
| `packages/api/src/routers/onboarding.ts` | — | Нет CQ-события при сохранении онбординга | ⚠️ Предупреждение | Данные квалификации (маркетплейсы, цели) не попадают в CarrotQuest — невозможна сегментация и автоматизации |

### Нужна ручная проверка

#### 1. Yandex OAuth новый пользователь — обход визарда

**Тест:** Войти через Yandex OAuth с аккаунтом, который никогда не авторизовывался на платформе, перейти напрямую на `/learn`
**Ожидается:** Редирект на `/welcome`
**Сейчас по коду:** Не произойдёт — `profile === null`, условие `if (profile && ...)` пропускает redirect
**Почему нужен человек:** Требует реального нового Yandex OAuth аккаунта и living prod/staging

#### 2. E2E-спека phase-56-entry-flow — полный прогон

**Тест:** Запустить `pnpm test:e2e -- phase-56-entry-flow` с переменными `TEST_NEW_USER_EMAIL` + `TEST_NEW_USER_PASSWORD` в CI/staging окружении
**Ожидается:** 3/3 теста зелёных: новый юзер → /learn, новый юзер → /diagnostic, визард не повторяется
**Почему нужен человек:** Sandbox Supabase auth недоступен (pre-existing, см. deferred-items.md)

## Сводка по гэпам

**1 блокирующий гэп** (WR-01 из code review подтверждён):

Гард онбординга в `(main)/layout.tsx` строка 60 написан как `if (profile && profile.onboardingCompletedAt === null)`. Это означает: если `UserProfile` ещё не существует (`profile === null`), гард молча пропускает redirect. `UserProfile` создаётся лениво через `ensureUserProfile` — только при первом tRPC-вызове. Email-DOI пользователи обычно проходят через `/auth/confirm` → tRPC-процедуры, поэтому у них профиль есть. Но Yandex OAuth новый пользователь может зайти напрямую на `(main)`-роут до первого tRPC-вызова.

Исправление: одна строка — заменить `if (profile && ...)` на `if (!profile || ...)`.

**1 предупреждение без блокировки** (WR-04 из code review подтверждён):

`goalText.trim() || undefined` в `QualificationSection.tsx:68` — попытка очистить поле goalText в профиле не работает. `undefined` пропускается Prisma `update.data`, предыдущее значение остаётся в БД. Пользователь видит пустое поле после сохранения, но БД хранит старый текст. Исправление: `goalText: goalText.trim()` + схема `z.string().trim().max(500).nullable().optional()`.

---

_Верифицировано: 2026-05-18T12:00:00Z_
_Верификатор: Claude (gsd-verifier)_
