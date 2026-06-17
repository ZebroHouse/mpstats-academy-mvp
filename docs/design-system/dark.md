# Marketing (dark) — дизайн-гайдлайн

**Обновлено:** 2026-06-16
**Источник (прочитанный код):** `apps/web/src/app/{page,courses/page,skill-test/page,pricing/page,about/page,roadmap/page}.tsx`, `apps/web/src/components/v8/*`, `apps/web/src/components/shared/Logo.tsx`, `apps/web/tailwind.config.ts`, `apps/web/src/styles/globals.css`.

> Палитра/шрифт/шкалы/радиусы — в [tokens.md](./tokens.md). Здесь — как из них собрана маркетинговая страница.

Маркетинговый сайт = набор `components/v8/*` + per-page inline-токены. Это самостоятельная система поверх Tailwind. Семантические shadcn-токены (`--primary`, `bg-background`) — **для продукта, не для маркетинга**. На маркетинге цвета задаются inline-константами (`const BLUE='#2C4FF8'`) и произвольными значениями (`bg-[#0F172A]`).

---

## 1. Каркас страницы

### 1.1 Шрифт
Подключи Onest сам (см. [tokens.md §4](./tokens.md)) — обязательно, иначе Inter:
```tsx
const onest = Onest({ subsets:['latin','cyrillic'], weight:['400','500','700'], display:'swap' });
// корень страницы:
<div className={onest.className} style={{ color: TEXT }}>
```

### 1.2 Токены
Скопируй блок inline-констант (`BLUE`, `BLUE_HOVER`, `ORANGE`, `GREEN`, `DARK`, `GRAY_BG`, `TEXT`) в начало page-файла — см. [tokens.md §2](./tokens.md).

### 1.3 Контейнер и отступы (на каждой секции)
```
Контейнер:          max-w-[1160px] mx-auto
Гориз. паддинг:     px-4 sm:px-6 md:px-10 lg:px-0      ← КАНОН (главная + skill-test)
```
`lg:px-0` убирает паддинг на больших экранах — центрирует `max-w-[1160px]`. Узкие контейнеры: hero-текст/promo `max-w-[420..520px]`, changelog-таймлайн `max-w-[720px]`.

### 1.4 Вертикальный ритм
```
Секции (канон):   py-[80px] sm:py-[120px]
Hero (канон):     pt-[120px] sm:pt-[140px] pb-[80px] sm:pb-[120px]
```
Hero всегда с большим `pt-[120px]+` — `V8Header` `fixed` (h 64–72px), контент уезжает под него. Варианты: about-hero `pt-[120px] sm:pt-[160px]`, pricing-hero `pt-[140px] sm:pt-[160px]`, roadmap-hero `pt-[120px] sm:pt-[140px] pb-[60px] sm:pb-[80px]`.

---

## 2. Тайпскейл (произвольные px, веса 500/700)

| Роль | Класс (verbatim) |
|---|---|
| H1 hero (главная) | `text-[28px] sm:text-[36px] md:text-[48px] lg:text-[64px] font-bold leading-[1.1] tracking-tight text-white` |
| H1 hero (skill-test) | `…lg:text-[56px]…` |
| H1 hero (pricing) | `text-[36px] sm:text-[48px] md:text-[56px] font-bold leading-[1.1] tracking-tight text-white` |
| H2 секций | `text-[24px] sm:text-[32px] md:text-[40px] font-bold tracking-tight` (pricing: `text-[28px] sm:text-[36px]`) |
| H3 крупная карта | `text-[24px] sm:text-[28px] lg:text-[32px] font-bold leading-tight` |
| H3 средняя карта | `text-[20px] sm:text-[22px] font-bold` |
| H3 step / for-who | `text-[17px] sm:text-[19px] font-bold leading-tight` |
| Body hero | `text-[16px] sm:text-[18px] leading-relaxed` (цвет `rgba(255,255,255,0.7)`) |
| Body секций | `text-[15px] sm:text-[17px] leading-relaxed` |
| Body карточек | `text-[15px] sm:text-[16px] leading-relaxed` |
| FAQ вопрос / ответ | `text-[17px] sm:text-[19px] font-medium` / `text-[15px] sm:text-[16px] leading-relaxed` |
| Цена (число) | `text-[36px] sm:text-[44px] font-bold leading-none` |
| Counter / стата | `text-[56px] sm:text-[64px] font-bold leading-none` |
| Caption uppercase | `text-[13px] font-medium uppercase tracking-wider` |
| Meta | `text-[12px]`…`text-[13px] sm:text-[14px]` |

