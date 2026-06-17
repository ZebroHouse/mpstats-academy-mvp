# Product (light) — дизайн-гайдлайн

**Обновлено:** 2026-06-16
**Источник (прочитанный код):** `apps/web/src/components/ui/*` (shadcn-база), `apps/web/src/app/(main)/{layout,dashboard,learn,diagnostic,profile}/*`, `apps/web/src/app/(admin)/admin/*`, `apps/web/src/components/{learning,diagnostic,admin}/*`, `tailwind.config.ts`, `styles/globals.css`.

> Палитра/токены/шкалы/радиусы — в [tokens.md](./tokens.md). Здесь — как из них собрана продуктовая (app/admin) страница.

Продукт = **Inter** + **shadcn `components/ui/*`** + **`mp-*` шкалы** / семантические CSS-vars + **lucide-react**. Это другая система, чем тёмный маркетинг ([dark.md](./dark.md)). НЕ тащи в продукт Onest/inline-hex/v8-компоненты.

**Состояние:** продукт визуально чистый и консистентный, но стилистически **отошёл от маркетинга** (светлый, `mp-*`-семантика, иконки-тайлы). Якорь сближения — общий синий `#2C4FF8` (`mp-blue-500` = `--primary` = маркет `BLUE`). Продукт постепенно подтягивается к маркет-эстетике; пока — фиксируем текущий канон.

---

## 1. Цвет — `mp-*` шкалы (НЕ inline-hex)

Продукт почти не содержит хардкод-hex — всё через семантические `mp-*` ([tokens.md §1](./tokens.md)) или shadcn-токены (`bg-primary`, `text-muted-foreground`).

| Роль | Класс |
|---|---|
| Фон страницы | `bg-mp-gray-50` (root layout) |
| Фон карты | `bg-white` + `border-mp-gray-200` + `shadow-mp-card` |
| Заголовки | `text-mp-gray-900` |
| Body | `text-mp-gray-700` / `-900` |
| Приглушённый текст | `text-mp-gray-500` / `-600` |
| Ссылки/действие | `text-mp-blue-600` / `-500` |
| Primary action | `bg-mp-blue-500` text-white (hover `-600`, active `-700`) |
| Success | `bg-mp-green-500`, текст `text-mp-green-700` |
| Featured/hot | `bg-mp-pink-500` text-white |
| Бордеры | `border-mp-gray-200` (дефолт) |
| Прогресс-трек/филл | `bg-mp-gray-200` / `bg-mp-blue-500`(или green) |

**Категориальные цвета** (намеренные, не считать расхождением): skill-категории — ANALYTICS `bg-mp-blue-100 text-mp-blue-700`, MARKETING `bg-mp-green-100`, CONTENT `bg-mp-pink-100`/`emerald-100`, OPERATIONS `orange-100`/`amber`, FINANCE `yellow-100`/`mp-pink`. Section-акценты в плане — `border-l-4 border-l-{red,yellow,mp-blue,mp-green}-400` (приоритет-визуал).

---

## 2. Типографика — Inter + семантическая шкала

Шрифт **Inter** (из root layout, Onest нет). Размеры — семантические токены, не px. Полная шкала в [tokens.md §5](./tokens.md):
- Заголовки страниц: `text-display-sm` (2.25rem) — напр. «Привет, {name}!».
- Секции/CardTitle: `text-heading-lg` (1.5rem/600), `text-heading` (1.25rem).
- Body: `text-body` (1rem), описания `text-body-sm` (0.875rem), meta `text-caption` (0.75rem).
- Веса: 600 заголовки, 700 display, 500 bold-body, 400 дефолт.

---

## 3. Карты — shadcn `<Card>` (`components/ui/card.tsx`)

База: `rounded-xl border text-card-foreground transition-all duration-200`. **Радиус `rounded-xl` (12px)** — крупнее, чем кнопки/инпуты (8px).

