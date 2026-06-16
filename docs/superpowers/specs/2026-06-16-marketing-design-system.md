# MAAL Marketing Design System — Guideline

**Дата:** 2026-06-16
**Цель:** Дать инженеру всё необходимое, чтобы собрать НОВУЮ маркетинговую страницу (в первую очередь `/register`), которая выглядит нативно на сайте — **переиспользуя** существующие компоненты и токены, а не изобретая заново.

**Источник правды (прочитанный код):**
- `apps/web/src/app/page.tsx` — главная (hero, bento, steps, comparison, pricing, faq, CTA)
- `apps/web/src/app/courses/page.tsx` — каталог
- `apps/web/src/app/skill-test/page.tsx` — лендинг диагностики
- `apps/web/src/app/pricing/page.tsx` — тарифы
- `apps/web/src/components/v8/{V8Header,V8Footer,Counter,Reveal,StickyCTA,CourseAccessCTA}.tsx`
- `apps/web/src/components/shared/Logo.tsx`
- `apps/web/tailwind.config.ts`, `apps/web/src/styles/globals.css`

> **Важно про "v8".** Маркетинговый сайт построен на наборе компонентов `components/v8/*` + per-page inline-токены. Это самостоятельная дизайн-система поверх Tailwind. Семантические токены shadcn (`--primary`, `bg-background` и т.д.) из `globals.css` — для **внутренних** (app) страниц, не для маркетинга. На маркетинге цвета задаются **inline-константами** (см. ниже) и произвольными значениями Tailwind (`bg-[#0F172A]`).

---

## 1. Foundations (основания)

### 1.1 Шрифт — Onest (не Inter!)

Корневой `app/layout.tsx` грузит **Inter** глобально (`const inter = Inter({ subsets: ['latin','cyrillic'] })`, `<body className={inter.className}>`). НО **каждая маркетинговая страница переопределяет шрифт на Onest** через `next/font/google`, применяя его на корневой `<div>` страницы:

```tsx
import { Onest } from 'next/font/google';

const onest = Onest({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '700'],
  display: 'swap',
});

// в JSX корень страницы:
<div className={onest.className} style={{ color: TEXT }}>
```

- Веса в проде: **400 (regular), 500 (medium), 700 (bold)**. Промежуточных (600) нет — `font-semibold` ≈ упадёт на ближайший доступный; в маркетинге используется `font-medium` (500) и `font-bold` (700).
- `/courses/page.tsx` дополнительно ставит `style={{ fontFamily: "'Onest', sans-serif" }}` на корень + внешний `<link>` Google Fonts (легаси-приём; для новой страницы используй `next/font` как на главной).
- **Для новой страницы:** копируй блок `const onest = Onest({...})` и оборачивай весь контент в `<div className={onest.className} style={{ color: TEXT }}>`.

### 1.2 Inline-константы цветов (копируются в каждый page.tsx)

Дословно из `page.tsx`, `skill-test/page.tsx`, `pricing/page.tsx`:

```tsx
const BLUE = '#2C4FF8';        // основной — кнопки, ссылки, акцентные карточки
const BLUE_HOVER = '#1D39C1';  // hover основной кнопки
const ORANGE = '#ff6b16';      // бейдж «Рекомендуем», акцентная bento-карточка
const GREEN = '#87F50F';       // радар-заливка, success-акцент
const DARK = '#0F172A';        // тёмные секции (hero, CTA)
const GRAY_BG = '#f4f4f4';     // светло-серые секции (чередование)
const TEXT = '#121212';        // основной цвет текста на светлом
```

Дополнительно зашиты в компонентах:
- **`V8Header`**: `BLUE = #2C4FF8`, `BLUE_HOVER = #1D39C1`, `TEXT = #121212`
- **`V8Footer`**: `DARK = #0F172A`, `BLUE = #2C4FF8`, и сам футер — **`#0a0f1e`** (темнее, чем DARK секций)
- **`StickyCTA`**: фон бара `rgba(15,23,42,0.95)` (= DARK с прозрачностью), кнопка `BLUE`
- **`Logo`**: primary `#2C4FF8`, текст по умолчанию `#323131`, white-вариант `#FFFFFF`

### 1.3 Tailwind brand-шкалы (`tailwind.config.ts`)

Доступны как `mp-blue-{50..900}`, `mp-green-*`, `mp-pink-*`, `mp-gray-*`. Маркетинг **редко** их использует (предпочитает inline-hex), но они есть:

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