Текст на тёмном приглушается `text-white/70…/40` или inline `rgba(255,255,255,0.7)`.

---

## 3. `V8Header` (`components/v8/V8Header.tsx`)

Проп: `onDarkHero?: boolean` (default **`true`**).
- `fixed top-0 inset-x-0 z-50 transition-all duration-300`, строка `h-[64px] sm:h-[72px]`, контейнер канон.
- `scrolled = scrollY > 40`. `isLight = onDarkHero && !scrolled` → лого `white`, ссылки `rgba(255,255,255,0.85)`, фон transparent. При scroll/`onDarkHero=false` → фон `rgba(255,255,255,0.98)`, бордер `1px solid rgba(18,18,18,0.06)`, лого `default`, ссылки `#121212`.
- Лого: `<Logo size="sm" variant={logoVariant} href="/" />`.
- `NAV_LINKS`: Платформа `/` · Каталог `/courses` · Диагностика `/skill-test` · Тарифы `/pricing` · О нас `/about`. Класс: `text-[14px] font-medium transition-colors hover:opacity-80`.
- Правый блок: авторизован → аватар `w-8 h-8 rounded-full` (фон BLUE, инициалы) + имя; иначе ссылка «Войти» (`/login`). CTA: `rounded-full h-[44px] px-6 text-[14px] font-medium text-white` bg BLUE→BLUE_HOVER. href: авторизован→`/diagnostic`, на `/skill-test`→`/register`, иначе→`/skill-test`. Лейбл «Пройти диагностику».
- Мобайл: бургер → дропдаун `bg-white`, ссылки `py-3 text-[15px]` + пункт `/roadmap`, full-width CTA `rounded-full h-[48px] w-full`.

**Использование:** тёмный hero → `<V8Header />` (дефолт `onDarkHero=true`); светлый hero → `<V8Header onDarkHero={false} />`.

---

## 4. `V8Footer` (`components/v8/V8Footer.tsx`)

Проп: `wrapperBg?: 'dark' | 'blue'` (default **`dark`**).
```
<div style={{ backgroundColor: wrapperColor }}>      // 'blue'→#2C4FF8, 'dark'→#0F172A
  <footer className="bg-[#0a0f1e] rounded-t-[40px] pt-12 sm:pt-16 pb-8 px-4 sm:px-6 md:px-10 lg:px-0">
    <div className="max-w-[1160px] mx-auto"> … </div>
```
- Тело — `#0a0f1e` (темнее DARK), скругление `rounded-t-[40px]`. Внешний `<div>` красится в цвет **секции прямо над футером** — чтобы скругление читалось как переход. Поэтому `wrapperBg` = цвет последней секции страницы.
- 4 колонки (`grid grid-cols-2 md:grid-cols-4`): Brand (лого `white` + слоган `text-white/40`) + Платформа/Компания/Юридическое. Заголовки `text-[13px] font-medium text-white/40 uppercase tracking-wider`, ссылки `text-[14px] text-white/60 hover:text-white`. Копирайт `text-[13px] text-white/30`.

---

## 5. Кнопки — всегда `rounded-full`, `font-medium`

Hover синей — inline через `onMouseEnter/Leave` (BLUE↔BLUE_HOVER) либо `hover:bg-[#1D39C1]`.