**CVA-варианты:**
| variant | классы |
|---|---|
| `default` | `bg-white border-mp-gray-200 shadow-mp-card` |
| `soft-blue` | `bg-mp-blue-50 border-mp-blue-100` |
| `soft-green` | `bg-mp-green-50 border-mp-green-100` |
| `soft-pink` | `bg-mp-pink-50 border-mp-pink-100` |
| `gradient` | `bg-mp-hero-gradient border-transparent` |
| `outline` | `bg-transparent border-mp-gray-200` |
| `glass` | `bg-white/80 backdrop-blur-sm border-mp-gray-100 shadow-mp-card` |
| `elevated` | `bg-white border-mp-gray-100 shadow-mp-lg` |

`interactive` prop → `cursor-pointer hover:shadow-mp-card-hover hover:-translate-y-0.5`.

**Sub-компоненты:** `CardHeader` `flex flex-col space-y-1.5 p-6` · `CardTitle` `text-heading-lg text-mp-gray-900 tracking-tight` · `CardDescription` `text-body-sm text-mp-gray-500` · `CardContent` `p-6 pt-0` · `CardFooter` `flex items-center p-6 pt-0`.

В реальных страницах используются в основном `default` и иногда `soft-blue` (entry-точки). Прочие варианты определены, но редки.

---

## 4. Кнопки — shadcn `<Button>` (`components/ui/button.tsx`)

База: `inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-semibold ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]`. **Радиус `rounded-lg` (8px), `font-semibold`** (в отличие от маркета `rounded-full font-medium`).

**CVA-варианты:**
| variant | классы |
|---|---|
| `default` | `bg-mp-blue-500 text-white shadow-mp hover:bg-mp-blue-600 hover:shadow-mp-md active:bg-mp-blue-700` |
| `success` | `bg-mp-green-500 text-mp-green-900 shadow-mp hover:bg-mp-green-600 active:bg-mp-green-700` |
| `featured` | `bg-mp-pink-500 text-white shadow-mp hover:bg-mp-pink-600 active:bg-mp-pink-700` |
| `destructive` | `bg-destructive text-destructive-foreground shadow-mp hover:bg-destructive/90` |
| `outline` | `border-2 border-mp-blue-500 bg-transparent text-mp-blue-500 hover:bg-mp-blue-50 hover:border-mp-blue-600 active:bg-mp-blue-100` |
| `outline-success` | `border-2 border-mp-green-500 bg-transparent text-mp-green-700 hover:bg-mp-green-50 active:bg-mp-green-100` |
| `secondary` | `bg-mp-gray-100 text-mp-gray-700 hover:bg-mp-gray-200 active:bg-mp-gray-300` |
| `ghost` | `text-mp-gray-700 hover:bg-mp-gray-100 hover:text-mp-gray-900 active:bg-mp-gray-200` |
| `link` | `text-mp-blue-500 underline-offset-4 hover:underline hover:text-mp-blue-600` |

**Размеры:** `default` `h-10 px-5 py-2` · `sm` `h-9 px-4 text-xs` · `lg` `h-12 px-8 text-base` · `xl` `h-14 px-10 text-lg` · `icon` `h-10 w-10` · `icon-sm` `h-8 w-8` · `icon-lg` `h-12 w-12`.

Типичное использование: primary action `<Button>`; вторичное `variant="outline" size="sm"`; инлайн-хедер `variant="ghost"`; текст-ссылка `variant="link"`.

---

## 5. Формы — канон light

### Input (`components/ui/input.tsx`)
База: `flex w-full rounded-lg border bg-white px-4 py-2.5 text-body text-mp-gray-900 transition-all duration-200 … placeholder:text-mp-gray-400 disabled:cursor-not-allowed disabled:bg-mp-gray-50 disabled:opacity-50`.

| variant | классы |
|---|---|
| `default` | `border-mp-gray-200 focus:border-mp-blue-500 focus:ring-2 focus:ring-mp-blue-500/20` |
| `error` | `border-red-500 text-red-900 placeholder:text-red-300 focus:ring-2 focus:ring-red-500/20` |
| `success` | `border-mp-green-500 focus:ring-2 focus:ring-mp-green-500/20` |

