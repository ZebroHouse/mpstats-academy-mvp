# Главная: AI-ассистент заметнее + переименование «Решения» — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать кнопку AI-ассистента в топ-баре заметной (крупнее + анимированная градиентная рамка), добавить бейдж «1» для новичка, показывать приветствие-стейт с именем и чипами при первом открытии, и переименовать раздел «Решения под задачу»→«Решения» / «Решить задачу»→«Найти решение».

**Architecture:** Чистый фронт + один backend-контракт. Кнопка `AssistantLauncher` получает из `(main)/layout.tsx` имя пользователя и признак «уже открывал ассистента» (`toursCompleted.includes('assistant')`). Анимированная рамка — CSS `conic-gradient` во вращающемся `::before` + `::after`-маска (без JS, без библиотек, reduced-motion покрыт глобальным правилом). Бейдж прячется оптимистично при первом открытии + best-effort мутация `markTourCompleted({page:'assistant'})` (enum расширяется на `'assistant'`). Приветствие — клиентский стейт в `AssistantConversation` при пустой истории (не тратит квоту/LLM), чипы засевают текст в поле ввода. Переименование — точечный копирайт в 2 местах.

**Tech Stack:** Next.js 14 (App Router, client components), TypeScript, Tailwind CSS v4 (кастомные утилиты/keyframes в `apps/web/src/styles/globals.css`), tRPC, Prisma, lucide-react.

## Global Constraints

- **`pnpm --filter web build` обязателен** перед сдачей, не только `pnpm typecheck` — client-компоненты ассистента при импорте из `packages/ai`/`packages/api` могут затянуть `server-only` в бандл (гоча `MAAL/CLAUDE.md`). `import type` безопасен.
- Анимация рамки НЕ должна дёргать layout — анимируем только `transform`/`background` вращающегося слоя, не `width`/размер `box-shadow` кнопки.
- `prefers-reduced-motion` — анимация выключена. В `globals.css:378-389` уже есть глобальное правило (`*,*::before,*::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important }`), которое замораживает вращение на статичном градиенте. Отдельный override не нужен, но проверить визуально.
- Бейдж — **per-user** (не per-device): состояние в `UserProfile.toursCompleted` (как онбординг-туры), не в localStorage. Маркер `'assistant'` ДОБАВЛЯЕТСЯ в массив, не пересоздаёт его (в массиве уже `'dashboard'`/`'learn'`/`'lesson'`).
- Приветствие — **клиентский стейт**, НЕ реальное сообщение ассистента (не дёргаем `sendMessage`/квоту/LLM).
- Чип **засевает** текст в поле ввода (не авто-отправка — мягче).
- Имя — из профиля; если пусто, нейтральное «Привет!».
- Тон копирайта — по редполитике (скилл `mpstats-copywriting`); менять ТОЛЬКО целевые строки, не трогать hero-headline `/learn/solutions` («Решите задачу за минуту») и прочий маркетинг-копирайт.
- Не трогать логику самого ассистента (RAG, квоты, концьерж, `sendMessage`).
- Смотрим результат на staging; HTML-макет не собираем.

---

### Task 1: Переименование «Решения под задачу»→«Решения», «Решить задачу»→«Найти решение»

**Files:**
- Modify: `apps/web/src/components/shared/sidebar.tsx:25`
- Modify: `apps/web/src/app/(main)/dashboard/page.tsx:35`

**Interfaces:** —

Целевые строки (проверено грепом всего `apps/web/src`): ровно два продуктовых вхождения. `LearningTabs.tsx:16` уже называется «Решения» — не трогаем. Hero-headline solutions-страницы («Решите задачу за минуту») — НЕ целевая строка, не трогаем. `styleguide` — не продуктовый экран, не трогаем.

- [ ] **Step 1: Переименовать пункт сайдбара**

В `apps/web/src/components/shared/sidebar.tsx` строка 25:

```tsx
  { title: 'Решения', href: '/learn/solutions' },
```

- [ ] **Step 2: Переименовать кнопку дашборда**

В `apps/web/src/app/(main)/dashboard/page.tsx` строка 35 — заменить `label: 'Решить задачу'` на `label: 'Найти решение'` (остальные поля строки не трогать):

```tsx
  { href: '/learn/solutions',icon: Target,        label: 'Найти решение',        dataTour: undefined,                   tone: 'dark' },
```

