# Register Split-Layout Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Превратить `/register` в сплит-лейаут (компактная форма слева + ценностная панель справа), чтобы холодный/партнёрский трафик сразу видел ценность платформы, а не голую форму.

**Architecture:** `/register` выводится из общей центрированной route-группы `(auth)` в собственный полноширинный лейаут. Логика регистрации (`register-form.tsx`) не меняется — переиспользуется как левая колонка. Справа — новый презентационный компонент `RegisterValuePanel` (статический, server component). На мобиле колонки стекаются: тизер → форма → цифры/цена; при наличии `?ref=` верхний тизер подавляется (реферальный баннер внутри формы даёт релевантный контекст).

**Tech Stack:** Next.js 14 App Router, React Server Components, TypeScript, Tailwind (токены `mp-blue`/`mp-green`/`mp-gray`), lucide-react, Vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-06-16-register-split-layout-redesign-design.md`

---

## File Structure

- **Create** `apps/web/src/components/register/value-panel.tsx` — ценностная панель: shared-константы (заголовок, оси, цифры, цена) + презентационные части `AxesChips`, `StatGrid`, `PriceCompare`, `RadarBg` + три экспорта `RegisterValueTeaser`, `RegisterValueStats`, `RegisterValuePanel`. Один файл — всё меняется вместе. Server component (без `'use client'`, без хуков).
- **Create** `apps/web/tests/unit/register-value-panel.test.tsx` — юнит-тесты панели.
- **Create** `apps/web/src/app/register/layout.tsx` — полноширинный шелл (logo header + footer), БЕЗ `max-w-md`-центрирования.
- **Move** `apps/web/src/app/(auth)/register/` → `apps/web/src/app/register/` (через `git mv`; URL `/register` не меняется, отвязывается от центрированного `(auth)`-лейаута). Переезжают `page.tsx` + `register-form.tsx`.
- **Modify** `apps/web/src/app/register/page.tsx` — рендерит сплит вместо одиночной формы.
- **Untouched** `apps/web/src/app/register/register-form.tsx` — логика (signUp, Яндекс, рефералка, согласия, Метрика) не меняется. `(auth)/layout.tsx`, `/login`, `/forgot-password` и пр. — без изменений.

---

## Task 1: Value-panel компоненты + данные (TDD)

**Files:**
- Create: `apps/web/src/components/register/value-panel.tsx`
- Test: `apps/web/tests/unit/register-value-panel.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/unit/register-value-panel.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import {
  RegisterValuePanel,
  RegisterValueTeaser,
  RegisterValueStats,
} from '@/components/register/value-panel';

afterEach(() => cleanup());

const AXES = ['Аналитика', 'Маркетинг', 'Контент', 'Операции', 'Финансы'];

describe('RegisterValuePanel (desktop)', () => {
  it('renders headline, all 5 axes, 4 stats and the price comparison', () => {
    const { container } = render(<RegisterValuePanel />);
    expect(screen.getByText('Обучение маркетплейсам, собранное под вас')).toBeInTheDocument();
    for (const axis of AXES) expect(screen.getByText(axis)).toBeInTheDocument();
    expect(screen.getByText('400+')).toBeInTheDocument();
    expect(screen.getByText('150+')).toBeInTheDocument();
    expect(screen.getByText('10 мин')).toBeInTheDocument();
    expect(screen.getByText('AI')).toBeInTheDocument();
    expect(screen.getByText('2 990 ₽ / мес — полный доступ')).toBeInTheDocument();
    expect(container.querySelector('.line-through')?.textContent)
      .toContain('45 000–90 000 ₽');
    // 4 stat icons + radar background svg => at least 5 svg nodes
    expect(container.querySelectorAll('svg').length).toBeGreaterThanOrEqual(5);
  });

  it('does NOT use emoji for stat icons (lucide only)', () => {
    const { container } = render(<RegisterValuePanel />);
    // Stat icons must be inline <svg>, not emoji characters.
    expect(container.textContent).not.toMatch(/📚|⏱️|🎯|🤖/u);
  });
});

describe('RegisterValueTeaser (mobile top)', () => {
  it('renders headline, subhead and the 5 axis chips', () => {
    render(<RegisterValueTeaser />);
    expect(screen.getByText('Обучение маркетплейсам, собранное под вас')).toBeInTheDocument();
    for (const axis of AXES) expect(screen.getByText(axis)).toBeInTheDocument();
  });

  it('passes through className', () => {
    const { container } = render(<RegisterValueTeaser className="lg:hidden" />);
    expect(container.firstElementChild?.className).toContain('lg:hidden');
  });
});