> Заметь: `mp-blue-500 = #2C4FF8` == inline `BLUE`. `mp-green-500 = #87F50F` == `GREEN`. Inline-константы — это просто «осколки» этих шкал, вынесенные для удобства per-page. `mp-blue-500` ≠ `TEXT (#121212)` и ≠ `DARK (#0F172A)` — те hex'ы вне шкал.

**Градиенты** (config): `bg-mp-accent-gradient` = `linear-gradient(90deg,#CCFF96 0%,#CEFFF4 100%)`, `bg-mp-hero-gradient` = `linear-gradient(135deg,#E8ECFE 0%,#F3FEE7 100%)`. На v8-маркетинге **не используются** (секции — плоские цвета).

**Тени** (config, редко на маркетинге): `shadow-mp-card` = `0 2px 8px rgba(9,16,50,0.08)`, `shadow-mp-card-hover` = `0 8px 24px rgba(9,16,50,0.12)`. Маркетинговые карточки чаще используют hover-подъём без тени.

### 1.4 Контейнер и отступы (повторяются на каждой секции)

```
Контейнер:           max-w-[1160px] mx-auto
Горизонт. паддинг:   px-4 sm:px-6 md:px-10 lg:px-0
```

`lg:px-0` — на больших экранах паддинг убирается, центрирование держит `max-w-[1160px]`.

> Вариативность: `courses/page.tsx` использует упрощённый `px-4 sm:px-6` (без `md:px-10 lg:px-0`). `pricing/page.tsx` ставит `px-6` на секции + более узкие внутренние контейнеры (`max-w-[800px]`, `max-w-[1040px]`, `max-w-[720px]`, `max-w-[600px]`). **Канон (главная + skill-test): `px-4 sm:px-6 md:px-10 lg:px-0` + `max-w-[1160px]`.** Для новой страницы бери канон.

### 1.5 Вертикальный ритм секций

```
Канон (главная, skill-test):   py-[80px] sm:py-[120px]
Hero (главная, skill-test):    pt-[120px] sm:pt-[140px] pb-[80px] sm:pb-[120px]
Pricing-вариант:               py-[80px] sm:py-[100px]   (чуть компактнее)
Pricing hero:                  pt-[140px] pb-[80px] sm:pt-[160px] sm:pb-[100px]
Courses-вариант (легаси):      py-16 sm:py-24            (Tailwind-шкала, не px)
```

Hero всегда имеет увеличенный `pt-[120px]+` — потому что `V8Header` `fixed` (высота 64–72px) и контент уезжает под него.

---

## 2. Type scale (типографика)

Все размеры — произвольные значения Tailwind (`text-[NNpx]`). Веса: `font-medium` (500) / `font-bold` (700). Канонические строки (дословно):

| Роль | Класс (verbatim) |
|---|---|
| **H1 hero (главная)** | `text-[28px] sm:text-[36px] md:text-[48px] lg:text-[64px] font-bold leading-[1.1] tracking-tight text-white` |
| **H1 hero (skill-test)** | `text-[28px] sm:text-[36px] md:text-[48px] lg:text-[56px] font-bold leading-[1.1] tracking-tight text-white` |
| **H1 hero (pricing)** | `text-[36px] sm:text-[48px] md:text-[56px] font-bold leading-[1.1] tracking-tight text-white` |
| **H2 секций** | `text-[24px] sm:text-[32px] md:text-[40px] font-bold tracking-tight` (pricing: `text-[28px] sm:text-[36px] font-bold`) |
| **H3 крупная карточка (bento/радар)** | `text-[24px] sm:text-[28px] lg:text-[32px] font-bold leading-tight` |
| **H3 карточка средняя** | `text-[20px] sm:text-[22px] font-bold` (или `sm:text-[24px]`) |
| **H3 step / for-who карточка** | `text-[17px] sm:text-[19px] font-bold leading-tight` |
| **H3 результат / ось (skill-test)** | `text-[18px] sm:text-[20px] font-bold` |
| **Body hero (подзаголовок)** | `text-[16px] sm:text-[18px] leading-relaxed` (цвет `rgba(255,255,255,0.7)`) |
| **Body секций** | `text-[15px] sm:text-[17px] leading-relaxed` |
| **Body карточек** | `text-[15px] sm:text-[16px] leading-relaxed` |
| **Описание step-карточки** | `text-[14px] sm:text-[15px] leading-relaxed` |
| **FAQ вопрос** | `text-[17px] sm:text-[19px] font-medium` |
| **FAQ ответ** | `text-[15px] sm:text-[16px] leading-relaxed` |
| **Цена (число)** | `text-[36px] sm:text-[44px] font-bold leading-none` |
| **Counter / большая стата (400+)** | `text-[56px] sm:text-[64px] font-bold leading-none` |
| **Название плана / caption uppercase** | `text-[13px] font-medium uppercase tracking-wider` (или `text-[14px] ... tracking-wider`) |
| **Мелкий текст / meta** | `text-[12px]`…`text-[13px] sm:text-[14px]` |