- [ ] **Step 3: Проверить, что других вхождений нет**

Run: `grep -rn "Решения под задачу\|Решить задачу" apps/web/src --include="*.tsx"`
Expected: только `styleguide/v2/styleguide-v2-client.tsx` (не продуктовый, оставляем) — продуктовых вхождений «Решить задачу»/«Решения под задачу» больше нет.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/shared/sidebar.tsx "apps/web/src/app/(main)/dashboard/page.tsx"
git commit -m "feat(ui): rename «Решения под задачу»→«Решения», «Решить задачу»→«Найти решение»

Консистентно с табом обучения (LearningTabs уже «Решения»). Только nav-метка
и CTA дашборда; hero-копирайт solutions-страницы не трогаем."
```

---

### Task 2: Расширить `markTourCompleted` на маркер `'assistant'`

**Files:**
- Modify: `packages/api/src/routers/profile.ts:441`

**Interfaces:**
- Produces: `markTourCompleted` принимает `page: 'assistant'` — консьюмер бейджа (Task 3) добавляет этот маркер при первом открытии ассистента.

Мутация уже идемпотентна (добавляет только если ещё нет). Меняем только enum входа; `toursCompleted` — `String[]`, миграция не нужна.

- [ ] **Step 1: Добавить `'assistant'` в enum входа**

В `packages/api/src/routers/profile.ts` строка 441:

```typescript
    .input(z.object({ page: z.enum(['dashboard', 'learn', 'lesson', 'assistant']) }))
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/routers/profile.ts
git commit -m "feat(api): accept 'assistant' marker in markTourCompleted