`inputSize`: `default` `h-11 text-body` · `sm` `h-9 px-3 text-body-sm` · `lg` `h-14 px-5 text-body-lg`. Пропсы `error`/`success` переопределяют `variant`.

### Label — НЕТ компонента, сырой `<label>`
`label.tsx` отсутствует. Канон-класс (verbatim из profile/admin):
```
block text-body-sm font-medium text-mp-gray-700 mb-2     (admin-формы: mb-1.5)
```

### Канон-паттерн поля (profile):
```tsx
<label className="block text-body-sm font-medium text-mp-gray-700 mb-2">Email</label>
<Input type="email" value={…} />
```

### Прочие контролы
- **Textarea** (`components/ui/textarea.tsx`): `min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base … focus-visible:ring-2 focus-visible:ring-ring …`. Использует **семантические токены** (не input-CVA). ⚠ В admin-формах часто **сырой `<textarea>`** с ручным стилем `w-full border border-mp-gray-200 rounded-md p-2 text-sm focus:ring-2 focus:ring-mp-blue-500 focus:border-transparent` — расхождение (см. §9).
- **Checkbox** (`checkbox.tsx`): `h-4 w-4 rounded border border-gray-300 … data-[state=checked]:bg-mp-blue-600 data-[state=checked]:border-mp-blue-600 data-[state=checked]:text-white`.
- **Switch** (`switch.tsx`): рут `h-6 w-11 rounded-full … data-[state=checked]:bg-primary data-[state=unchecked]:bg-input`; thumb `h-5 w-5 rounded-full bg-background shadow-lg data-[state=checked]:translate-x-5`.
- **phone-input** (`phone-input.tsx`): обёртка react-international-phone (дефолт RU) — для телефона в формах регистрации/профиля.
- **Select** компонента нет; есть `command.tsx` + `popover.tsx` (combobox-паттерн).

**Фокус-кольцо везде:** `ring-2 ring-mp-blue-500` (через `--ring`) + `ring-offset-2`; у инпутов мягкий `ring-mp-blue-500/20`.

---

## 6. Бейджи — shadcn `<Badge>` (`components/ui/badge.tsx`)

База: `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors`. Радиус `rounded-full`.

Варианты (19): `default` `bg-mp-gray-100 text-mp-gray-700` · `primary` `bg-mp-blue-100 text-mp-blue-700` · `success` `bg-mp-green-100 text-mp-green-800` · `featured` `bg-mp-pink-100 text-mp-pink-700` · `hot` `bg-mp-pink-500 text-white` · `warning` `bg-amber-100 text-amber-800` · `destructive` `bg-red-100 text-red-700` · `premium` `bg-gradient-to-r from-mp-blue-500 to-mp-pink-500 text-white` · `new` `bg-mp-green-500 text-mp-green-900` · `limited` `bg-mp-blue-900 text-white` · `outline-*` (прозрачные с бордером) · категориальные `analytics`/`marketing`/`content`/`operations`/`finance`.
Размеры: `default` `px-2.5 py-0.5 text-xs` · `sm` `px-2 py-0.5 text-[10px]` · `lg` `px-3 py-1 text-sm`.

---

## 7. Иконки — lucide-react + тайлы

`lucide-react` (Calendar, Check, Search, Target, Wrench…). Размеры: `w-4 h-4` (мелкие/бейджи), `w-5 h-5` (инлайн), `w-6 h-6` (в тайлах), `w-8 h-8` (empty-state).

**Цветные тайлы** (в отличие от маркета — там запрещены): контейнер `rounded-xl` с тонированным фоном + иконка по центру. Напр. `w-10 h-10 rounded-xl bg-mp-blue-100 flex items-center justify-center` (text-mp-blue-600 внутри). Размеры тайлов `w-10/12/14/16`. Статус-иконки уроков (play/clock/check в кружках, lock) — иногда inline-SVG.

---

## 8. Layout + навигация (`(main)/layout.tsx`)