Текст на тёмном фоне приглушается через `text-white/70`, `text-white/60`, `text-white/50`, `text-white/40`, либо inline `rgba(255,255,255,0.7)`. Текст на светлом — `style={{ color: TEXT, opacity: 0.7 }}` или `text-[#121212]/70`.

---

## 3. Header — `V8Header`

`apps/web/src/components/v8/V8Header.tsx`. Один проп: `onDarkHero?: boolean` (default **`true`**).

**Поведение:**
- `fixed top-0 left-0 right-0 z-50 transition-all duration-300`.
- Высота строки: `h-[64px] sm:h-[72px]`. Внутренний контейнер: `max-w-[1160px] mx-auto ... px-4 sm:px-6 md:px-10 lg:px-0`.
- Слушает scroll: `scrolled = window.scrollY > 40`.
- `isLight = onDarkHero && !scrolled` → пока true: **лого `variant="white"`**, ссылки `rgba(255,255,255,0.85)`, бургер белый, фон навбара `transparent`.
- При `scrolled` (или `onDarkHero={false}`): фон `rgba(255,255,255,0.98)`, нижний бордер `1px solid rgba(18,18,18,0.06)`, лого `variant="default"`, ссылки `#121212`.
- Логотип: `<Logo size="sm" variant={logoVariant} href="/" />`.

**Nav-ссылки (`NAV_LINKS`):** Платформа `/` · Каталог `/courses` · Диагностика `/skill-test` · Тарифы `/pricing` · О нас `/about`. Класс ссылки: `text-[14px] font-medium transition-colors hover:opacity-80`.

**Правый блок:** если авторизован — аватар (круг `w-8 h-8 rounded-full`, фон `BLUE`, инициалы) + имя; если нет — ссылка «Войти» (`/login`). Затем CTA-кнопка:
```
inline-flex items-center justify-center rounded-full h-[44px] px-6 text-[14px] font-medium text-white transition-colors
style={{ backgroundColor: BLUE }}  // hover → BLUE_HOVER через onMouseEnter/Leave
```
CTA href динамический: авторизован → `/diagnostic`; на `/skill-test` → `/register`; иначе → `/skill-test`. Лейбл всегда «Пройти диагностику».

**Мобайл:** бургер (3 полоски `w-5 h-[2px]`) → дропдаун `bg-white`, ссылки `py-3 text-[15px]`, плюс пункт `/roadmap`, и full-width CTA `rounded-full h-[48px] w-full`.

**Как переиспользовать на новой странице:**
- Страница с **тёмным hero** (как `/register` предполагается) → `<V8Header onDarkHero={true} />` (можно опустить — это дефолт). Лого и ссылки будут белыми поверх тёмного hero и станут тёмными при скролле.
- Страница со **светлым hero** → `<V8Header onDarkHero={false} />` — навбар сразу белый.

---

## 4. Footer — `V8Footer`

`apps/web/src/components/v8/V8Footer.tsx`. Один проп: `wrapperBg?: 'dark' | 'blue'` (default **`dark'`**).

**Структура:**
```
<div style={{ backgroundColor: wrapperColor }}>     // wrapperColor: 'blue'→#2C4FF8, 'dark'→#0F172A
  <footer className="bg-[#0a0f1e] rounded-t-[40px] pt-12 sm:pt-16 pb-8 px-4 sm:px-6 md:px-10 lg:px-0">
    <div className="max-w-[1160px] mx-auto"> ... </div>
  </footer>
</div>
```

- Тело футера — **`#0a0f1e`** (темнее DARK), со скруглением сверху `rounded-t-[40px]`. Внешний `<div>` красится в цвет **секции, которая идёт прямо над футером** — чтобы скругление читалось как переход. Поэтому если секция над футером — `BLUE`, ставь `wrapperBg="blue"` (так делает `skill-test`); если `DARK` — `wrapperBg="dark"` (главная, courses, pricing).
- 4 колонки (`grid grid-cols-2 md:grid-cols-4`): Brand (лого `variant="white"` + слоган `text-white/40`) + «Платформа» / «Компания» / «Юридическое».
- Заголовки колонок: `text-[13px] font-medium text-white/40 uppercase tracking-wider`. Ссылки: `text-[14px] text-white/60 hover:text-white`.
- Копирайт-строка: `text-[13px] text-white/30`, год через `new Date().getFullYear()`.