Переиспользуем toursCompleted для per-user бейджа «1» на кнопке ассистента
(без новой миграции — String[]). Мутация уже идемпотентна."
```

---

### Task 3: Анимированная кнопка AI-ассистента + бейдж «1»

**Files:**
- Modify: `apps/web/src/styles/globals.css` (добавить keyframes + утилиту рамки)
- Modify: `apps/web/src/app/(main)/layout.tsx:62-64` (select) и `:126` (пропсы)
- Modify: `apps/web/src/components/assistant/AssistantLauncher.tsx`

**Interfaces:**
- Consumes: `markTourCompleted({ page: 'assistant' })` (Task 2).
- Produces: `AssistantLauncher` теперь принимает `{ enabled: boolean; userName: string | null; assistantSeen: boolean }` и прокидывает `userName` в `AssistantConversation` (потребляется Task 4).

- [ ] **Step 1: Добавить CSS вращающейся градиентной рамки**

В `apps/web/src/styles/globals.css` — внутри блока кастомных утилит (рядом с `.animate-pulse-glow`, перед закрывающей `}` на строке 274) добавить:

```css
  /* AI-assistant launcher: rotating conic-gradient border (Gemini-style).
     ::before = spinning gradient ring, ::after = inner fill mask leaving a 2px edge.
     prefers-reduced-motion is handled globally below (freezes the spin). */
  .assistant-glow {
    position: relative;
    z-index: 0;
    overflow: hidden;
    border-radius: 9999px;
    background: transparent;
  }
  .assistant-glow::before {
    content: '';
    position: absolute;
    z-index: -2;
    left: -50%;
    top: -50%;
    width: 200%;
    height: 200%;
    background: conic-gradient(from 0deg, #2C4FF8, #8b5cf6, #ec4899, #22d3ee, #2C4FF8);
    animation: assistantSpin 3s linear infinite;
  }
  .assistant-glow::after {
    content: '';
    position: absolute;
    z-index: -1;
    inset: 2px;
    border-radius: 9999px;
    background: white;
  }
```

И рядом с прочими `@keyframes` (после строки 274, например возле `@keyframes fadeIn`) добавить:

```css
@keyframes assistantSpin {
  to {
    transform: rotate(1turn);
  }
}
```

- [ ] **Step 2: Прокинуть имя и признак «уже открывал» из layout**

В `apps/web/src/app/(main)/layout.tsx` расширить select профиля (строка 64) — добавить `toursCompleted`:

```typescript
    select: { name: true, avatarUrl: true, onboardingCompletedAt: true, toursCompleted: true },
```

И заменить рендер лаунчера (строка 126) на:

```tsx
                <AssistantLauncher
                  enabled={assistantEnabled}
                  userName={profile?.name ?? user.user_metadata?.full_name ?? null}
                  assistantSeen={profile?.toursCompleted?.includes('assistant') ?? false}
                />
```

- [ ] **Step 3: Переписать `AssistantLauncher` — крупнее, рамка, бейдж, имя**

Заменить весь `apps/web/src/components/assistant/AssistantLauncher.tsx` на:

```tsx
'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { AssistantConversation } from '@/components/assistant/AssistantConversation';
import { trpc } from '@/lib/trpc/client';

export function AssistantLauncher({
  enabled,
  userName,
  assistantSeen,
}: {
  enabled: boolean;
  userName: string | null;
  assistantSeen: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Optimistic per-user badge: hide as soon as they open it, persist best-effort.
  const [seen, setSeen] = useState(assistantSeen);
  const markSeen = trpc.profile.markTourCompleted.useMutation();

  if (!enabled) return null;

  function handleToggle() {
    setOpen((v) => {
      const next = !v;
      if (next && !seen) {
        setSeen(true);
        markSeen.mutate({ page: 'assistant' }); // best-effort; badge already hidden locally
      }
      return next;
    });
  }

  return (
    <>
      <div className="relative">
        <button
          onClick={handleToggle}
          aria-label="AI-ассистент"
          className={`assistant-glow flex h-10 items-center gap-1.5 px-4 text-sm font-semibold transition-colors ${
            open ? 'text-mp-blue-700' : 'text-mp-gray-900 hover:text-mp-blue-700'
          }`}
        >
          <Sparkles className="h-4 w-4 text-mp-blue-600" />
          <span className="hidden sm:inline">AI-ассистент</span>
        </button>
        {!seen && (
          <span
            aria-hidden
            className="pointer-events-none absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-mp-pink-500 text-[11px] font-bold text-white shadow-sm"
          >
            1
          </span>
        )}
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="p-0">
          <AssistantConversation userName={userName} />
        </SheetContent>
      </Sheet>
    </>
  );
}
```

- [ ] **Step 4: Typecheck + build**

Run: `pnpm typecheck`
Expected: PASS.
Run: `pnpm --filter web build`
Expected: build успешен (ловит server-only-в-client).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/styles/globals.css "apps/web/src/app/(main)/layout.tsx" apps/web/src/components/assistant/AssistantLauncher.tsx
git commit -m "feat(ui): prominent animated AI-assistant launcher + new-user badge

Крупнее (h-10) + вращающаяся conic-gradient рамка (CSS, reduced-motion via
глобального правила). Бейдж «1» пока 'assistant' ∉ toursCompleted; прячется
оптимистично при первом открытии + best-effort markTourCompleted. Имя профиля
прокинуто в диалог для приветствия."
```

**Проверить (в ревью):** если `mp-pink-500` не определён в палитре Tailwind — заменить на существующий акцент (напр. `bg-rose-500`); проверить `apps/web/src/styles/globals.css`/tailwind-конфиг на наличие `mp-pink-*`.

---

### Task 4: Приветственный стейт в `AssistantConversation` (имя + чипы)

**Files:**
- Modify: `apps/web/src/components/assistant/AssistantConversation.tsx`

**Interfaces:**
- Consumes: проп `userName: string | null` из `AssistantLauncher` (Task 3).

Заменяем текущий скучный empty-state (строки 114-118) на приветствие по имени + 4 сценарных чипа. Чип засевает текст в `input` (не отправляет) и фокусит поле. Клиентский стейт — квоту/LLM не трогает.

- [ ] **Step 1: Принять проп `userName` и добавить константы чипов**

Изменить сигнатуру компонента (строка 19) на:

```tsx
export function AssistantConversation({ userName }: { userName?: string | null }) {
```

Сразу над компонентом (после импортов, до `export function`) добавить:

```tsx
/** Сценарные чипы приветствия: клик засевает текст в поле ввода (не отправляет). */
const WELCOME_CHIPS: { label: string; seed: string }[] = [
  { label: 'С чего начать', seed: 'С чего мне начать в Академии?' },
  { label: 'Найти материал по задаче', seed: 'Помоги найти материал по задаче: ' },
  { label: 'Разобраться с проблемой', seed: 'Помоги разобраться: ' },
  { label: 'Провести в раздел', seed: 'Куда мне перейти, чтобы ' },
];
```

- [ ] **Step 2: Добавить ref на поле ввода для фокуса после засева**

В теле компонента, рядом с `const scrollRef = useRef<HTMLDivElement>(null);` (строка 23), добавить:

```tsx
  const inputRef = useRef<HTMLInputElement>(null);
```

И привязать его к `<input>` (строка 155) — добавить `ref={inputRef}` в проп-лист input'а:

```tsx
          <input
            ref={inputRef}
            value={input}
```

- [ ] **Step 3: Заменить empty-state на приветствие с чипами**

Заменить блок (строки 114-118):

```tsx
        {messages.length === 0 && (
          <p className="mt-8 text-center text-sm text-mp-gray-500">
            Спроси про уроки платформы или про твой бизнес на маркетплейсе — например «из чего складывается ДРР?»
          </p>
        )}
```

на:

```tsx
        {messages.length === 0 && (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-mp-gray-700">
              {userName ? `${userName}, привет!` : 'Привет!'} Я помогу быстро сориентироваться в Академии.
              Опишите задачу или вопрос — подберу нужный урок, инструкцию, чек-лист или шаблон.
            </p>
            <div className="flex flex-wrap gap-2">
              {WELCOME_CHIPS.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => {
                    setInput(chip.seed);
                    inputRef.current?.focus();
                  }}
                  className="rounded-full border border-mp-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-mp-gray-700 transition-colors hover:border-mp-blue-300 hover:bg-mp-blue-50 hover:text-mp-blue-700"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        )}
```

- [ ] **Step 4: Typecheck + build**

Run: `pnpm typecheck`
Expected: PASS.
Run: `pnpm --filter web build`
Expected: build успешен.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/assistant/AssistantConversation.tsx
git commit -m "feat(ui): welcome state in assistant — named greeting + scenario chips

При пустой истории — приветствие по имени и 4 сценарных чипа. Чип засевает
текст в поле ввода (не отправляет, квоту/LLM не тратим). Клиентский стейт."
```

---

### Task 5: Финальная верификация

**Files:** —

- [ ] **Step 1: Полный typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 2: Прод-сборка web**

Run: `pnpm --filter web build`
Expected: build успешен (главный гейт — server-only-в-client).

- [ ] **Step 3: Staging-проверка (после деплоя, ручное — owner)**

- Кнопка ассистента заметно крупнее и с движущейся градиентной рамкой на всех `(main)`-страницах.
- Новый аккаунт → бейдж «1»; после первого открытия исчезает и не возвращается после перезахода/на другом устройстве (per-user).
- Первое открытие → приветствие с именем + 4 чипа; клик по чипу засевает текст в поле, поле в фокусе.
- Раздел везде называется «Решения» (сайдбар) / «Найти решение» (кнопка дашборда).
- `prefers-reduced-motion: reduce` (в системных настройках) → рамка не крутится (статичный градиент).

---

## Self-Review

**Spec coverage:**
- §19-27 (кнопка заметнее + анимированная градиентная рамка + reduced-motion) → Task 3 (CSS + разметка). ✅
- §28-34 (бейдж «1», per-user через toursCompleted, скрытие при первом открытии) → Task 2 (enum) + Task 3 (бейдж + мутация). ✅
- §36-50 (приветствие по имени + чипы, клиентский стейт, засев в поле) → Task 4. ✅
- §52-59 (переименование «Решения»/«Найти решение», grep всех вхождений) → Task 1. ✅
- §61-63 (границы: не выносим engagement-блоки, не трогаем логику ассистента) → соблюдено, задач на это нет. ✅
- §65-69 (гочи: build обязателен, layout не дёргать, toursCompleted-массив дополняем) → Global Constraints + Task 3/4 build-шаги. ✅

**Placeholder scan:** весь код приведён дословно; grep-проверка в Task 1 Step 3 конкретна. Нет TBD/«add X». ✅

**Type consistency:** `AssistantLauncher` props `{ enabled, userName: string | null, assistantSeen: boolean }` (Task 3) согласованы с вызовом в layout (Task 3 Step 2) и с прокидыванием `userName` в `AssistantConversation({ userName?: string | null })` (Task 4 Step 1). `markTourCompleted({ page: 'assistant' })` (Task 3) согласован с enum из Task 2. ✅

**Открытый риск (в ревью):** класс `bg-mp-pink-500` — проверить наличие в палитре (Task 3 отмечает fallback `bg-rose-500`). `@keyframes assistantSpin` — новый, конфликтов имён в globals.css нет (проверено грепом существующих keyframes).
