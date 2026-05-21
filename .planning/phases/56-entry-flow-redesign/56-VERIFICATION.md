---
phase: 56-entry-flow-redesign
verified: 2026-05-18T14:00:00Z
status: human_needed
score: 6/6
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 5/6
  gaps_closed:
    - "(main)/layout.tsx строка 62: условие изменено на `if (!profile || profile.onboardingCompletedAt === null)` — profile === null теперь также редиректит на /welcome (Gap 1, SC-1/SC-5)"
    - "QualificationSection.tsx строка 68: `goalText.trim() || null` вместо `|| undefined`; onboarding.ts:44 схема `z.string().trim().max(500).nullable().optional()` — очистка goalText теперь персистируется (Gap 2, SC-6)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Открыть платформу с новым Yandex OAuth аккаунтом (никогда не авторизовывался). Сразу перейти на /learn или /dashboard."
    expected: "Должен произойти редирект на /welcome. С исправленным кодом (`!profile || ...`) это должно работать корректно."
    why_human: "Требует реального нового Yandex OAuth аккаунта и живого prod/staging. Нельзя проверить без свежего аккаунта."
  - test: "Запустить `pnpm test:e2e -- phase-56-entry-flow` с переменными `TEST_NEW_USER_EMAIL` + `TEST_NEW_USER_PASSWORD` в CI/staging окружении"
    expected: "3/3 теста зелёных: новый юзер → /learn, новый юзер → /diagnostic, визард не повторяется"
    why_human: "Sandbox Supabase auth недоступен (pre-existing issue, deferred-items.md). Требует CI/staging с живым test-пользователем."
---

# Фаза 56: Entry Flow Redesign — Отчёт верификации (ревёрификация)

**Цель фазы:** Новый пользователь получает комфортный вход — мягкий онбординг-визард `/welcome` с равноценным выбором пути (диагностика или каталог уроков) вместо обязательной диагностики. Уроки доступны в рамках подписки без прохождения диагностики.
**Верифицировано:** 2026-05-18T14:00:00Z
**Статус:** human_needed
**Ревёрификация:** Да — после закрытия гэпов (коммит `eb4a8d3`)

## Результат ревёрификации

**Оба гэпа из предыдущей верификации закрыты.** Счёт вырос с 5/6 до 6/6. Оставшиеся human_needed пункты — те же два E2E/OAuth сценария, которые были в исходной верификации: они не могут быть проверены без живого окружения (pre-existing sandbox limitation).

## Достижение цели

### Наблюдаемые истины (Observable Truths)

| # | Истина | Статус | Свидетельство |
|---|--------|--------|---------------|
| 1 | Новый пользователь после регистрации попадает в /welcome-визард (3 шага + развилка), не сразу на /dashboard | ✓ VERIFIED | `(main)/layout.tsx:62`: `if (!profile \|\| profile.onboardingCompletedAt === null) { redirect('/welcome'); }` — корректно покрывает оба случая: `profile === null` (первый OAuth-вход до создания UserProfile) и `profile.onboardingCompletedAt === null` (пользователь создан, но визард не прошёл). Петля редиректа исключена: `/welcome` находится вне `(main)` route group, его layout не проверяет `onboardingCompletedAt`. |
| 2 | Квалификация (marketplaces / experience / goals / goalText) сохраняется в UserProfile через onboarding.complete | ✓ VERIFIED | `onboarding.ts:50-53`: мутация `complete` записывает все 4 поля + `onboardingCompletedAt: new Date()` в `where: { id: ctx.user.id }`. 4 unit-теста подтверждают (32/32 зелёных). |
| 3 | С развилки пользователь уходит в /diagnostic или /learn — обе карточки равноценны | ✓ VERIFIED | `ForkScreen.tsx`: `grid sm:grid-cols-2`, обе карточки вызывают `onChoose()`, `router.push` строго в `onSuccess` (`welcome/page.tsx:49`). |
| 4 | Без пройденной диагностики пользователь смотрит все уроки в рамках подписки; жёсткий гейт снят, подписочный LockOverlay сохранён | ✓ VERIFIED | `learn/[id]/page.tsx:641-648`: `lesson.locked ? <LockOverlay/>`, внутри — `{hasDiagnostic === false && <DiagnosticGateBanner />}` над плеером (хинт, не блок). |
| 5 | Визард показывается один раз; повторные входы → /dashboard. Текущие ~200 пользователей видят визард один раз при следующем входе | ✓ VERIFIED | Гард читает `onboardingCompletedAt`. После прохождения `complete` ставит timestamp → дальнейшие входы проходят. Пользователи с `onboardingCompletedAt = null` (миграция) увидят визард однократно. `!profile` case теперь тоже редиректит. |
| 6 | Квалификацию можно отредактировать в /profile | ✓ VERIFIED | `QualificationSection.tsx:68`: `goalText: goalText.trim() \|\| null` — очистка поля теперь персистируется (`null` Prisma пишет в БД). `onboarding.ts:44` схема: `z.string().trim().max(500).nullable().optional()` принимает `null`. `QualificationSection` импортирована и рендерится в `profile/page.tsx:501`. |