**Как переиспользовать:** последняя секция страницы → выбери её фон; передай `wrapperBg` соответствующего цвета. Для `/register` с тёмным CTA-низом → `<V8Footer wrapperBg="dark" />`.

---

## 5. Buttons (кнопки)

Все кнопки — **`rounded-full`**, `font-medium`, `transition-colors`. Hover основной синей делается inline через `onMouseEnter/onMouseLeave` (переключение `backgroundColor` между `BLUE` и `BLUE_HOVER`), либо Tailwind `hover:bg-[#1D39C1]`.

**Primary (основная, на светлом/тёмном) — крупная (hero/CTA):**
```tsx
className="inline-flex items-center justify-center rounded-full h-[52px] sm:h-[62px] px-8 sm:px-10 text-[15px] sm:text-[16px] font-medium text-white transition-colors"
style={{ backgroundColor: BLUE }}
onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = BLUE_HOVER)}
onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = BLUE)}
```

**Primary — компактная (в навбаре):** `rounded-full h-[44px] px-6 text-[14px] font-medium text-white`, `bg BLUE`.

**Primary — на синем фоне (инверсная, белая кнопка):**
```
rounded-full h-[52px] sm:h-[58px] px-10 sm:px-12 text-[15px] sm:text-[16px] font-medium transition-colors
style={{ backgroundColor: 'white', color: BLUE }}  // hover bg → #e8e8e8
```

**Secondary / outline (на тёмном hero, рядом с primary):**
```
rounded-full h-[52px] sm:h-[62px] px-8 sm:px-10 text-[15px] sm:text-[16px] font-medium text-white border border-white/30 transition-colors hover:bg-white/10
```

**Outline на светлом (courses «Выбрать курс»):**
```
px-8 h-[52px] sm:h-[62px] rounded-full text-sm font-semibold border-2 border-[#121212] text-[#121212] hover:bg-[#121212] hover:text-white transition-colors
```

**Outline синий (pricing COURSE-карта):**
```
h-[52px] sm:h-[56px] rounded-full text-[15px] font-medium border-2 transition-colors
style={{ borderColor: BLUE, color: BLUE, backgroundColor: 'transparent' }}  // hover → bg BLUE, color #fff
```

**Текстовая ссылка-стрелка:**
```
inline-flex items-center gap-2 text-[14px] sm:text-[15px] font-medium whitespace-nowrap transition-opacity hover:opacity-80
style={{ color: BLUE }}
```

Высоты кнопок: hero/CTA `h-[52px] sm:h-[62px]` (или `sm:h-[58px]`); карточные/форменные `h-[52px] sm:h-[56px]`; навбар `h-[44px]`; промо/мелкие `h-[48px] sm:h-[52px]`; sticky `h-[40px] sm:h-[44px]`.

---

## 6. Cards (карточки)

Общий мотив hover: **`transition-transform duration-300 hover:-translate-y-1`** (карточка приподнимается на 1 единицу). `Reveal` спроектирован так, чтобы после входной анимации очистить inline-transform — тогда CSS-hover работает чисто (см. §9).

| Тип | Радиус | Паддинг | Фон / бордер |
|---|---|---|---|
| **Bento (главная)** | `rounded-[40px]` | `p-8` (крупные `p-8 sm:p-10`) | inline `backgroundColor` (BLUE/GRAY_BG/DARK/ORANGE) |
| **Pricing-карта** | `rounded-[40px]` | `p-7 sm:p-9` | COURSE: `border border-[#121212]/10` (белая); PLATFORM: `style={{backgroundColor: BLUE}}` (без бордера) |
| **Course-карта (каталог)** | `rounded-[40px]` | `p-8` | пастельный inline bg (`#cfd4fd`/`#fbc8c0`/`#c0f8fb`/`#c0dbfb`), `min-h-[320px]` |
| **Step-карта (как работает)** | `rounded-[32px]` | `p-6 sm:p-7` | белая, `min-h-[240px]` |
| **For-who карта** | `rounded-[40px]` | `p-8` | `border` `rgba(18,18,18,0.1)`, hover `hover:border-[#2C4FF8]/40` |
| **Результат / ось (skill-test)** | `rounded-[40px]` | `p-8` (крупная `p-8 sm:p-10`) | inline GRAY_BG или BLUE |
| **Comparison таблица (desktop)** | `rounded-[32px]` | — | `overflow-hidden border border-[#121212]/10` |
| **Comparison моб. карточки** | `rounded-[24px]` | — | `overflow-hidden border border-[#121212]/10` |
| **Catalog teaser** | `rounded-[32px]` | `p-6 sm:p-8` | белая |

