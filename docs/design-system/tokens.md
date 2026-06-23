# Tokens — общие основания (обе системы)

**Обновлено:** 2026-06-16
**Источник:** `apps/web/tailwind.config.ts`, `apps/web/src/styles/globals.css`, inline-константы в маркет-page-файлах.

> Прочитай [README.md](./README.md) сначала — на платформе две визуальные системы (маркетинг dark / продукт light). Этот файл — общая база для обеих + маппинг между ними.

---

## 1. Brand-палитра — `mp-*` шкалы (`tailwind.config.ts`)

Единый источник цвета для **продукта** (используется напрямую как `bg-mp-blue-500`) и косвенно для **маркетинга** (inline-hex — это вынесенные «осколки» этих шкал).

```
mp-blue:  50 #E8ECFE · 100 #D1DAFD · 200 #A3B5FB · 300 #7590FA · 400 #4768F8
          500 #2C4FF8 · 600 #233FC6 · 700 #1A2F95 · 800 #122063 · 900 #091032
mp-green: 50 #F3FEE7 · 100 #E7FDCF · 200 #CFFB9F · 300 #B7F96F · 400 #9FF73F
          500 #87F50F · 600 #6CC40C · 700 #519309 · 800 #366206 · 900 #1B3103
mp-pink:  50 #FEF0F4 · 100 #FDD1E3 · 200 #FCA3D3 · 300 #FB75B6 · 400 #FA479A
          500 #FF168A · 600 #CC125F · 700 #990D47 · 800 #66092F · 900 #330418
mp-gray:  50 #F9FAFB · 100 #F3F4F6 · 200 #E5E7EB · 300 #D1D5DB · 400 #9CA3AF
          500 #6B7280 · 600 #4B5563 · 700 #374151 · 800 #1F2937 · 900 #111827
```

**Градиенты** (config): `bg-mp-accent-gradient` = `linear-gradient(90deg,#CCFF96 0%,#CEFFF4 100%)`; `bg-mp-hero-gradient` = `linear-gradient(135deg,#E8ECFE 0%,#F3FEE7 100%)`. На v8-маркетинге не используются (плоские секции); в продукте `bg-mp-hero-gradient` = вариант `gradient` у `<Card>`.

**Тени** (config): `mp-sm`, `mp`, `mp-md`, `mp-lg`, плюс `mp-card` = `0 2px 8px rgba(9,16,50,0.08)`, `mp-card-hover` = `0 8px 24px rgba(9,16,50,0.12)`. Используются в продукте; маркет-карты чаще поднимаются без тени (`hover:-translate-y-1`).

---

## 2. Маркетинг — inline-hex константы

Копируются в начало каждого маркет-`page.tsx` (дословно):

```tsx
const BLUE = '#2C4FF8';        // основной — кнопки, ссылки, акцентные карты
const BLUE_HOVER = '#1D39C1';  // hover основной кнопки  (нет в mp-шкале)
const ORANGE = '#ff6b16';      // бейдж «Рекомендуем», акцентная bento-карта
const GREEN = '#87F50F';       // радар-заливка, success-акцент
const DARK = '#0F172A';        // тёмные секции (hero, CTA)  (нет в mp-шкале)
const GRAY_BG = '#f4f4f4';     // светло-серые секции (чередование)  (нет в mp-шкале)
const TEXT = '#121212';        // основной текст на светлом  (нет в mp-шкале)
```

Зашиты также в v8-компонентах: `V8Footer` тело = **`#0a0f1e`** (темнее `DARK`); `StickyCTA` бар = `rgba(15,23,42,0.95)`; `Logo` primary `#2C4FF8`, текст по умолчанию `#323131`, white-вариант `#FFFFFF`.

**Расширенная палитра маркетинга** (about/roadmap — статусы/эксперты/таймлайн, помимо 7 базовых):

```
#10B981  emerald  — статус «Готово», success-дот, акцент эксперта
#8B5CF6  violet   — акцент эксперта
#9CA3AF  gray-400 — статус «Исследуем» (== mp-gray-400)
```

**Opacity-suffix трюк** (about/roadmap): inline-вычисление прозрачности через конкатенацию hex-альфы — `${BLUE}15`, `${BLUE}20`, `${BLUE}10`, `${col.color}15`. Даёт тонированный фон/линию без отдельной rgba-строки.

**rgba-оверлеи** на тёмном фоне: текст `rgba(255,255,255,0.7/0.6/0.5)`, бордеры `rgba(18,18,18,0.1)`, SVG-stroke `rgba(255,255,255,0.85)`. На светлом текст приглушается `style={{ color: TEXT, opacity: 0.7 }}` или `text-[#121212]/70`.

---

## 3. Продукт — shadcn CSS-переменные (`globals.css` `:root`)

Семантические токены для app-зоны. Значения в HSL; в скобках — hex-эквивалент / `mp-*`.