```tsx
// Primary крупная (hero/CTA)
className="inline-flex items-center justify-center rounded-full h-[52px] sm:h-[62px] px-8 sm:px-10 text-[15px] sm:text-[16px] font-medium text-white transition-colors"
style={{ backgroundColor: BLUE }}
onMouseEnter={(e)=>(e.currentTarget.style.backgroundColor=BLUE_HOVER)}
onMouseLeave={(e)=>(e.currentTarget.style.backgroundColor=BLUE)}
```
- **Primary компактная (навбар):** `rounded-full h-[44px] px-6 text-[14px] font-medium text-white` bg BLUE.
- **Инверсная (на синем):** `… h-[52px] sm:h-[58px] px-10 sm:px-12 …` `bg white / color BLUE` (hover bg `#e8e8e8`).
- **Secondary/outline на тёмном:** `… text-white border border-white/30 hover:bg-white/10`.
- **Outline на светлом (courses):** `px-8 h-[52px] sm:h-[62px] rounded-full text-sm font-semibold border-2 border-[#121212] text-[#121212] hover:bg-[#121212] hover:text-white`.
- **Outline синий (pricing):** `h-[52px] sm:h-[56px] rounded-full border-2` `style={{borderColor:BLUE,color:BLUE}}` (hover → bg BLUE).
- **Текст-ссылка-стрелка:** `inline-flex items-center gap-2 text-[14px] sm:text-[15px] font-medium hover:opacity-80` `style={{color:BLUE}}`.

Высоты: hero/CTA `h-[52px] sm:h-[62px]`; карт/форм `h-[52px] sm:h-[56px]`; навбар `h-[44px]`; промо `h-[48px] sm:h-[52px]`; sticky `h-[40px] sm:h-[44px]`.

---

## 6. Карты

Hover-мотив: `transition-transform duration-300 hover:-translate-y-1`. `Reveal` очищает inline-transform после входа, чтобы CSS-hover не конфликтовал (§9).

| Тип | Радиус | Паддинг | Фон / бордер |
|---|---|---|---|
| Bento (главная) | `rounded-[40px]` | `p-8` (`sm:p-10`) | inline bg (BLUE/GRAY_BG/DARK/ORANGE) |
| Pricing-карта | `rounded-[40px]` | `p-7 sm:p-9` | COURSE: `border border-[#121212]/10`; PLATFORM: bg BLUE |
| Course-карта | `rounded-[40px]` | `p-8` | пастель (`#cfd4fd`/`#fbc8c0`/`#c0f8fb`/`#c0dbfb`), `min-h-[320px]` |
| Step-карта | `rounded-[32px]` | `p-6 sm:p-7` | белая, `min-h-[240px]` |
| For-who | `rounded-[40px]` | `p-8` | `border rgba(18,18,18,0.1)`, hover `hover:border-[#2C4FF8]/40` |
| Результат/ось (skill-test) | `rounded-[40px]` | `p-8` (`sm:p-10`) | GRAY_BG или BLUE |
| Comparison desktop / моб | `rounded-[32px]` / `rounded-[24px]` | — | `overflow-hidden border border-[#121212]/10` |
| **Stats-карта (about)** | `rounded-[40px]` | `p-8 sm:p-10` | inline bg (BLUE/GRAY_BG/DARK), `min-h-[200px] sm:min-h-[240px]` |
| **Ecosystem-карта (about)** | `rounded-[40px]` | `p-6` | highlighted: без бордера; иначе `1px solid rgba(18,18,18,0.1)`, `min-h-[180px]` |
| **Expert-карта (about)** | `rounded-[40px]` | `p-8` | белая; фото `w-14 h-14 rounded-full border-2` inline borderColor |
| **Roadmap-item (roadmap)** | `rounded-[40px]` | `p-6` | белая, `relative overflow-hidden` + top accent-бар (§7.2) |

Иерархия радиусов: `40px` → `32px` → `24px` → `rounded-full` (кнопки/чипы). **Никаких произвольных радиусов вне этого набора.**

---

## 7. Паттерны about / roadmap