**Радиус-иерархия:** `40px` (крупные feature-карты) → `32px` (step/таблица/teaser) → `24px` (моб. compact) → `rounded-full` (кнопки/чипы/бейджи). Для формы регистрации логично использовать input-поля с меньшим радиусом (см. promo-input pricing: `rounded-full` для pill-инпута; для прямоугольных полей — `rounded-2xl`/`rounded-xl` по вкусу, в текущем коде маркетинга прямоугольных инпутов нет — это пробел, см. §12).

Полный пример bento-карты (главная):
```tsx
<Reveal className="rounded-[40px] p-8 sm:p-10 flex flex-col justify-between min-h-[280px] lg:min-h-[400px] transition-transform duration-300 hover:-translate-y-1"
        style={{ backgroundColor: BLUE }} delay={0}>
```

---

## 7. Icons (иконки)

**Иконотека маркетинга = inline SVG-компоненты внутри page-файла. lucide-react на маркетинговых страницах НЕ используется** (lucide живёт в app/admin-зоне). Типичные локальные иконки:

- `CheckIcon` — `width="20" height="20" viewBox="0 0 24 24"`, `stroke="currentColor"` (или параметр `color`), `strokeWidth="2.5"`, `<polyline points="20 6 9 17 4 12" />`.
- `ChevronDown` — `24x24`, `strokeWidth="2"`, `<polyline points="6 9 12 15 18 9" />`, ротация `className={open ? 'rotate-180' : ''} transition-transform duration-200`.
- `ArrowRight` / `ArrowIcon` — `20x20`, стрелка вправо, hover-сдвиг `group-hover:translate-x-1`.
- `DashIcon` (pricing) — `20x20`, `stroke="#121212" opacity-20`, для «нет фичи».

**Презентация:** иконки **не** оборачиваются в цветные плитки-тайлы. Это либо inline-штрихи (галочки в списках фич, шевроны в FAQ), либо bare-кружки-точки (точки осей в радаре: `w-5 h-5 md:w-6 md:h-6 rounded-full` с цветным `backgroundColor`; индикаторы осей `w-2 h-2`/`w-3 h-3 rounded-full`). **Иконок мало — дизайн опирается на типографику, цвет и крупные карточки, а не на иконографику.** Для новой страницы: не добавляй декоративные иконочные тайлы — это будет чужеродно. Если нужна галочка-список — копируй `CheckIcon` (20px, BLUE) из pricing/skill-test.

---

## 8. Badges / chips (бейджи и чипы)

Все — `rounded-full`, мелкий текст.

- **Бейдж на тёмной карте:** `text-[12px] text-white/50 bg-white/10 rounded-full px-3 py-1`.
- **Чип на светлой карте:** `text-[12px] bg-[#121212]/5 rounded-full px-3 py-1`.
- **Step-бейдж (синий тонированный):** `text-[11px] sm:text-[12px] font-medium rounded-full px-3 py-1` + `style={{ backgroundColor: 'rgba(44,79,248,0.08)', color: BLUE }}`.
- **Бейдж «Рекомендуем» (pricing):** `absolute top-5 right-5 sm:top-6 sm:right-6 px-3.5 py-1 rounded-full text-[12px] font-medium text-white` + `style={{ backgroundColor: ORANGE }}`.
- **Маркетплейс-бейдж (courses):** WB `bg-[#CB11AB]/10 text-[#CB11AB]`, Ozon `bg-[#005BFF]/10 text-[#005BFF]`, общий `px-3 py-1 rounded-full text-xs font-semibold`.
- **Чип-переключатель (pricing course-picker):** `px-4 py-2 rounded-full text-[13px] sm:text-[14px] font-medium` + active `bg BLUE / color white`, inactive `bg rgba(18,18,18,0.05) / color TEXT`.

---

## 9. Stats / Counter

`apps/web/src/components/v8/Counter.tsx`. Анимированное число 0→`end` (easeOutCubic) при попадании в вьюпорт (`IntersectionObserver`, threshold 0.3).

