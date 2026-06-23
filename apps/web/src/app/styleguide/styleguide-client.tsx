'use client';

/**
 * Internal living styleguide. Renders the CURRENT state of both visual systems:
 * - Marketing (dark): Onest + inline-hex + v8 patterns (specimen-rendered).
 * - Product (light): Inter + mp-* + shadcn (LIVE imported components).
 *
 * Source of truth for the rules: docs/design-system/{tokens,dark,light}.md.
 * V2 goal (separate work): bring the product closer to the marketing language.
 */

import { useState } from 'react';
import { Onest } from 'next/font/google';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Counter } from '@/components/v8/Counter';
import { Reveal } from '@/components/v8/Reveal';

const onest = Onest({ subsets: ['latin', 'cyrillic'], weight: ['400', '500', '600', '700'], display: 'swap' });

// Marketing inline-hex constants (verbatim from marketing page.tsx files).
const BLUE = '#2C4FF8';
const BLUE_HOVER = '#1D39C1';
const ORANGE = '#ff6b16';
const GREEN = '#87F50F';
const DARK = '#0F172A';
const GRAY_BG = '#f4f4f4';
const TEXT = '#121212';

// --- mp-* scales as LITERAL class strings (Tailwind can't see dynamic names) ---
const MP_BLUE = ['bg-mp-blue-50', 'bg-mp-blue-100', 'bg-mp-blue-200', 'bg-mp-blue-300', 'bg-mp-blue-400', 'bg-mp-blue-500', 'bg-mp-blue-600', 'bg-mp-blue-700', 'bg-mp-blue-800', 'bg-mp-blue-900'];
const MP_GREEN = ['bg-mp-green-50', 'bg-mp-green-100', 'bg-mp-green-200', 'bg-mp-green-300', 'bg-mp-green-400', 'bg-mp-green-500', 'bg-mp-green-600', 'bg-mp-green-700', 'bg-mp-green-800', 'bg-mp-green-900'];
const MP_PINK = ['bg-mp-pink-50', 'bg-mp-pink-100', 'bg-mp-pink-200', 'bg-mp-pink-300', 'bg-mp-pink-400', 'bg-mp-pink-500', 'bg-mp-pink-600', 'bg-mp-pink-700', 'bg-mp-pink-800', 'bg-mp-pink-900'];
const MP_GRAY = ['bg-mp-gray-50', 'bg-mp-gray-100', 'bg-mp-gray-200', 'bg-mp-gray-300', 'bg-mp-gray-400', 'bg-mp-gray-500', 'bg-mp-gray-600', 'bg-mp-gray-700', 'bg-mp-gray-800', 'bg-mp-gray-900'];
const STEPS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'];