### 7.1 Trust/ecosystem дот-буллеты
Цветной кружок-маркер `w-3 h-3 rounded-full` с inline `backgroundColor` из расширенной палитры (`#2C4FF8`/`#10B981`/`#ff6b16`/`#8B5CF6`). Текст рядом.

### 7.2 Roadmap status board (kanban)
3 колонки `grid grid-cols-1 lg:grid-cols-3 gap-8`. Заголовок колонки: дот `w-3 h-3 rounded-full` (`#10B981` Готово / `#2C4FF8` В работе / `#9CA3AF` Исследуем) + count-бейдж `rounded-full px-3 py-0.5 text-[13px] font-medium` с фоном `${col.color}15` (opacity-suffix). Карта item'а — белая `rounded-[40px] p-6 relative overflow-hidden` + **top accent-бар** `absolute top-0 left-0 right-0 h-[4px]` `backgroundColor: col.color`. Буллет внутри `w-2 h-2 rounded-full mt-[7px]`.

### 7.3 Changelog vertical timeline (roadmap)
Контейнер `max-w-[720px] mx-auto`. Вертикальная направляющая `absolute left-[20px] sm:left-[24px] top-0 bottom-0 w-[2px]` `backgroundColor: ${BLUE}20`. Дот-вложенный круг `w-[34px] h-[34px] sm:w-[42px] sm:h-[42px] rounded-full` (внешний `${BLUE}10`, внутренний `${BLUE}`). Дата-бейдж `rounded-full px-4 py-1 text-[12px] sm:text-[13px] font-bold text-white` bg BLUE.

---

## 8. Иконки — inline SVG (без lucide!)

lucide живёт в app/admin-зоне, на маркетинге его НЕТ. Иконки = локальные SVG-компоненты в page-файле:
- `CheckIcon` — `viewBox="0 0 24 24"`, рендер 20px, `stroke="currentColor"` (или `GREEN` на roadmap), `strokeWidth="2.5"`, `<polyline points="20 6 9 17 4 12"/>`.
- `ChevronDown` — 24px, `strokeWidth="2"`, ротация `className={open?'rotate-180':''} transition-transform duration-200`.
- `ArrowRight/ArrowIcon` — 20px, hover-сдвиг `group-hover:translate-x-1`.
- about/roadmap: `PhoneIcon/MailIcon/SendIcon/MapPinIcon/ClockIcon/ExternalLinkIcon`, `LightbulbIcon` — все inline, stroke часто `rgba(255,255,255,0.5..0.85)` на тёмном.

**Иконки НЕ оборачиваются в цветные плитки-тайлы.** Это inline-штрихи (галочки, шевроны) или bare-кружки-дроты. Дизайн опирается на типографику, цвет, крупные карты — не на иконографику. Не добавляй декоративные иконочные тайлы — чужеродно.

---

## 9. Бейджи / чипы — `rounded-full`

- Бейдж на тёмной карте: `text-[12px] text-white/50 bg-white/10 rounded-full px-3 py-1`.
- Чип на светлой: `text-[12px] bg-[#121212]/5 rounded-full px-3 py-1`.
- Step-бейдж синий: `text-[11px] sm:text-[12px] font-medium rounded-full px-3 py-1` `style={{ backgroundColor:'rgba(44,79,248,0.08)', color:BLUE }}`.
- «Рекомендуем» (pricing): `absolute top-5 right-5 … px-3.5 py-1 rounded-full text-[12px] font-medium text-white` bg ORANGE.
- Маркетплейс (courses): WB `bg-[#CB11AB]/10 text-[#CB11AB]`, Ozon `bg-[#005BFF]/10 text-[#005BFF]`, `px-3 py-1 rounded-full text-xs font-semibold`.
- Чип-переключатель (pricing): `px-4 py-2 rounded-full text-[13px] sm:text-[14px] font-medium`, active `bg BLUE / white`, inactive `bg rgba(18,18,18,0.05) / TEXT`.

---

## 10. Motion