**API:**
```tsx
<Counter
  end={400}            // обязательное число
  suffix="+"           // суффикс (опц.)
  prefix=""            // префикс (опц.)
  duration={1600}      // мс, default 1500
  delay={0}            // мс задержка старта
  format={true}        // ru-RU разделители тысяч ("3 000"), default true
  className="text-[56px] sm:text-[64px] font-bold leading-none text-white"
/>
```
Также экспортируется хук `useCountUp(end, duration, delay) → { ref, value }`. Стилизация — целиком через `className` (Counter сам ничего не красит). На главной используется один раз для «400+ уроков».

---

## 10. Motion (анимации)

### 10.1 `Reveal` (вход при скролле)

`apps/web/src/components/v8/Reveal.tsx`. Drop-in замена `<div>` с fade-up.

```tsx
<Reveal delay={0} distance={20} as="div" className="..." style={{...}}>...</Reveal>
```
- `IntersectionObserver` threshold 0.12, `rootMargin '0px 0px -60px 0px'`.
- Скрытое состояние: `opacity:0; transform: translateY(distance)` (default `distance=20`px).
- При появлении: `animation: v8-fade-up 600ms cubic-bezier(0.22,1,0.36,1) {delay}ms both`.
- Через `delay + 650ms` inline-стиль **очищается** (`done`), чтобы CSS-hover (`hover:-translate-y-1`) работал без конфликта с inline-transform. Это ключевой приём — не дублируй его руками.
- `as`: `'div' | 'section' | 'article' | 'header' | 'footer'`.

**Stagger-паттерн:** карточки в сетке получают возрастающую задержку. Каноны из кода: bento `delay={0/80/160/240/320}`, step `delay={i*80}`, for-who `delay={i*70}`, pricing `delay={0/100/200}`, courses `delay={i*80}`, skill-test results `delay={i*80}`, steps `delay={i*100}`.

Хук `useReveal<T>(delay, distance) → { ref, visible, style }` — для нестандартных случаев (на главной им анимируется раскрытие колонки в comparison-таблице).

### 10.2 `StickyCTA` (нижний липкий бар)

`apps/web/src/components/v8/StickyCTA.tsx`.
```tsx
<StickyCTA href="/skill-test" buttonLabel="Пройти диагностику"
  title="Не уверены, какой тариф выбрать?"
  subtitle="AI-диагностика за 10 минут подберет программу под вас."
  showAfter={700} />
```
- Появляется когда `scrollY > showAfter` (default 700). Слайд снизу: `translateY(140%) → 0`, `transition: transform 500ms cubic-bezier(0.22,1,0.36,1)`.
- Бар: `max-w-[880px] mx-auto rounded-full`, фон `rgba(15,23,42,0.95)`, `backdropFilter: blur(8px)`, тень `0 10px 30px rgba(15,23,42,0.25)`. Кнопка внутри — `BLUE`, `h-[40px] sm:h-[44px]`.

### 10.3 Keyframes (`globals.css`)

V8-кейфреймы определены в `apps/web/src/styles/globals.css`:
- `v8-fade-up` — `translateY(20px)+opacity0 → 0+1` (используется Reveal).
- `v8-radar-rotate` — `rotate(0→360deg)` (вращение радара).
- `v8-pulse` — пульс центральной точки радара (scale 1→1.5 + box-shadow ring).
- `v8-ring-pulse` — мигание колец радара (opacity 0.2↔0.7).

Радар-анимации (`v8-radar-rotate`, `v8-pulse`, `v8-ring-pulse`) применяются inline в `page.tsx`/`skill-test/page.tsx` к декоративному `SkillRadar`. Для формы регистрации они не нужны — упомянуты только по именам.

Прочие утилиты в globals.css (для app-зоны, не v8): `.animate-fade-in/slide-up/scale-in/pulse-glow/shimmer`, `.card-interactive`, `.card-link`. Глобально: `html { scroll-behavior: smooth }`, `@media (prefers-reduced-motion: reduce)` гасит все анимации, кастомный скроллбар, `::selection` синий.

---

## 11. Section background rhythm (чередование фонов)

Маркетинг чередует **DARK → white → GRAY_BG → white → … → DARK** + завершает футером со скруглением. Скругление `rounded-t-[40px]` на маркетинге фактически используется **только у футера** (`V8Footer`); между обычными секциями переходы — резкая смена плоского цвета (без скругления).

Фактический порядок секций (главная, дословно):