**Счёт: 6/6 истин верифицировано**

### Закрытые гэпы

| Гэп | Исходная проблема | Исправление | Проверка |
|-----|-------------------|-------------|---------|
| Gap 1 (Блокер, SC-1/SC-5) | `if (profile && profile.onboardingCompletedAt === null)` — при `profile === null` гард не срабатывал | `(main)/layout.tsx:62`: изменено на `if (!profile \|\| profile.onboardingCompletedAt === null)` | Строка 62 подтверждена чтением файла |
| Gap 2 (Предупреждение, SC-6) | `goalText.trim() \|\| undefined` — `undefined` игнорируется Prisma `update.data`, старое значение оставалось в БД | `QualificationSection.tsx:68`: `goalText.trim() \|\| null`; `onboarding.ts:44`: схема `nullable().optional()` | Строка 68 подтверждена, схема строка 44 подтверждена |

### Проверка отсутствия петли редиректа

Исправление Gap 1 (редирект при `profile === null`) потенциально могло создать петлю, если бы `/welcome` было под `(main)`. Проверка:

- `/welcome` — отдельный route group (`apps/web/src/app/welcome/`), **вне** `(main)`
- `welcome/layout.tsx` проверяет только `!data?.user` → redirect `/login`. `onboardingCompletedAt` не проверяется
- `welcome/page.tsx`: `router.push(dest)` строго в `onSuccess` мутации `complete` — навигация происходит только после того, как `onboardingCompletedAt` записан в БД
- Цикл невозможен: после завершения визарда `onboardingCompletedAt != null`, гард `(main)` пропускает

**Петля редиректа не введена.**

### Обязательные артефакты

| Артефакт | Ожидается | Статус | Детали |
|----------|-----------|--------|--------|
| `packages/db/prisma/schema.prisma` | 5 новых полей на UserProfile | ✓ VERIFIED | `onboardingCompletedAt`, `marketplaces`, `experienceLevel`, `goals`, `goalText` |
| `packages/api/src/routers/onboarding.ts` | tRPC router getState + complete | ✓ VERIFIED | 59 строк, `protectedProcedure`, z.enum whitelist, `goalText: z.string().trim().max(500).nullable().optional()` |
| `apps/web/src/app/(main)/layout.tsx` | Гард redirect('/welcome') | ✓ VERIFIED | Строка 62: `if (!profile \|\| profile.onboardingCompletedAt === null) { redirect('/welcome'); }` |
| `apps/web/src/app/welcome/layout.tsx` | Fullscreen layout + auth-guard | ✓ VERIFIED | `!data?.user` → `/login`, без Sidebar/MobileNav/UserNav |
| `apps/web/src/app/welcome/page.tsx` | Клиентский useState-степпер | ✓ VERIFIED | `router.push(dest)` строго в `onSuccess` |
| `apps/web/src/components/welcome/ForkScreen.tsx` | Развилка — 2 равные карты | ✓ VERIFIED | `grid sm:grid-cols-2`, `isSaving` передаётся |
| `apps/web/src/components/profile/QualificationSection.tsx` | Редактирование с корректным сохранением goalText | ✓ VERIFIED | Строка 68: `goalText.trim() \|\| null` |
| `apps/web/src/app/(main)/profile/page.tsx` | QualificationSection в профиле | ✓ VERIFIED | Импорт + рендер строка 501 |
| `apps/web/src/app/(main)/learn/[id]/page.tsx` | Урок без жёсткого гейта | ✓ VERIFIED | `lesson.locked ? <LockOverlay/>`, DiagnosticGateBanner как хинт |
| `apps/web/tests/e2e/phase-56-entry-flow.spec.ts` | E2E спека 3 сценария | ✓ VERIFIED | 3 теста существуют; функциональный прогон отложен (sandbox auth) |

### Верификация ключевых связей (Key Links)

| От | До | Через | Статус | Детали |
|----|----|-------|--------|--------|
| (main)/layout.tsx | /welcome | `redirect('/welcome')` при `!profile \|\| onboardingCompletedAt === null` | ✓ WIRED | Строка 62 — оба случая покрыты |
| welcome/page.tsx | trpc.onboarding.complete | `complete.mutate(...)`, `router.push` в `onSuccess` | ✓ WIRED | Строка 37-51 |
| ForkScreen.tsx | /diagnostic, /learn | `onChoose('/diagnostic')` / `onChoose('/learn')` → `finish(dest)` | ✓ WIRED | Навигация после персистентности |
| onboarding.ts | UserProfile | `prisma.userProfile.update where id ctx.user.id` | ✓ WIRED | Строка 50-53, подтверждён unit-тестом |
| QualificationSection.tsx | onboarding.complete | `save.mutate({ goalText: goalText.trim() \|\| null })` | ✓ WIRED | Строка 64-69, null персистируется через nullable схему |