### `Reveal` (`components/v8/Reveal.tsx`)
Drop-in `<div>` с fade-up. `<Reveal delay={0} distance={20} as="div" className="…" style={{…}}>`.
- `IntersectionObserver` threshold 0.12, `rootMargin '0px 0px -60px 0px'`. Скрыто: `opacity:0; translateY(distance=20px)`. Появление: `v8-fade-up 600ms cubic-bezier(0.22,1,0.36,1) {delay}ms both`. Через `delay+650ms` inline-стиль **очищается** (чтобы hover работал) — не дублируй руками.
- **Stagger:** bento `delay={0/80/160/240/320}`, step/courses/results `delay={i*80}`, for-who `delay={i*70}`, pricing `delay={0/100/200}`, steps `delay={i*100}`.
- Хук `useReveal<T>(delay,distance)` — для нестандартных случаев.

### `Counter` (`components/v8/Counter.tsx`)
Анимация 0→`end` (easeOutCubic) при входе во вьюпорт. `<Counter end={400} suffix="+" duration={1600} delay={0} format className="text-[56px] sm:text-[64px] font-bold text-white" />`. Хук `useCountUp`. Стилизация целиком через className.

### `StickyCTA` (`components/v8/StickyCTA.tsx`)
`<StickyCTA href="/skill-test" buttonLabel="…" title="…" subtitle="…" showAfter={700} />`. Появляется при `scrollY>showAfter`, слайд `translateY(140%)→0` `transition 500ms`. Бар `max-w-[880px] mx-auto rounded-full` bg `rgba(15,23,42,0.95)` `backdrop-blur(8px)`. Кнопка bg BLUE `h-[40px] sm:h-[44px]`.

### Keyframes (`styles/globals.css`)
`v8-fade-up` (Reveal), `v8-radar-rotate`, `v8-pulse`, `v8-ring-pulse` (декоративный SkillRadar — inline в page). Глобально: `html{scroll-behavior:smooth}`, `@media (prefers-reduced-motion:reduce)` гасит всё (для новой страницы ничего делать не надо), кастомный скроллбар, синий `::selection`.

---

## 11. Ритм фонов секций

Чередование **DARK → white → GRAY_BG → white → … → DARK** + футер со скруглением. `rounded-t-[40px]` на маркетинге фактически только у `V8Footer`; между обычными секциями — резкая смена плоского цвета.

Главная (дословно): Hero `#0F172A` → Bento white → Comparison white → How `#f4f4f4` → For-who white → Mid-CTA `#2C4FF8` → Pricing `#f4f4f4` → FAQ white → Footer-CTA `#0F172A` → Footer `#0a0f1e` (`rounded-t-[40px]`).
skill-test: …→ BLUE, футер `wrapperBg="blue"`. pricing/courses/about/roadmap: финал DARK, футер `wrapperBg="dark"`.

**Правило:** соседние секции не одного цвета (кроме намеренных white+white). Тёмный hero + тёмный финал «обрамляют». Цвет последней секции = `wrapperBg` футера.

---

## 12. CHECKLIST — собрать новую маркет-страницу

