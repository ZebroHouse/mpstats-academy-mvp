'use client';

/**
 * Styleguide v2 — PROPOSED "branded-light" product language (before/after).
 *
 * Left column "Сейчас" = real current shadcn components (Inter, current radii).
 * Right column "v2"     = specimen JSX with the target classes from
 *                         docs/design-system/v2-product-alignment-spec.md
 *                         (Onest, meet-in-middle radii, dark islands, bento).
 *
 * This is a REVIEW artifact. Nothing here is applied to the product yet —
 * once approved, the target classes get baked into components/ui/*.
 */

import { Onest } from 'next/font/google';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

const onest = Onest({ subsets: ['latin', 'cyrillic'], weight: ['400', '500', '600', '700'], display: 'swap' });

const BLUE = '#2C4FF8';
const DARK = '#0F172A';
const ORANGE = '#ff6b16';

function Row({ title, hint, before, after }: { title: string; hint?: string; before: React.ReactNode; after: React.ReactNode }) {
  return (
    <div className="border-t border-mp-gray-200 pt-8">
      <h3 className="text-heading font-semibold text-mp-gray-900">{title}</h3>
      {hint && <p className="text-body-sm text-mp-gray-500 mt-1 mb-5">{hint}</p>}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-mp-gray-400 mb-3">Сейчас (Inter)</div>
          {before}
        </div>
        <div className="rounded-2xl bg-mp-gray-50 -m-1 p-1">
          <div className="text-[11px] uppercase tracking-wider text-mp-blue-500 mb-3 px-1 pt-1">v2 — предложение (Onest)</div>
          <div className={onest.className}>{after}</div>
        </div>
      </div>
    </div>
  );
}