- **main:** `flex-1 p-4 md:p-6 pb-20 md:pb-6 overflow-x-hidden` (без жёсткого max-w; ширину держит сайдбар).
- **Сайдбар (desktop):** `w-64 border-r border-mp-gray-200 bg-white hidden md:flex fixed top-0 left-0 h-screen z-30`; контент смещён `md:ml-64`. Лого-секция `h-16 flex items-center px-4 border-b border-mp-gray-200`. Nav-контейнер `p-4 space-y-1`.
- **Nav-item:** `flex items-center gap-3 px-3 py-2.5 rounded-lg text-body-sm font-medium transition-all duration-200`. Active `bg-mp-blue-50 text-mp-blue-600 shadow-mp-sm`; inactive `text-mp-gray-600 hover:bg-mp-gray-100 hover:text-mp-gray-900`. Группа «Обучение» — сворачиваемая (chevron-rotate), под-пункты с отступом.
- **Header:** `h-16 border-b border-mp-gray-200 bg-white/95 backdrop-blur-sm sticky top-0 z-40 px-4 md:px-6`.
- **Mobile:** нижний бар (`MobileNav`) + горизонтальные pill-табы обучения (`md:hidden`): `shrink-0 px-3 py-1.5 rounded-full text-body-sm font-medium`, active `bg-mp-blue-50 text-mp-blue-600`.

**Spacing-каноны:** между секциями `space-y-6`; между картами `space-y-4`/`-3`; сетки `gap-4 md:gap-6`; типовые гриды `grid-cols-1 md:grid-cols-3`, `md:grid-cols-4` (стат-карты), `sm:grid-cols-2 lg:grid-cols-3` (материалы).

---

## 9. Расхождения внутри продукта (знать)

1. **Textarea двоится:** есть компонент `textarea.tsx` (семантические токены), но profile/admin-формы используют **сырой `<textarea>`** с ручным `border-mp-gray-200 rounded-md p-2`. Канон лучше свести к компоненту.
2. **Toggle-кнопки самопал:** admin (`MaterialForm`) рендерит переключатели как сырые `<button>` с условными классами (`bg-mp-blue-600 text-white` / `bg-white border-mp-gray-200`), а не через `<Button>`-варианты.
3. **Label нет компонента** — везде сырой `<label>` с канон-классом (см. §5). Консистентно, но без типизации.
4. **Card-варианты:** реально живут `default`/`soft-blue`; `gradient/glass/elevated/soft-*` определены, но почти не используются.
5. **Радиусы инпутов:** `Input` = `rounded-lg`, но самопальные textarea/toggle = `rounded-md`. Свести к `rounded-lg`.

---

## 10. CHECKLIST — собрать новую app/admin-страницу

- [ ] **Шрифт:** ничего — Inter из root.
- [ ] **Цвет:** только `mp-*` / семантические токены, без inline-hex. Фон секций белый (`<Card>`), фон страницы `mp-gray-50` (уже из layout).
- [ ] **Карты:** shadcn `<Card>` (`default`), `rounded-xl`, `CardHeader/Content` с `p-6`. Интерактивные — `interactive` prop.
- [ ] **Кнопки:** shadcn `<Button>` — `default` (primary), `outline`/`ghost` (вторичные), `link` (текст). Размер `default`/`sm`.
- [ ] **Формы:** `<Input>` (default `h-11`) + сырой `<label className="block text-body-sm font-medium text-mp-gray-700 mb-2">`. Телефон — `phone-input`.
- [ ] **Бейджи:** `<Badge variant="…" size="…">`.
- [ ] **Иконки:** `lucide-react`; цветные тайлы `rounded-xl bg-mp-*-100` допустимы (в отличие от маркета).
- [ ] **Типографика:** `text-heading-*` / `text-body-*` / `text-caption`, не px.
- [ ] **Spacing:** `space-y-6` секции, `gap-4 md:gap-6` сетки, `p-4 md:p-6` страница (из layout).
- [ ] **Фокус/ховер:** не трогать — компоненты несут `ring-mp-blue-500` + hover-состояния сами.
- [ ] **НЕ подмешивай** Onest, inline-hex, `rounded-full` на кнопки, v8-компоненты — это маркетинг ([dark.md](./dark.md)).