function ScaleRow({ name, classes }: { name: string; classes: string[] }) {
  return (
    <div className="mb-4">
      <div className="text-body-sm font-medium text-mp-gray-700 mb-1.5">{name}</div>
      <div className="grid grid-cols-5 sm:grid-cols-10 gap-1">
        {classes.map((c, i) => (
          <div key={c} className="flex flex-col items-center">
            <div className={`${c} h-10 w-full rounded-md border border-mp-gray-200`} />
            <span className="text-[10px] text-mp-gray-500 mt-1">{STEPS[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HexSwatch({ hex, label }: { hex: string; label: string }) {
  return (
    <div className="flex flex-col items-center w-20">
      <div className="h-12 w-full rounded-md border border-mp-gray-200" style={{ backgroundColor: hex }} />
      <span className="text-[11px] font-medium text-mp-gray-700 mt-1">{label}</span>
      <span className="text-[10px] text-mp-gray-500">{hex}</span>
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-heading-xl font-bold text-mp-gray-900 mb-1">{children}</h2>;
}

function Sub({ children }: { children: React.ReactNode }) {
  return <p className="text-body-sm text-mp-gray-500 mb-6">{children}</p>;
}

export function StyleguideClient() {
  const [sw, setSw] = useState(true);
  const [cb, setCb] = useState(true);

  return (
    <div className="min-h-screen bg-mp-gray-50">
      {/* Intro */}
      <header className="bg-mp-blue-900 text-white px-6 py-10 sm:px-10">
        <div className="max-w-[1100px] mx-auto">
          <div className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/70 mb-3">
            Internal · не индексируется · env-gated
          </div>
          <h1 className="text-display-sm font-bold tracking-tight">MAAL Styleguide</h1>
          <p className="text-body text-white/70 mt-2 max-w-[640px]">
            Текущее состояние двух визуальных систем. Правила — в{' '}
            <code className="text-white/90">docs/design-system/</code>. V2 (отдельно): сблизить продукт с маркетингом.
          </p>
          <nav className="flex flex-wrap gap-2 mt-5 text-body-sm">
            <a href="#tokens" className="rounded-full bg-white/10 px-4 py-1.5 hover:bg-white/20 transition-colors">Токены</a>
            <a href="#marketing" className="rounded-full bg-white/10 px-4 py-1.5 hover:bg-white/20 transition-colors">Маркетинг (dark)</a>
            <a href="#product" className="rounded-full bg-white/10 px-4 py-1.5 hover:bg-white/20 transition-colors">Продукт (light)</a>
            <a href="/styleguide/v2" className="rounded-full bg-mp-blue-500 px-4 py-1.5 hover:bg-mp-blue-600 transition-colors">→ v2 (предложение)</a>
          </nav>
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto px-6 py-12 sm:px-10 space-y-20">
        {/* ============================ TOKENS ============================ */}
        <section id="tokens" className="scroll-mt-6">
          <H2>1. Токены</H2>
          <Sub>Общая база обеих систем. Якорь сближения: mp-blue-500 = BLUE = --primary = #2C4FF8.</Sub>

          <h3 className="text-heading font-semibold text-mp-gray-900 mb-3">Brand-шкалы (mp-*) — продукт</h3>
          <ScaleRow name="mp-blue" classes={MP_BLUE} />
          <ScaleRow name="mp-green" classes={MP_GREEN} />
          <ScaleRow name="mp-pink" classes={MP_PINK} />
          <ScaleRow name="mp-gray" classes={MP_GRAY} />

          <h3 className="text-heading font-semibold text-mp-gray-900 mt-8 mb-3">Inline-hex константы — маркетинг</h3>
          <div className="flex flex-wrap gap-4">
            <HexSwatch hex={BLUE} label="BLUE" />
            <HexSwatch hex={BLUE_HOVER} label="BLUE_HOVER" />
            <HexSwatch hex={ORANGE} label="ORANGE" />
            <HexSwatch hex={GREEN} label="GREEN" />
            <HexSwatch hex={DARK} label="DARK" />
            <HexSwatch hex="#0a0f1e" label="footer" />
            <HexSwatch hex={GRAY_BG} label="GRAY_BG" />
            <HexSwatch hex={TEXT} label="TEXT" />
            <HexSwatch hex="#10B981" label="emerald" />
            <HexSwatch hex="#8B5CF6" label="violet" />
          </div>

          <h3 className="text-heading font-semibold text-mp-gray-900 mt-8 mb-3">Семантические токены (shadcn / --vars)</h3>
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col items-center w-24"><div className="h-12 w-full rounded-md bg-primary" /><span className="text-[11px] text-mp-gray-700 mt-1">primary</span></div>
            <div className="flex flex-col items-center w-24"><div className="h-12 w-full rounded-md bg-secondary border border-mp-gray-200" /><span className="text-[11px] text-mp-gray-700 mt-1">secondary</span></div>
            <div className="flex flex-col items-center w-24"><div className="h-12 w-full rounded-md bg-muted border border-mp-gray-200" /><span className="text-[11px] text-mp-gray-700 mt-1">muted</span></div>
            <div className="flex flex-col items-center w-24"><div className="h-12 w-full rounded-md bg-accent" /><span className="text-[11px] text-mp-gray-700 mt-1">accent</span></div>
            <div className="flex flex-col items-center w-24"><div className="h-12 w-full rounded-md bg-destructive" /><span className="text-[11px] text-mp-gray-700 mt-1">destructive</span></div>
            <div className="flex flex-col items-center w-24"><div className="h-12 w-full rounded-md bg-card border border-border" /><span className="text-[11px] text-mp-gray-700 mt-1">card</span></div>
          </div>

          <h3 className="text-heading font-semibold text-mp-gray-900 mt-8 mb-3">Радиусы</h3>
          <div className="flex flex-wrap items-end gap-4">
            {[
              { cls: 'rounded-lg', label: 'lg 8px (продукт btn/input)' },
              { cls: 'rounded-xl', label: 'xl 12px (продукт card)' },
              { cls: 'rounded-[24px]', label: '24px (маркет моб)' },
              { cls: 'rounded-[32px]', label: '32px (маркет step)' },
              { cls: 'rounded-[40px]', label: '40px (маркет card)' },
              { cls: 'rounded-full', label: 'full (btn/badge)' },
            ].map((r) => (
              <div key={r.cls} className="flex flex-col items-center">
                <div className={`${r.cls} h-16 w-16 bg-mp-blue-100 border border-mp-blue-300`} />
                <span className="text-[10px] text-mp-gray-500 mt-1 w-20 text-center">{r.label}</span>
              </div>
            ))}
          </div>

          <h3 className="text-heading font-semibold text-mp-gray-900 mt-8 mb-3">Тени (продукт)</h3>
          <div className="flex flex-wrap gap-6">
            {['shadow-mp-sm', 'shadow-mp', 'shadow-mp-md', 'shadow-mp-lg', 'shadow-mp-card', 'shadow-mp-card-hover'].map((s) => (
              <div key={s} className="flex flex-col items-center">
                <div className={`${s} h-16 w-24 rounded-xl bg-white`} />
                <span className="text-[10px] text-mp-gray-500 mt-2">{s.replace('shadow-', '')}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ============================ MARKETING (DARK) ============================ */}
        <section id="marketing" className="scroll-mt-6">
          <H2>2. Маркетинг (dark)</H2>
          <Sub>
            Onest + inline-hex + v8-компоненты + inline-SVG. Кнопки/карты ниже — specimen с каноничными классами
            (на лендингах это inline-JSX, не компоненты). Header/Footer см. на реальных страницах (/, /pricing).
          </Sub>

          <div className={`${onest.className} rounded-[32px] overflow-hidden border border-mp-gray-200`} style={{ backgroundColor: DARK }}>
            <div className="p-8 sm:p-12 space-y-12">
              {/* Type specimens */}
              <div>
                <div className="text-[12px] uppercase tracking-wider text-white/40 mb-4">Типографика (Onest, произвольные px)</div>
                <h1 className="text-[28px] sm:text-[36px] md:text-[48px] lg:text-[56px] font-bold leading-[1.1] tracking-tight text-white">H1 hero — заголовок</h1>
                <h2 className="text-[24px] sm:text-[32px] md:text-[40px] font-bold tracking-tight text-white mt-4">H2 секции</h2>
                <p className="text-[16px] sm:text-[18px] leading-relaxed mt-3" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  Body hero — подзаголовок на тёмном фоне, приглушённый до 70% белого.
                </p>
                <p className="text-[15px] sm:text-[17px] leading-relaxed text-white/60 mt-2">Body секции.</p>
              </div>

              {/* Buttons */}
              <div>
                <div className="text-[12px] uppercase tracking-wider text-white/40 mb-4">Кнопки — rounded-full, font-medium</div>
                <div className="flex flex-wrap items-center gap-4">
                  <button
                    className="inline-flex items-center justify-center rounded-full h-[52px] sm:h-[62px] px-8 sm:px-10 text-[15px] sm:text-[16px] font-medium text-white transition-colors"
                    style={{ backgroundColor: BLUE }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = BLUE_HOVER)}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = BLUE)}
                  >
                    Primary
                  </button>
                  <button className="inline-flex items-center justify-center rounded-full h-[52px] sm:h-[62px] px-8 sm:px-10 text-[15px] sm:text-[16px] font-medium text-white border border-white/30 transition-colors hover:bg-white/10">
                    Secondary / outline
                  </button>
                  <button className="inline-flex items-center justify-center rounded-full h-[44px] px-6 text-[14px] font-medium text-white" style={{ backgroundColor: BLUE }}>
                    Навбар CTA
                  </button>
                  <a className="inline-flex items-center gap-2 text-[14px] sm:text-[15px] font-medium hover:opacity-80" style={{ color: '#7590FA' }}>
                    Текст-ссылка →
                  </a>
                </div>
              </div>

              {/* Cards */}
              <div>
                <div className="text-[12px] uppercase tracking-wider text-white/40 mb-4">Карты — rounded-[40px], hover -translate-y-1</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                  <div className="rounded-[40px] p-8 min-h-[200px] flex flex-col justify-between transition-transform duration-300 hover:-translate-y-1" style={{ backgroundColor: BLUE }}>
                    <span className="text-[12px] text-white/50 bg-white/10 rounded-full px-3 py-1 self-start">Бейдж</span>
                    <h3 className="text-[24px] font-bold text-white leading-tight">Bento BLUE</h3>
                  </div>
                  <div className="rounded-[40px] p-8 min-h-[200px] flex flex-col justify-between transition-transform duration-300 hover:-translate-y-1" style={{ backgroundColor: GRAY_BG, color: TEXT }}>
                    <span className="text-[12px] bg-[#121212]/5 rounded-full px-3 py-1 self-start">Чип</span>
                    <h3 className="text-[24px] font-bold leading-tight">Bento GRAY</h3>
                  </div>
                  <div className="rounded-[40px] p-8 min-h-[200px] flex flex-col justify-between transition-transform duration-300 hover:-translate-y-1" style={{ backgroundColor: ORANGE }}>
                    <span className="text-[12px] text-white/70 bg-white/15 rounded-full px-3 py-1 self-start">Акцент</span>
                    <h3 className="text-[24px] font-bold text-white leading-tight">Bento ORANGE</h3>
                  </div>
                </div>
              </div>

              {/* Live v8 motion */}
              <div>
                <div className="text-[12px] uppercase tracking-wider text-white/40 mb-4">Живые v8-компоненты: Counter + Reveal</div>
                <Reveal>
                  <Counter end={400} suffix="+" className="text-[56px] sm:text-[64px] font-bold leading-none text-white" />
                  <p className="text-white/50 text-[14px] mt-1">Counter (анимация при входе во вьюпорт) внутри Reveal (fade-up).</p>
                </Reveal>
              </div>
            </div>
          </div>
        </section>

        {/* ============================ PRODUCT (LIGHT) ============================ */}
        <section id="product" className="scroll-mt-6">
          <H2>3. Продукт (light)</H2>
          <Sub>
            Inter + mp-* + shadcn. Всё ниже — РЕАЛЬНЫЕ импортированные компоненты из components/ui (live).
          </Sub>

          {/* Buttons */}
          <h3 className="text-heading font-semibold text-mp-gray-900 mb-3">Button — варианты</h3>
          <div className="flex flex-wrap gap-3 mb-5">
            <Button>default</Button>
            <Button variant="success">success</Button>
            <Button variant="featured">featured</Button>
            <Button variant="destructive">destructive</Button>
            <Button variant="outline">outline</Button>
            <Button variant="outline-success">outline-success</Button>
            <Button variant="secondary">secondary</Button>
            <Button variant="ghost">ghost</Button>
            <Button variant="link">link</Button>
          </div>
          <h3 className="text-heading font-semibold text-mp-gray-900 mb-3">Button — размеры</h3>
          <div className="flex flex-wrap items-center gap-3 mb-8">
            <Button size="sm">sm</Button>
            <Button size="default">default</Button>
            <Button size="lg">lg</Button>
            <Button size="xl">xl</Button>
          </div>

          {/* Cards */}
          <h3 className="text-heading font-semibold text-mp-gray-900 mb-3">Card — варианты (rounded-xl)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            <Card>
              <CardHeader>
                <CardTitle>default</CardTitle>
                <CardDescription>bg-white, border, shadow-mp-card</CardDescription>
              </CardHeader>
              <CardContent className="text-body-sm text-mp-gray-700">Контент карточки.</CardContent>
            </Card>
            <Card variant="soft-blue">
              <CardHeader>
                <CardTitle>soft-blue</CardTitle>
                <CardDescription>bg-mp-blue-50</CardDescription>
              </CardHeader>
              <CardContent className="text-body-sm text-mp-gray-700">Entry-точка.</CardContent>
            </Card>
            <Card variant="default" interactive>
              <CardHeader>
                <CardTitle>interactive</CardTitle>
                <CardDescription>hover: lift + shadow</CardDescription>
              </CardHeader>
              <CardContent className="text-body-sm text-mp-gray-700">Наведи курсор.</CardContent>
            </Card>
          </div>

          {/* Badges */}
          <h3 className="text-heading font-semibold text-mp-gray-900 mb-3">Badge</h3>
          <div className="flex flex-wrap gap-2 mb-8">
            <Badge>default</Badge>
            <Badge variant="primary">primary</Badge>
            <Badge variant="success">success</Badge>
            <Badge variant="featured">featured</Badge>
            <Badge variant="hot">hot</Badge>
            <Badge variant="warning">warning</Badge>
            <Badge variant="destructive">destructive</Badge>
            <Badge variant="premium">premium</Badge>
            <Badge variant="outline-primary">outline-primary</Badge>
          </div>

          {/* Form */}
          <h3 className="text-heading font-semibold text-mp-gray-900 mb-3">Форма — канон (label + Input)</h3>
          <Card className="max-w-[460px] mb-8">
            <CardContent className="p-6 space-y-4">
              <div>
                <label className="block text-body-sm font-medium text-mp-gray-700 mb-2">Email (default)</label>
                <Input type="email" placeholder="you@example.com" />
              </div>
              <div>
                <label className="block text-body-sm font-medium text-mp-gray-700 mb-2">Ошибка (error)</label>
                <Input error placeholder="Неверное значение" defaultValue="bad@" />
              </div>
              <div>
                <label className="block text-body-sm font-medium text-mp-gray-700 mb-2">Успех (success)</label>
                <Input success defaultValue="ok@example.com" />
              </div>
              <div className="flex items-center gap-6 pt-1">
                <label className="flex items-center gap-2 text-body-sm text-mp-gray-700">
                  <Switch checked={sw} onCheckedChange={setSw} /> Switch
                </label>
                <label className="flex items-center gap-2 text-body-sm text-mp-gray-700">
                  <Checkbox checked={cb} onCheckedChange={(v) => setCb(Boolean(v))} /> Checkbox
                </label>
              </div>
              <Button className="w-full">Сохранить</Button>
            </CardContent>
          </Card>

          {/* Typography */}
          <h3 className="text-heading font-semibold text-mp-gray-900 mb-3">Типографика (Inter, семантическая шкала)</h3>
          <div className="space-y-1">
            <div className="text-display-sm text-mp-gray-900">display-sm — заголовок страницы</div>
            <div className="text-heading-lg text-mp-gray-900">heading-lg — CardTitle</div>
            <div className="text-heading text-mp-gray-900">heading — секция</div>
            <div className="text-body text-mp-gray-700">body — основной текст</div>
            <div className="text-body-sm text-mp-gray-500">body-sm — вторичный</div>
            <div className="text-caption text-mp-gray-500">caption — meta / timestamps</div>
          </div>
        </section>

        {/* ============================ V2 NOTE ============================ */}
        <section className="rounded-2xl border border-dashed border-mp-blue-300 bg-mp-blue-50 p-6">
          <div className="text-body-sm font-semibold text-mp-blue-700 mb-1">V2 — направление сближения</div>
          <p className="text-body-sm text-mp-gray-700">
            Сейчас зафиксировано текущее состояние. Цель V2 — приблизить продукт к маркетингу: общий синий уже совпадает
            (#2C4FF8), на очереди — типографика, радиусы и тон карточек. Правила и расхождения — в{' '}
            <code>docs/design-system/light.md</code> §9.
          </p>
        </section>
      </main>
    </div>
  );
}