| # | Секция | Фон | rounded-t-[40px] |
|---|---|---|---|
| 1 | Hero | `#0F172A` (DARK) | — |
| 2 | Bento | white | — |
| 3 | Comparison | white | — |
| 4 | How it works | `#f4f4f4` (GRAY_BG) | — |
| 5 | For who | white | — |
| 6 | Mid CTA | `#2C4FF8` (BLUE) | — |
| 7 | Pricing | `#f4f4f4` (GRAY_BG) | — |
| 8 | FAQ | white | — |
| 9 | Footer CTA | `#0F172A` (DARK) | — |
| — | Footer | `#0a0f1e` (wrapper DARK) | **да** |

skill-test: DARK → white → GRAY_BG → white → BLUE, футер `wrapperBg="blue"`. pricing: DARK → white → GRAY_BG → white → GRAY_BG → DARK, футер `wrapperBg="dark"`.

**Правило:** соседние секции не должны быть одного цвета (кроме намеренных white+white как bento/comparison). Тёмный hero + тёмный финальный CTA «обрамляют» страницу. Цвет последней секции = `wrapperBg` футера.

---

## 12. REUSE CHECKLIST — собрать новую страницу (`/register`)

Конкретный чек-лист, чтобы страница выглядела нативно:

- [ ] **Шрифт:** объявь `const onest = Onest({ subsets:['latin','cyrillic'], weight:['400','500','700'], display:'swap' })`; оберни весь контент в `<div className={onest.className} style={{ color: TEXT }}>`.
- [ ] **Токены:** скопируй блок inline-констант (`BLUE`, `BLUE_HOVER`, `ORANGE`, `GREEN`, `DARK`, `GRAY_BG`, `TEXT`) в начало файла.
- [ ] **Header:** `import { V8Header }` → `<V8Header onDarkHero={true} />` если hero тёмный (`/register` с тёмным верхом → лого/нав белые до скролла); `onDarkHero={false}` если hero светлый.
- [ ] **Контейнер:** оборачивай контент каждой секции в `<div className="max-w-[1160px] mx-auto ...">`; для узких форм-контейнеров используй `max-w-[420px]`/`max-w-[520px]` mx-auto (как promo-input/hero-текст).
- [ ] **Гориз. паддинг:** `px-4 sm:px-6 md:px-10 lg:px-0` на секциях.
- [ ] **Верт. ритм:** секции `py-[80px] sm:py-[120px]`; hero `pt-[120px] sm:pt-[140px] pb-[80px] sm:pb-[120px]` (контент уезжает под fixed-хедер — обязателен крупный pt).
- [ ] **Фоны:** чередуй DARK/white/GRAY_BG; не ставь две одинаковые подряд; цвет последней секции = `wrapperBg` футера.
- [ ] **Заголовки:** H1 `text-[28px] sm:text-[36px] md:text-[48px] lg:text-[56px] font-bold leading-[1.1] tracking-tight`; H2 `text-[24px] sm:text-[32px] md:text-[40px] font-bold tracking-tight`.
- [ ] **Кнопки:** только `rounded-full`, `font-medium`. Primary — `bg BLUE` + hover `BLUE_HOVER` (inline onMouseEnter/Leave); крупная `h-[52px] sm:h-[62px] px-8 sm:px-10 text-[15px] sm:text-[16px] text-white`; форменная `h-[52px] sm:h-[56px]`. Submit-кнопку формы делай full-width primary.
- [ ] **Карточки:** контейнер формы — `rounded-[40px] p-8 sm:p-10` (бело-карточный вид) или прозрачный на секции; если интерактивная — добавь `transition-transform duration-300 hover:-translate-y-1`. Радиусы: 40/32/24, никаких произвольных.
- [ ] **Поля ввода:** в маркетинге нет готового input-стиля кроме pill-инпута promo (`rounded-full`, `border`, фон `#fff`, `style={{ color: TEXT }}`). Для формы используй существующие shadcn `Input`/`Label` из `components/ui` ЛИБО собери поля в духе: `h-[52px] rounded-2xl border border-[#121212]/10 px-4 text-[15px]` + focus-ring `ring-mp-blue-500` (есть в globals). Сверь визуально — это серая зона (см. §13).
- [ ] **Иконки:** inline SVG (`CheckIcon` 20px, `ChevronDown` 24px), без цветных тайлов. Не тащи lucide на маркетинг.
- [ ] **Бейджи/чипы:** `rounded-full px-3 py-1 text-[12px]`; на тёмном `bg-white/10 text-white/50`, на светлом `bg-[#121212]/5`.
- [ ] **Анимация входа:** оборачивай блоки в `<Reveal delay={...}>`; для сетки — stagger `delay={i*80}`.
- [ ] **Footer:** `<V8Footer wrapperBg="dark" />` (или `"blue"` если секция над футером синяя).
- [ ] **Существующие CTA-href'ы:** `/register` (регистрация), `/login`, `/skill-test` (диагностика), `/diagnostic` (для авторизованных), `/pricing`.
- [ ] **Reduced-motion:** ничего не делать — globals.css уже гасит анимации при `prefers-reduced-motion`.