- [ ] **Шрифт:** объяви Onest, оберни контент в `<div className={onest.className} style={{color:TEXT}}>`.
- [ ] **Токены:** скопируй блок inline-констант.
- [ ] **Header:** `<V8Header onDarkHero={true}/>` (тёмный hero) или `={false}` (светлый).
- [ ] **Контейнер:** `max-w-[1160px] mx-auto`; узкие формы `max-w-[420..520px]`.
- [ ] **Паддинг:** `px-4 sm:px-6 md:px-10 lg:px-0`.
- [ ] **Ритм:** секции `py-[80px] sm:py-[120px]`; hero `pt-[120px] sm:pt-[140px] pb-[80px] sm:pb-[120px]`.
- [ ] **Фоны:** чередуй DARK/white/GRAY_BG; не две одинаковые подряд; последняя = `wrapperBg` футера.
- [ ] **Заголовки:** H1 hero-шкала; H2 секций-шкала (§2).
- [ ] **Кнопки:** только `rounded-full font-medium`; primary bg BLUE→BLUE_HOVER (inline hover); крупная `h-[52px] sm:h-[62px]`.
- [ ] **Карты:** радиусы 40/32/24; интерактивные + `transition-transform duration-300 hover:-translate-y-1`.
- [ ] **Поля ввода:** канона нет (см. §13 п.7) — для форм бери продуктовый shadcn `Input` ([light.md](./light.md)) ИЛИ собери в духе карты (`rounded-2xl border border-[#121212]/10 px-4`). Сверь визуально.
- [ ] **Иконки:** inline SVG, без тайлов, без lucide.
- [ ] **Бейджи:** `rounded-full px-3 py-1 text-[12px]`.
- [ ] **Анимация:** `<Reveal delay={…}>`, сетка — stagger `i*80`.
- [ ] **Footer:** `<V8Footer wrapperBg="dark"/>` (или `"blue"`).
- [ ] **CTA-href:** `/register` · `/login` · `/skill-test` · `/diagnostic` (авториз.) · `/pricing`.

**Скелет:**
```tsx
'use client';
import { Onest } from 'next/font/google';
import { V8Header } from '@/components/v8/V8Header';
import { V8Footer } from '@/components/v8/V8Footer';
import { Reveal } from '@/components/v8/Reveal';

const onest = Onest({ subsets:['latin','cyrillic'], weight:['400','500','700'], display:'swap' });
const BLUE='#2C4FF8'; const BLUE_HOVER='#1D39C1'; const DARK='#0F172A'; const GRAY_BG='#f4f4f4'; const TEXT='#121212';

export default function Page() {
  return (
    <div className={onest.className} style={{ color: TEXT }}>
      <V8Header onDarkHero={true} />
      <section className="pt-[120px] sm:pt-[140px] pb-[80px] sm:pb-[120px] px-4 sm:px-6 md:px-10 lg:px-0" style={{ backgroundColor: DARK }}>
        <div className="max-w-[1160px] mx-auto">
          <Reveal><h1 className="text-[28px] sm:text-[36px] md:text-[48px] lg:text-[56px] font-bold leading-[1.1] tracking-tight text-white">…</h1></Reveal>
        </div>
      </section>
      {/* …секции white/GRAY_BG… */}
      <V8Footer wrapperBg="dark" />
    </div>
  );
}
```

---

## 13. Расхождения между маркет-страницами (знать)

1. **Шрифт двоится** — root Inter, страницы Onest per-page. Новая страница ОБЯЗАНА подключить Onest.
2. **Гориз. паддинг:** канон `px-4 sm:px-6 md:px-10 lg:px-0` (главная/skill-test); courses `px-4 sm:px-6`; pricing `px-6`. Бери канон.
3. **Верт. ритм:** канон `py-[80px] sm:py-[120px]`; pricing `sm:py-[100px]`; courses `py-16 sm:py-24` (Tailwind-шкала). Бери канон.
4. **Фоны:** inline `style={{backgroundColor:CONST}}` (чаще) vs Tailwind-классы `bg-[#0F172A]` (courses). Оба валидны.
5. **Размеры:** px-нотация (канон) vs Tailwind-шкала `text-3xl` (courses). Бери px.
6. **`font-semibold`** на courses-кнопках — Onest без 600, отрендерится ближайший. Используй `font-medium`/`font-bold`.
7. **Нет канона текстовых полей формы.** Маркетинг почти без `<input>` (только pill-промокод на pricing). Для форм — продуктовый shadcn `Input` или сборка в духе карты. Согласовать визуально.
8. **`wrapperBg` футера** = цвет последней секции, ручная синхронизация — легко забыть.
9. **shadcn vs v8:** в `globals.css` две параллельные системы. v8-маркетинг shadcn-токены НЕ использует — не подмешивай `bg-background`/`text-foreground`.