| Токен | HSL | ≈ |
|---|---|---|
| `--background` | `210 20% 98%` | #F9FAFB (mp-gray-50) — фон страниц |
| `--foreground` | `222 47% 11%` | #111827 (mp-gray-900) — основной текст |
| `--card` | `0 0% 100%` | #FFFFFF |
| `--card-foreground` | `222 47% 11%` | mp-gray-900 |
| `--primary` | `228 94% 57%` | #2C4FF8 (mp-blue-500) |
| `--primary-foreground` | `0 0% 100%` | #FFFFFF |
| `--secondary` | `220 14% 96%` | #F3F4F6 (mp-gray-100) |
| `--secondary-foreground` | `218 20% 27%` | mp-gray-700 |
| `--muted` | `220 14% 96%` | mp-gray-100 |
| `--muted-foreground` | `220 9% 46%` | #6B7280 (mp-gray-500) |
| `--accent` | `89 92% 51%` | #87F50F (mp-green-500) |
| `--accent-foreground` | `231 73% 12%` | mp-blue-900 |
| `--destructive` | `0 84% 60%` | красный |
| `--success` | `89 92% 51%` | mp-green-500 |
| `--warning` | `38 92% 50%` | янтарный |
| `--featured` | `330 100% 54%` | #FF168A (mp-pink-500) |
| `--border` / `--input` | `220 13% 91%` | #E5E7EB (mp-gray-200) |
| `--ring` | `228 94% 57%` | mp-blue-500 (фокус-кольцо) |
| `--radius` | `0.5rem` | 8px |

`.dark` блок существует, но продукт работает в light по умолчанию (тёмная тема app-зоны не используется).

**`--landing-*` переменные** в `globals.css` — легаси для старых design-* прототипов, **не используются** ни текущим v8-маркетингом, ни продуктом. Игнорировать.

---

## 4. Шрифты

- **Root** `app/layout.tsx`: `Inter({ subsets:['latin','cyrillic'] })` на `<body>` → дефолт всего приложения = **Inter**. Это шрифт **продукта**.
- **Маркет-страницы**: каждая переопределяет на **Onest** через `next/font/google`, оборачивая контент в `<div className={onest.className}>`:
  ```tsx
  const onest = Onest({ subsets:['latin','cyrillic'], weight:['400','500','700'], display:'swap' });
  ```
  Веса только **400/500/700** — `font-semibold` (600) упадёт на ближайший. Используй `font-medium`/`font-bold`.

⚠️ **Новая маркет-страница ОБЯЗАНА сама подключить Onest**, иначе унаследует Inter и будет выбиваться. (`/courses` исторически ставит Onest через `<link>` + `fontFamily` — легаси; новый код — через `next/font` как на главной.)

config `fontFamily`: `sans` и `heading` = `Inter, system-ui, -apple-system`.

---

## 5. Тайпскейл — две нотации

**Продукт** (семантические токены, `tailwind.config.ts` `fontSize`):

| Класс | size / lh / ls / weight |
|---|---|
| `text-display-lg` | 3.5rem / 1.1 / -0.02em / 700 |
| `text-display` | 3rem / 1.1 / -0.02em / 700 |
| `text-display-sm` | 2.25rem / 1.2 / -0.02em / 700 |
| `text-heading-xl` | 1.875rem / 1.3 / -0.01em / 600 |
| `text-heading-lg` | 1.5rem / 1.4 / -0.01em / 600 |
| `text-heading` | 1.25rem / 1.4 / 600 |
| `text-heading-sm` | 1.125rem / 1.5 / 600 |
| `text-body-lg` | 1.125rem / 1.6 |
| `text-body` | 1rem / 1.6 |
| `text-body-sm` | 0.875rem / 1.5 |
| `text-caption` | 0.75rem / 1.4 |

**Маркетинг** (произвольные px) — полная таблица в [dark.md §2](./dark.md). Кратко: H1 hero `text-[28px] sm:text-[36px] md:text-[48px] lg:text-[56..64px] font-bold`; H2 `text-[24px] sm:text-[32px] md:text-[40px] font-bold`; body `text-[15px] sm:text-[17px]`.

---

## 6. Радиусы — иерархия

| | Маркетинг | Продукт |
|---|---|---|
| Кнопки | `rounded-full` | `rounded-lg` (8px, = `--radius`) |
| Инпуты | (нет канона — pill `rounded-full` промокода) | `rounded-lg` (8px) |
| Карты | `rounded-[40px]` крупные → `[32px]` → `[24px]` моб. | `rounded-xl` (12px) |
| Бейджи/чипы | `rounded-full` | `rounded-full` |
| Footer | `rounded-t-[40px]` (только у V8Footer) | — |

config `borderRadius`: `lg` = `var(--radius)` (8px), `md` = calc −2px (6px), `sm` = calc −4px (4px). `rounded-xl` — Tailwind-дефолт (12px), не из config-var.

---

## 7. «Когда что» — быстрый выбор

- Строю **публичный лендинг** → Onest + inline-hex + v8-компоненты + inline-SVG. [dark.md](./dark.md).
- Строю **app/admin-экран** → Inter + shadcn `components/ui/*` + `mp-*`/семантические токены + lucide. [light.md](./light.md).
- Нужен **синий акцент** в любой системе → `#2C4FF8` (он же `mp-blue-500`, он же `BLUE`).
- Нужен **success/зелёный** → `#87F50F` (`mp-green-500` / `GREEN`).
- Сомневаюсь в цвете текста на светлом → продукт `text-mp-gray-900`; маркетинг `TEXT #121212`.