**Минимальный скелет новой страницы:**
```tsx
'use client';
import { Onest } from 'next/font/google';
import { V8Header } from '@/components/v8/V8Header';
import { V8Footer } from '@/components/v8/V8Footer';
import { Reveal } from '@/components/v8/Reveal';

const onest = Onest({ subsets: ['latin','cyrillic'], weight: ['400','500','700'], display: 'swap' });
const BLUE = '#2C4FF8'; const BLUE_HOVER = '#1D39C1'; const DARK = '#0F172A';
const GRAY_BG = '#f4f4f4'; const TEXT = '#121212';

export default function Page() {
  return (
    <div className={onest.className} style={{ color: TEXT }}>
      <V8Header onDarkHero={true} />
      <section className="pt-[120px] sm:pt-[140px] pb-[80px] sm:pb-[120px] px-4 sm:px-6 md:px-10 lg:px-0" style={{ backgroundColor: DARK }}>
        <div className="max-w-[1160px] mx-auto">
          <Reveal>
            <h1 className="text-[28px] sm:text-[36px] md:text-[48px] lg:text-[56px] font-bold leading-[1.1] tracking-tight text-white">…</h1>
          </Reveal>
        </div>
      </section>
      {/* …form section на white/GRAY_BG… */}
      <V8Footer wrapperBg="dark" />
    </div>
  );
}
```

---

## 13. Open questions / inconsistencies (расхождения между страницами)

1. **Шрифт двоится.** Root `layout.tsx` грузит **Inter** на `<body>`, а каждая маркетинговая страница — **Onest** на корневом `<div>`. Маркетинг полагается на per-page переопределение. Новая страница ОБЯЗАНА сама подключить Onest, иначе унаследует Inter и будет выбиваться.
2. **Горизонтальный паддинг непоследователен.** Главная и skill-test: `px-4 sm:px-6 md:px-10 lg:px-0`. Courses: `px-4 sm:px-6`. Pricing: `px-6` на секциях. Канон — версия главной/skill-test.
3. **Вертикальный ритм непоследователен.** Главная/skill-test: `py-[80px] sm:py-[120px]`. Pricing: `py-[80px] sm:py-[100px]`. Courses: `py-16 sm:py-24` (Tailwind-шкала вместо px). Бери `py-[80px] sm:py-[120px]`.
4. **Способ задания фонов.** skill-test/pricing/главная — inline `style={{ backgroundColor: CONST }}`; courses — Tailwind-классы `bg-[#0F172A]`/`bg-white`/`bg-[#f4f4f4]`. Оба валидны; inline-вариант чаще.
5. **Размерная нотация.** Главная/skill-test/pricing — произвольные px (`text-[28px]`); courses — Tailwind-шкала (`text-3xl`, `text-lg`, `py-16`). Канон — px-нотация.
6. **`font-semibold` vs доступные веса.** Onest подключён только с весами 400/500/700, но в коде встречается `font-semibold` (600) на courses-кнопках. Браузер подберёт ближайший — визуально близко к 500/700, но строго 600 не отрендерится. Используй `font-medium`/`font-bold`.
7. **Нет канонического стиля текстовых полей формы.** Маркетинг почти не содержит `<input>` (есть только pill-инпут промокода на pricing). Для `/register` стиль полей — серая зона: либо взять shadcn `Input` из `components/ui`, либо собрать в духе карточек (rounded, border `#121212/10`, focus-ring `mp-blue-500`). Решение стоит согласовать визуально перед сборкой.
8. **Footer `wrapperBg`.** Значение зависит от цвета последней секции страницы — это ручная синхронизация, легко забыть. Для `/register` подбери под фактический низ страницы.
9. **shadcn-токены vs v8-inline.** В `globals.css` живут две параллельные системы: семантические `--primary`/`--background` (shadcn, app-зона) и landing-theme-переменные (`--landing-*`, для старых design-* прототипов). Текущий v8-маркетинг их НЕ использует — красится inline-hex. Не подмешивай `bg-background`/`text-foreground` в маркетинг — получишь не тот цвет.