describe('RegisterValueStats (mobile bottom)', () => {
  it('renders the 4 stats and the price comparison', () => {
    render(<RegisterValueStats />);
    expect(screen.getByText('400+')).toBeInTheDocument();
    expect(screen.getByText('150+')).toBeInTheDocument();
    expect(screen.getByText('10 мин')).toBeInTheDocument();
    expect(screen.getByText('2 990 ₽ / мес — полный доступ')).toBeInTheDocument();
  });

  it('passes through className', () => {
    const { container } = render(<RegisterValueStats className="lg:hidden" />);
    expect(container.firstElementChild?.className).toContain('lg:hidden');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm test -- register-value-panel`
Expected: FAIL — `Cannot find module '@/components/register/value-panel'`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/components/register/value-panel.tsx`:

```tsx
import { BookOpen, Clock, Target, Bot, type LucideIcon } from 'lucide-react';

/* ── Shared content (single source of truth) ─────────────── */

const HEADLINE = 'Обучение маркетплейсам, собранное под вас';
const SUBHEAD =
  'AI-диагностика за 10 минут определяет ваш уровень и собирает персональную программу — без воды и одинакового потока для всех.';
const PRICE_OLD = 'Офлайн-курсы: 45 000–90 000 ₽ единоразово';
const PRICE_NEW = '2 990 ₽ / мес — полный доступ';

const AXES = ['Аналитика', 'Маркетинг', 'Контент', 'Операции', 'Финансы'] as const;

type Stat = { icon: LucideIcon; value: string; label: string };
const STATS: Stat[] = [
  { icon: BookOpen, value: '400+', label: 'уроков' },
  { icon: Clock, value: '150+', label: 'часов контента' },
  { icon: Target, value: '10 мин', label: 'до персонального плана' },
  { icon: Bot, value: 'AI', label: 'ассистент в каждом уроке' },
];

const PANEL_BG =
  'bg-gradient-to-br from-mp-blue-500 to-mp-blue-700 text-white';

/* ── Shared pieces ───────────────────────────────────────── */

function AxesChips() {
  return (
    <div className="flex flex-wrap gap-2">
      {AXES.map((axis) => (
        <span
          key={axis}
          className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white/90"
        >
          {axis}
        </span>
      ))}
    </div>
  );
}

function StatGrid({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const iconCls = size === 'lg' ? 'h-6 w-6' : 'h-5 w-5';
  const valueCls = size === 'lg' ? 'text-xl' : 'text-lg';
  return (
    <div className="grid grid-cols-2 gap-3">
      {STATS.map(({ icon: Icon, value, label }) => (
        <div
          key={label}
          className="flex items-center gap-3 rounded-xl border border-white/20 bg-white/10 p-4"
        >
          <Icon className={`${iconCls} shrink-0 text-mp-green-400`} aria-hidden />
          <div>
            <div className={`${valueCls} font-bold leading-none text-mp-green-400`}>
              {value}
            </div>
            <div className="mt-1 text-xs leading-tight text-white/75">{label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function PriceCompare() {
  return (
    <div className="rounded-xl bg-white/10 p-4 text-sm">
      <div className="text-white/60 line-through">{PRICE_OLD}</div>
      <div className="mt-1 text-base font-bold text-mp-green-400">{PRICE_NEW}</div>
    </div>
  );
}

function RadarBg() {
  return (
    <svg
      className="pointer-events-none absolute -right-12 -top-10 h-64 w-64 opacity-10"
      viewBox="0 0 200 200"
      aria-hidden
    >
      <polygon
        points="100,20 169,60 169,140 100,180 31,140 31,60"
        fill="none"
        stroke="white"
        strokeWidth="1"
      />
      <polygon
        points="100,55 134,75 134,125 100,145 66,125 66,75"
        fill="none"
        stroke="white"
        strokeWidth="1"
      />
      {[
        [100, 20], [169, 60], [169, 140], [100, 180], [31, 140], [31, 60],
      ].map(([x, y]) => (
        <line key={`${x}-${y}`} x1="100" y1="100" x2={x} y2={y} stroke="white" strokeWidth="1" />
      ))}
    </svg>
  );
}

/* ── Public exports ──────────────────────────────────────── */

/** Compact value teaser — used at the top of the mobile stack. */
export function RegisterValueTeaser({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded-2xl ${PANEL_BG} p-6 ${className}`}>
      <h2 className="text-xl font-bold leading-tight">{HEADLINE}</h2>
      <p className="mt-2 text-sm leading-snug text-white/80">{SUBHEAD}</p>
      <div className="mt-4">
        <AxesChips />
      </div>
    </div>
  );
}

/** Stats + price block — used below the form on the mobile stack. */
export function RegisterValueStats({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-col gap-4 rounded-2xl ${PANEL_BG} p-6 ${className}`}>
      <StatGrid />
      <PriceCompare />
    </div>
  );
}

/** Full-height value panel — the desktop right column. */
export function RegisterValuePanel({ className = '' }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl ${PANEL_BG} p-10 ${className}`}>
      <RadarBg />
      <div className="relative flex h-full flex-col gap-6">
        <div>
          <h2 className="max-w-md text-2xl font-bold leading-tight">{HEADLINE}</h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-white/80">{SUBHEAD}</p>
        </div>
        <AxesChips />
        <StatGrid size="lg" />
        <div className="mt-auto">
          <PriceCompare />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm test -- register-value-panel`
Expected: PASS (3 describe blocks, all assertions green).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/register/value-panel.tsx apps/web/tests/unit/register-value-panel.test.tsx
git commit -m "feat(register): value panel components (teaser/stats/full)"
```

---

## Task 2: Полноширинный лейаут для `/register`

**Files:**
- Create: `apps/web/src/app/register/layout.tsx`

Note: на этом шаге создаём только файл лейаута. Перенос самой страницы из `(auth)` — в Task 3 (одним коммитом с её перепроводкой), чтобы не было промежуточного состояния с двумя `/register`.

- [ ] **Step 1: Create the full-width layout file**

Create `apps/web/src/app/register/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import { Logo } from '@/components/shared/Logo';

export const metadata: Metadata = {
  title: 'Регистрация',
  description:
    'Зарегистрируйтесь на платформе MPSTATS Academy — AI-диагностика, персональная программа и AI-ассистент в каждом уроке.',
};

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-mp-gray-50">
      {/* Header */}
      <header className="border-b border-mp-gray-200 bg-white">
        <div className="container mx-auto px-4 h-16 flex items-center">
          <Logo size="md" />
        </div>
      </header>

      {/* Content — full width (no max-w-md centering) */}
      <main className="flex-1 flex items-center py-8 lg:py-0">
        <div className="w-full">{children}</div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-caption text-mp-gray-500 bg-white border-t border-mp-gray-200">
        &copy; 2025 MPSTATS Academy
      </footer>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck the new file compiles**

Run: `pnpm typecheck`
Expected: PASS. (На этом шаге появится 2 потенциальных маршрута `/register` — `(auth)/register` и `register`. Next разрулит при сборке, но НЕ запускать `pnpm dev`/`build` до Task 3, где старый удаляется. Typecheck конфликта маршрутов не видит — это ок.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/register/layout.tsx
git commit -m "feat(register): full-width layout shell (no centered max-w)"
```

---

## Task 3: Перенос страницы из `(auth)` + перепроводка в сплит

**Files:**
- Move: `apps/web/src/app/(auth)/register/page.tsx` → `apps/web/src/app/register/page.tsx`
- Move: `apps/web/src/app/(auth)/register/register-form.tsx` → `apps/web/src/app/register/register-form.tsx`
- Modify: `apps/web/src/app/register/page.tsx` (после переноса)

- [ ] **Step 1: Move the page files out of the (auth) group**

Run (URL `/register` не меняется — скобочные группы не влияют на путь):

```bash
git mv "apps/web/src/app/(auth)/register/page.tsx" "apps/web/src/app/register/page.tsx"
git mv "apps/web/src/app/(auth)/register/register-form.tsx" "apps/web/src/app/register/register-form.tsx"
```

После переноса каталог `apps/web/src/app/(auth)/register/` должен исчезнуть (стать пустым). Проверка:

```bash
ls "apps/web/src/app/(auth)/register" 2>/dev/null && echo "STILL EXISTS — remove leftover" || echo "OK: removed"
```

`register-form.tsx` импортируется в `page.tsx` как `'./register-form'` — относительный путь сохраняется после совместного переноса, править не нужно.

- [ ] **Step 2: Rewrite page.tsx to render the split layout**

Replace the `return (...)` block in `apps/web/src/app/register/page.tsx`. The full file becomes:

```tsx
import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  REFERRAL_COOKIE_NAME,
  isValidRefCodeShape,
} from '@/lib/referral/attribution';
import { createClient } from '@/lib/supabase/server';
import {
  RegisterValuePanel,
  RegisterValueTeaser,
  RegisterValueStats,
} from '@/components/register/value-panel';
import { RegisterForm } from './register-form';

function resolveRefCode(urlRef: string | undefined, cookieRef: string | undefined): string | null {
  // URL ?ref= takes precedence over cookie (explicit user action wins).
  const candidate = (urlRef ?? cookieRef ?? '').toUpperCase();
  if (!candidate) return null;
  return isValidRefCodeShape(candidate) ? candidate : null;
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: { ref?: string };
}) {
  // Authed users hitting /register (e.g. via someone else's referral link)
  // should not see the form — show them the platform instead.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect('/learn');

  const cookieStore = cookies();
  const cookieRef = cookieStore.get(REFERRAL_COOKIE_NAME)?.value;
  const refCode = resolveRefCode(searchParams.ref, cookieRef);

  return (
    <div className="container mx-auto px-4 py-8 lg:py-12">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:gap-10 lg:items-stretch">
        {/* LEFT: (mobile teaser when no ref) + form + (mobile stats) */}
        <div className="flex flex-col gap-6">
          {/* On mobile, when a referral is present the form's own
              "🎁 +N дней" banner is the most relevant context, so the
              generic teaser is suppressed to avoid stacking two blocks. */}
          {!refCode && <RegisterValueTeaser className="lg:hidden" />}
          <Suspense fallback={<div className="animate-pulse text-gray-400">Загрузка...</div>}>
            <RegisterForm initialRefCode={refCode} />
          </Suspense>
          <RegisterValueStats className="lg:hidden" />
        </div>

        {/* RIGHT: desktop-only full value panel */}
        <RegisterValuePanel className="hidden lg:flex" />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS, и теперь только один маршрут `/register`.

- [ ] **Step 4: Build to confirm no route conflict / RSC errors**

Run: `cd apps/web && pnpm build`
Expected: SUCCESS. Сборка падает на дублирующихся маршрутах — успех подтверждает, что старый `(auth)/register` удалён корректно.

- [ ] **Step 5: Commit**

```bash
git add -A "apps/web/src/app"
git commit -m "feat(register): split layout — form left, value panel right

Move /register out of the centered (auth) group into its own
full-width layout and render form + value panel side-by-side.
Mobile stacks teaser -> form -> stats; teaser is suppressed when a
referral code is present (form banner covers the context)."
```

---

## Task 4: Полная верификация

**Files:** none (verification only)

- [ ] **Step 1: Run the full web unit suite**

Run: `cd apps/web && pnpm test`
Expected: PASS, 0 failures (новый `register-value-panel` среди них; ранее зелёные тесты не сломаны).

- [ ] **Step 2: Typecheck all packages**

Run: `pnpm typecheck`
Expected: PASS (все пакеты).

- [ ] **Step 3: Visual smoke (manual)**

Run: `cd apps/web && pnpm dev`, открыть:
- `http://localhost:3000/register` — десктоп: форма слева (≤440px), синяя панель справа (заголовок, 5 чипов-осей, 4 карточки-цифры на lucide-иконках, блок цены внизу, радар-силуэт фоном). Цифры зелёные, эмодзи отсутствуют.
- Сузить окно до мобильного — порядок: тизер сверху → форма → цифры/цена; всё в одну колонку.
- `http://localhost:3000/register?ref=TESTCODE` — на мобиле верхний generic-тизер отсутствует (вместо него внутри формы баннер «+N дней» при валидном коде).
- `http://localhost:3000/login` — не изменился (центрированная карточка как раньше).

Expected: всё совпадает с описанием. Замечания по визуалу (отступы, размеры) фиксируем отдельно — это polish, не блок плана.

- [ ] **Step 4: Final commit (if any polish tweaks were made)**

```bash
git add -A
git commit -m "chore(register): visual polish after smoke check"
```

(Если правок не было — шаг пропустить.)

---

## Self-Review notes

- **Spec coverage:** раскладка C (Task 3 grid `minmax(0,440px)_1fr`), контент v2 без «5 направлений» как цифры — оси чипами, 400+/150+ раздельно (Task 1 `STATS`/`AXES`), lucide вместо эмодзи (Task 1 + тест-страж), мобайл тизер→форма→цифры + подавление тизера при ref (Task 3), вывод из `(auth)` (Task 2+3), логика формы не тронута (только `git mv`). Всё покрыто.
- **Type consistency:** экспорты `RegisterValuePanel`/`RegisterValueTeaser`/`RegisterValueStats` и проп `className` едины в Task 1, тестах (Task 1) и `page.tsx` (Task 3).
- **No placeholders:** все шаги содержат полный код/команды и ожидаемый результат.