### Data-Flow Trace (Level 4)

| Артефакт | Переменная данных | Источник | Реальные данные | Статус |
|----------|-------------------|----------|-----------------|--------|
| welcome/page.tsx | goals, marketplaces, experienceLevel, goalText | useState — клиентский ввод | Да — пользователь вводит, сохраняется в `complete.mutate` | ✓ FLOWING |
| QualificationSection.tsx | state (getState) | trpc.onboarding.getState → `prisma.userProfile.findUnique` | Да — все 5 полей из БД | ✓ FLOWING |
| (main)/layout.tsx | profile.onboardingCompletedAt | `prisma.userProfile.findUnique select { onboardingCompletedAt: true }` | Да — реальный DB query | ✓ FLOWING |

### Поведенческие spot-checks (Step 7b)

| Поведение | Проверка | Результат | Статус |
|-----------|----------|-----------|--------|
| Guard условие покрывает `profile === null` | grep `(main)/layout.tsx` строка 62 | `if (!profile \|\| profile.onboardingCompletedAt === null)` | ✓ PASS |
| goalText → null при очистке | grep QualificationSection.tsx строка 68 | `goalText: goalText.trim() \|\| null` | ✓ PASS |
| goalText схема принимает null | grep onboarding.ts строка 44 | `z.string().trim().max(500).nullable().optional()` | ✓ PASS |
| router.push строго в onSuccess | grep welcome/page.tsx | `router.push(dest)` внутри `{ onSuccess: () => ... }` строка 49 | ✓ PASS |
| /welcome вне (main) route group | проверка пути файла | `apps/web/src/app/welcome/` — не `(main)/welcome/` | ✓ PASS |
| welcome/layout.tsx не проверяет onboardingCompletedAt | чтение файла | только `!data?.user` → `/login` | ✓ PASS — петли нет |
| Unit-тесты onboarding | (из контекста) | 32/32 зелёных включая 4 onboarding теста | ✓ PASS |
| E2E функциональный прогон | pnpm test:e2e (sandbox) | Не запущен — pre-existing auth failure | ? SKIP |

### Найденные анти-паттерны

| Файл | Строка | Паттерн | Серьёзность | Влияние |
|------|--------|---------|-------------|---------|
| `apps/web/src/app/welcome/page.tsx` | 43-47 | `goals as never`, `marketplaces as never`, `experienceLevel as never` — каст через never | ℹ️ Инфо | Компилятор не поймает дрейф ключей `options.ts` ↔ `z.enum`. Безопасно сейчас, хрупко при изменениях |
| `packages/api/src/routers/onboarding.ts` | — | Нет CQ-события при сохранении онбординга | ⚠️ Предупреждение | Квалификационные данные (маркетплейсы, цели) не попадают в CarrotQuest — невозможна сегментация по этим атрибутам |

*Оба были в исходной верификации. Не являются блокерами для цели фазы.*

### Нужна ручная проверка

#### 1. Yandex OAuth — новый пользователь (Gap 1 был блокером — исправлен программно)

**Тест:** Войти через Yandex OAuth с аккаунтом, который никогда не авторизовывался на платформе, перейти напрямую на `/learn`
**Ожидается:** Редирект на `/welcome` — теперь код написан корректно (`!profile || ...`)
**Почему нужен человек:** Требует реального нового Yandex OAuth аккаунта и живого prod/staging. Нельзя воспроизвести без свежего аккаунта.

#### 2. E2E-спека phase-56-entry-flow — полный прогон

**Тест:** Запустить `pnpm test:e2e -- phase-56-entry-flow` с переменными `TEST_NEW_USER_EMAIL` + `TEST_NEW_USER_PASSWORD` в CI/staging окружении
**Ожидается:** 3/3 теста зелёных: новый юзер → /learn, новый юзер → /diagnostic, визард не повторяется
**Почему нужен человек:** Sandbox Supabase auth недоступен (pre-existing issue). Требует CI/staging с живым test-пользователем.

## Итоговая сводка

**Все 6 success criteria достигнуты. Оба гэпа из предыдущей верификации закрыты в коммите `eb4a8d3`.**

Gap 1 (блокер): `(main)/layout.tsx` строка 62 теперь корректно трактует `profile === null` как «не прошёл онбординг». Петля редиректа исключена архитектурно — `/welcome` находится вне `(main)` route group, его layout не читает `onboardingCompletedAt`.

Gap 2 (предупреждение): `QualificationSection.tsx` строка 68 теперь передаёт `null` при очистке поля `goalText`. Схема `onboarding.ts:44` обновлена до `nullable().optional()` — Prisma записывает `null` в БД.

Оставшиеся human_needed пункты — E2E-прогон и реальный Yandex OAuth тест — являются pre-existing ограничениями тестовой среды, не дефектами реализации.

---

_Верифицировано: 2026-05-18T14:00:00Z_
_Верификатор: Claude (gsd-verifier)_