export function StyleguideV2Client() {
  return (
    <div className="min-h-screen bg-white">
      {/* Intro */}
      <header className={`${onest.className} px-6 py-10 sm:px-10 text-white`} style={{ backgroundColor: DARK }}>
        <div className="max-w-[1100px] mx-auto">
          <div className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/70 mb-3">
            v2 · предложение · ещё не применено к продукту
          </div>
          <h1 className="text-[32px] sm:text-[44px] font-bold tracking-tight leading-[1.1]">Styleguide v2 — branded-light</h1>
          <p className="text-[15px] sm:text-[17px] text-white/70 mt-3 max-w-[680px] leading-relaxed">
            Продукт остаётся светлым, но говорит на бренд-языке маркетинга: Onest, мягче радиусы, сдержанная палитра,
            тёмные острова для глубины. Слева — текущее, справа — предложение. Спек:{' '}
            <code className="text-white/90">docs/design-system/v2-product-alignment-spec.md</code>.
          </p>
          <a href="/styleguide" className="inline-flex items-center gap-1 text-[14px] font-medium mt-5 rounded-full bg-white/10 px-4 py-1.5 hover:bg-white/20 transition-colors">
            ← к Styleguide v1 (текущее состояние)
          </a>
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto px-6 py-12 sm:px-10 space-y-10">

        {/* FONT */}
        <Row
          title="Шрифт"
          hint="Главный сигнал единства: продукт переходит на Onest (как маркетинг)."
          before={
            <div>
              <div className="text-[28px] font-bold text-mp-gray-900 tracking-tight">Привет, селлер!</div>
              <p className="text-body text-mp-gray-700 mt-1">Inter — нейтральный, «дефолтный SaaS».</p>
            </div>
          }
          after={
            <div>
              <div className="text-[28px] font-bold text-mp-gray-900 tracking-tight">Привет, селлер!</div>
              <p className="text-[16px] text-mp-gray-700 mt-1">Onest — характерный, как на лендингах.</p>
            </div>
          }
        />

        {/* BUTTONS */}
        <Row
          title="Кнопки"
          hint="v2: CTA — pill (rounded-full), стандарт — rounded-xl, font-medium, лёгкая тень. Плотные/row-кнопки остаются rounded-lg (гард-рейл)."
          before={
            <div className="flex flex-wrap items-center gap-3">
              <Button>Primary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button size="sm">Small</Button>
            </div>
          }
          after={
            <div className="flex flex-wrap items-center gap-3">
              <button className="inline-flex items-center justify-center rounded-full h-12 px-8 text-[15px] font-medium text-white bg-mp-blue-500 hover:bg-mp-blue-600 transition-colors">Primary CTA</button>
              <button className="inline-flex items-center justify-center rounded-xl h-11 px-5 text-sm font-medium border-2 border-mp-blue-500 text-mp-blue-500 bg-transparent hover:bg-mp-blue-50 transition-colors">Standard</button>
              <button className="inline-flex items-center justify-center rounded-xl h-11 px-5 text-sm font-medium text-mp-gray-700 hover:bg-mp-gray-100 transition-colors">Ghost</button>
              <button className="inline-flex items-center justify-center rounded-lg h-9 px-4 text-xs font-medium text-mp-gray-700 border border-mp-gray-200 hover:bg-mp-gray-50 transition-colors">Row action (туже)</button>
            </div>
          }
        />

        {/* CARDS */}
        <Row
          title="Карты"
          hint="v2: дефолт rounded-2xl (мягче), feature/entry — rounded-3xl с цветной заливкой (bento). Плотные/таблицы остаются rounded-xl бордер-белыми."
          before={
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Карточка по умолчанию</CardTitle>
                  <CardDescription>rounded-xl, border + shadow</CardDescription>
                </CardHeader>
                <CardContent className="text-body-sm text-mp-gray-700">Контент.</CardContent>
              </Card>
              <Card variant="soft-blue">
                <CardHeader>
                  <CardTitle>soft-blue</CardTitle>
                  <CardDescription>текущая entry-точка</CardDescription>
                </CardHeader>
              </Card>
            </div>
          }
          after={
            <div className="space-y-4">
              <div className="rounded-2xl border border-mp-gray-200 bg-white shadow-mp-card p-6">
                <div className="text-[18px] font-bold text-mp-gray-900">Карточка по умолчанию</div>
                <div className="text-[13px] text-mp-gray-500 mt-0.5">rounded-2xl — мягче</div>
                <p className="text-[14px] text-mp-gray-700 mt-2">Контент.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-3xl p-6 min-h-[120px] flex flex-col justify-between text-white transition-transform duration-300 hover:-translate-y-1" style={{ backgroundColor: BLUE }}>
                  <span className="text-[11px] text-white/60 bg-white/15 rounded-full px-2.5 py-0.5 self-start">Bento</span>
                  <div className="text-[18px] font-bold leading-tight">Entry-точка</div>
                </div>
                <div className="rounded-3xl p-6 min-h-[120px] flex flex-col justify-between transition-transform duration-300 hover:-translate-y-1" style={{ backgroundColor: '#f4f4f4', color: '#121212' }}>
                  <span className="text-[11px] bg-black/5 rounded-full px-2.5 py-0.5 self-start">Bento</span>
                  <div className="text-[18px] font-bold leading-tight">rounded-3xl</div>
                </div>
              </div>
            </div>
          }
        />

        {/* INPUTS */}
        <Row
          title="Поля ввода"
          hint="v2: rounded-xl + Onest. Label-канон без изменений."
          before={
            <div className="max-w-[360px] space-y-3">
              <div>
                <label className="block text-body-sm font-medium text-mp-gray-700 mb-2">Email</label>
                <Input type="email" placeholder="you@example.com" />
              </div>
            </div>
          }
          after={
            <div className="max-w-[360px] space-y-3">
              <div>
                <label className="block text-[14px] font-medium text-mp-gray-700 mb-2">Email</label>
                <input type="email" placeholder="you@example.com" className="flex w-full h-11 rounded-xl border border-mp-gray-200 bg-white px-4 text-[16px] text-mp-gray-900 placeholder:text-mp-gray-400 focus:outline-none focus:border-mp-blue-500 focus:ring-2 focus:ring-mp-blue-500/20 transition-all" />
              </div>
            </div>
          }
        />

        {/* BADGES + palette note */}
        <Row
          title="Бейджи и палитра"
          hint="Форма (rounded-full) уже совпадает. v2: дисциплина палитры — ядро BLUE / GREEN / ORANGE / DARK; категориальный разброс стандартизируем."
          before={
            <div className="flex flex-wrap gap-2">
              <Badge>default</Badge>
              <Badge variant="primary">primary</Badge>
              <Badge variant="success">success</Badge>
              <Badge variant="featured">featured</Badge>
              <Badge variant="warning">warning</Badge>
            </div>
          }
          after={
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-mp-blue-100 text-mp-blue-700">primary</span>
              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-mp-green-100 text-mp-green-800">success</span>
              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: ORANGE }}>highlight</span>
              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: DARK }}>dark</span>
            </div>
          }
        />

        {/* NEW PRIMITIVES — DarkIsland + Bento on a LIGHT canvas */}
        <section className="border-t border-mp-gray-200 pt-8">
          <h3 className="text-heading font-semibold text-mp-gray-900">Новые примитивы (на светлом холсте)</h3>
          <p className="text-body-sm text-mp-gray-500 mt-1 mb-5">Глубину маркетинга вносим тёмными островами в светлый продукт — холст остаётся светлым.</p>

          <div className={`${onest.className} space-y-5`}>
            {/* DarkIsland */}
            <div className="rounded-3xl p-8 sm:p-10 text-white" style={{ backgroundColor: DARK }}>
              <div className="text-[12px] uppercase tracking-wider text-white/40 mb-2">DarkIsland — hero / CTA</div>
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
                <div>
                  <h4 className="text-[26px] sm:text-[32px] font-bold leading-tight tracking-tight">Привет, селлер! Продолжим обучение?</h4>
                  <p className="text-white/60 text-[15px] mt-2">Тёмный остров на дашборде даёт маркет-глубину, не делая весь экран тёмным.</p>
                </div>
                <button className="shrink-0 inline-flex items-center justify-center rounded-full h-12 px-8 text-[15px] font-medium text-white bg-mp-blue-500 hover:bg-mp-blue-600 transition-colors">К плану →</button>
              </div>
              <div className="mt-6 flex gap-8">
                <div><div className="text-[36px] font-bold leading-none">400+</div><div className="text-white/50 text-[13px] mt-1">уроков</div></div>
                <div><div className="text-[36px] font-bold leading-none">5</div><div className="text-white/50 text-[13px] mt-1">направлений</div></div>
              </div>
            </div>

            {/* BentoCard row */}
            <div>
              <div className="text-[12px] uppercase tracking-wider text-mp-gray-400 mb-3">BentoCard — entry-точки</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-3xl p-7 min-h-[150px] flex flex-col justify-between text-white transition-transform duration-300 hover:-translate-y-1" style={{ backgroundColor: BLUE }}>
                  <span className="text-[12px] text-white/60">Персональный план</span>
                  <div className="text-[20px] font-bold leading-tight">Что учить дальше</div>
                </div>
                <div className="rounded-3xl p-7 min-h-[150px] flex flex-col justify-between transition-transform duration-300 hover:-translate-y-1 border border-mp-gray-200 bg-white">
                  <span className="text-[12px] text-mp-gray-500">Решения под задачу</span>
                  <div className="text-[20px] font-bold leading-tight text-mp-gray-900">Найти по цели</div>
                </div>
                <div className="rounded-3xl p-7 min-h-[150px] flex flex-col justify-between transition-transform duration-300 hover:-translate-y-1" style={{ backgroundColor: '#f4f4f4', color: '#121212' }}>
                  <span className="text-[12px] opacity-60">База знаний</span>
                  <div className="text-[20px] font-bold leading-tight">Все материалы</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* RADIUS scale before/after */}
        <Row
          title="Шкала радиусов"
          hint="Meet-in-middle: мягче, чем сейчас, но не полные 40px маркетинга."
          before={
            <div className="flex items-end gap-4">
              {[['rounded-lg', 'кнопка 8'], ['rounded-xl', 'карта 12']].map(([c, l]) => (
                <div key={c} className="flex flex-col items-center"><div className={`${c} h-16 w-16 bg-mp-blue-100 border border-mp-blue-300`} /><span className="text-[10px] text-mp-gray-500 mt-1">{l}</span></div>
              ))}
            </div>
          }
          after={
            <div className="flex items-end gap-4">
              {[['rounded-full', 'CTA'], ['rounded-xl', 'кнопка 12'], ['rounded-2xl', 'карта 16'], ['rounded-3xl', 'feature 24']].map(([c, l]) => (
                <div key={c} className="flex flex-col items-center"><div className={`${c} h-16 w-16 bg-mp-blue-100 border border-mp-blue-300`} /><span className="text-[10px] text-mp-gray-500 mt-1">{l}</span></div>
              ))}
            </div>
          }
        />

        {/* Guardrails */}
        <section className={`${onest.className} rounded-2xl border border-dashed border-mp-blue-300 bg-mp-blue-50 p-6`}>
          <div className="text-[14px] font-semibold text-mp-blue-700 mb-1">Гард-рейлы</div>
          <p className="text-[14px] text-mp-gray-700">
            Плотные данные (админ-таблицы, длинные формы) остаются утилитарными — туже радиусы (lg), бордер-белые карты,
            без pill на row-actions. Тёмные острова — ≤1 на экран + контраст AA. Функциональный цвет (success/error) —
            всегда с иконкой/текстом, не только цветом.
          </p>
        </section>
      </main>
    </div>
  );
}
