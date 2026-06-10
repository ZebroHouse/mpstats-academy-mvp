'use client';

import { Onest } from 'next/font/google';
import { V8Header } from '@/components/v8/V8Header';
import { V8Footer } from '@/components/v8/V8Footer';
import { useState, useEffect } from 'react';
import { Reveal } from '@/components/v8/Reveal';
import { createClient } from '@/lib/supabase/client';

const onest = Onest({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '700'],
  display: 'swap',
});

/* ── Brand tokens ──────────────────────────────────────── */
const BLUE = '#2C4FF8';
const BLUE_HOVER = '#1D39C1';
const ORANGE = '#ff6b16';
const DARK = '#0F172A';
const GRAY_BG = '#f4f4f4';
const TEXT = '#121212';

/* ── Data: 5 Skill Axes ────────────────────────────────── */

const SKILL_AXES_DATA = [
  { name: 'Аналитика', color: '#2C4FF8', desc: 'Юнит-экономика, ABC-анализ, продажи, ДРР, оборачиваемость' },
  { name: 'Маркетинг', color: '#ff6b16', desc: 'Реклама, ставки, продвижение, SEO' },
  { name: 'Контент', color: '#10B981', desc: 'Карточки товаров, инфографика, тестирование контента' },
  { name: 'Операции', color: '#8B5CF6', desc: 'Поставки, склады, остатки, FBO/FBS, кабинет, работа с Ozon' },
  { name: 'Финансы', color: '#EC4899', desc: 'Маржинальность, себестоимость, налоги и финансовые показатели' },
];

/* ── Data: What you get ────────────────────────────────── */

const RESULTS_DATA = [
  { title: 'Карта навыков', desc: 'Увидите сильные стороны и направления, которым стоит уделить больше внимания.' },
  { title: 'Персональные рекомендации', desc: 'Узнаете, какие темы помогут быстрее продвинуться к вашей цели.' },
  { title: 'План обучения', desc: 'Получите последовательность уроков с учетом текущего уровня подготовки.' },
  { title: 'Подборка уроков', desc: 'Сразу перейдете к материалам, которые важно изучить в первую очередь.' },
];

/* ── Data: How it works ────────────────────────────────── */

const STEPS_DATA = [
  { num: '01', title: 'Отвечаете на вопросы', desc: 'Вопросы охватывают 5 направлений работы на маркетплейсах.' },
  { num: '02', title: 'AI анализирует ответы', desc: 'Оценивает текущий уровень по каждому направлению.' },
  { num: '03', title: 'Получаете рекомендации', desc: 'Сразу после прохождения видите результаты и персональный план обучения.' },
];

/* ── Hero SkillRadar (concentric circles) ──────────────── */

const HERO_AXES = [
  { label: 'Аналитика', color: '#2C4FF8' },
  { label: 'Маркетинг', color: '#ff6b16' },
  { label: 'Контент', color: '#10B981' },
  { label: 'Операции', color: '#8B5CF6' },
  { label: 'Финансы', color: '#EC4899' },
];

const SKILL_RADIUS_PCT = 47;

function SkillRadar() {
  return (
    <div className="relative w-[260px] h-[260px] md:w-[340px] md:h-[340px] mx-auto">
      {/* Concentric circle rings — pulsing ripple */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="w-[230px] h-[230px] md:w-[290px] md:h-[290px] rounded-full border border-white/25"
          style={{ animation: 'v8-ring-pulse 3.6s ease-in-out 1.2s infinite' }}
        />
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="w-[155px] h-[155px] md:w-[195px] md:h-[195px] rounded-full border border-white/25"
          style={{ animation: 'v8-ring-pulse 3.6s ease-in-out 0.6s infinite' }}
        />
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="w-[80px] h-[80px] md:w-[100px] md:h-[100px] rounded-full border border-white/25"
          style={{ animation: 'v8-ring-pulse 3.6s ease-in-out 0s infinite' }}
        />
      </div>
      {/* Axis dots orbiting around centre — labels counter-rotate to stay upright */}
      <div className="absolute inset-0" style={{ animation: 'v8-radar-rotate 36s linear infinite' }}>
        {HERO_AXES.map((a, i) => {
          const angle = (i / HERO_AXES.length) * 360 - 90;
          const rad = (angle * Math.PI) / 180;
          const x = 50 + SKILL_RADIUS_PCT * Math.cos(rad);
          const y = 50 + SKILL_RADIUS_PCT * Math.sin(rad);
          return (
            <div
              key={a.label}
              className="absolute"
              style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%,-50%)' }}
            >
              <div style={{ animation: 'v8-radar-rotate 36s linear infinite reverse' }}>
                <div className="flex flex-col items-center gap-1">
                  <div
                    className="w-5 h-5 md:w-6 md:h-6 rounded-full"
                    style={{ backgroundColor: a.color }}
                  />
                  <span className="text-[10px] md:text-[11px] font-medium whitespace-nowrap text-white/70">
                    {a.label}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {/* Center dot */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="w-4 h-4 rounded-full"
          style={{ backgroundColor: BLUE, animation: 'v8-pulse 2.6s ease-in-out infinite' }}
        />
      </div>
    </div>
  );
}

/* ── Icons ─────────────────────────────────────────────── */

function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/* ── Page Component ────────────────────────────────────── */

export default function DesignNewV8Diagnostic() {
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setIsAuthed(!!data.user));
  }, []);

  const ctaHref = isAuthed === true ? '/diagnostic' : '/register';

  return (
    <div className={onest.className} style={{ color: TEXT }}>

      <V8Header onDarkHero={true} />

      {/* ── 1. Hero (dark) ─────────────────────────────── */}
      <section
        style={{ backgroundColor: DARK }}
        className="pt-[120px] sm:pt-[140px] pb-[80px] sm:pb-[120px] px-4 sm:px-6 md:px-10 lg:px-0"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          setMouse({
            x: (e.clientX - cx) / rect.width,
            y: (e.clientY - cy) / rect.height,
          });
        }}
        onMouseLeave={() => setMouse({ x: 0, y: 0 })}
      >
        <div className="max-w-[1160px] mx-auto flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
          <div className="flex-1 text-center lg:text-left">
            <h1 className="text-[28px] sm:text-[36px] md:text-[48px] lg:text-[56px] font-bold leading-[1.1] tracking-tight text-white">
              AI-диагностика покажет,{' '}
              <span className="block">чему уделить внимание</span>
              <span className="block">в первую очередь</span>
            </h1>
            <p className="mt-5 sm:mt-6 text-[16px] sm:text-[18px] leading-relaxed max-w-[520px] mx-auto lg:mx-0" style={{ color: 'rgba(255,255,255,0.7)' }}>
              За 10 минут оценит ваш уровень по 5 направлениям и подготовит персональный план обучения
            </p>
            <div className="mt-8 sm:mt-10 flex justify-center lg:justify-start">
              <a
                href={ctaHref}
                className="inline-flex items-center justify-center rounded-full h-[52px] sm:h-[62px] px-8 sm:px-10 text-[15px] sm:text-[16px] font-medium text-white transition-colors"
                style={{ backgroundColor: BLUE }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = BLUE_HOVER)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = BLUE)}
              >
                Пройти диагностику
              </a>
            </div>
          </div>
          <div
            className="flex-shrink-0 w-full max-w-[320px] lg:w-[320px]"
            style={{
              transform: `translate(${mouse.x * -14}px, ${mouse.y * -14}px)`,
              transition: 'transform 400ms cubic-bezier(0.22, 1, 0.36, 1)',
              willChange: 'transform',
            }}
          >
            <SkillRadar />
          </div>
        </div>
      </section>

      {/* ── 2. Результаты диагностики (white) ──────────── */}
      <section id="results" className="py-[80px] sm:py-[120px] px-4 sm:px-6 md:px-10 lg:px-0 bg-white">
        <div className="max-w-[1160px] mx-auto">
          <h2 className="text-[24px] sm:text-[32px] md:text-[40px] font-bold tracking-tight text-center mb-10 sm:mb-14">
            Результаты диагностики
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {RESULTS_DATA.map((item, i) => (
              <Reveal key={item.title} className="rounded-[40px] p-8 transition-transform duration-300 hover:-translate-y-1" style={{ backgroundColor: GRAY_BG }} delay={i * 80}>
                <h3 className="text-[18px] sm:text-[20px] font-bold mb-3" style={{ color: TEXT }}>
                  {item.title}
                </h3>
                <p className="text-[14px] sm:text-[15px] leading-relaxed" style={{ color: TEXT, opacity: 0.7 }}>
                  {item.desc}
                </p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3. Как проходит диагностика (gray bg) ──────── */}
      <section id="how" className="py-[80px] sm:py-[120px] px-4 sm:px-6 md:px-10 lg:px-0" style={{ backgroundColor: GRAY_BG }}>
        <div className="max-w-[1160px] mx-auto">
          <h2 className="text-[24px] sm:text-[32px] md:text-[40px] font-bold tracking-tight text-center mb-10 sm:mb-14">
            Как проходит диагностика
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {STEPS_DATA.map((step, i) => (
              <Reveal key={step.num} className="flex flex-col items-center text-center" delay={i * 100}>
                <div
                  className="inline-flex items-center justify-center w-[56px] h-[56px] rounded-full text-[20px] font-bold text-white mb-5"
                  style={{ backgroundColor: BLUE }}
                >
                  {step.num}
                </div>
                <h3 className="text-[18px] sm:text-[20px] font-bold mb-3" style={{ color: TEXT }}>
                  {step.title}
                </h3>
                <p className="text-[14px] sm:text-[15px] leading-relaxed max-w-[280px]" style={{ color: TEXT, opacity: 0.7 }}>
                  {step.desc}
                </p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4. Какие направления оценивает (white) ────── */}
      <section id="axes" className="py-[80px] sm:py-[120px] px-4 sm:px-6 md:px-10 lg:px-0 bg-white">
        <div className="max-w-[1160px] mx-auto">
          <h2 className="text-[24px] sm:text-[32px] md:text-[40px] font-bold tracking-tight text-center mb-10 sm:mb-14">
            Какие направления оценивает диагностика
          </h2>

          {/* Bento grid: large card (2 cols) + 4 smaller */}
          <style dangerouslySetInnerHTML={{ __html: `
            @media (min-width: 1024px) {
              .axes-bento {
                grid-template-columns: repeat(3, 1fr) !important;
                grid-template-rows: auto auto;
                grid-template-areas:
                  "main main ax1"
                  "ax2  ax3  ax4"
                ;
              }
              .axes-main { grid-area: main; }
              .axes-1 { grid-area: ax1; }
              .axes-2 { grid-area: ax2; }
              .axes-3 { grid-area: ax3; }
              .axes-4 { grid-area: ax4; }
            }
            @media (min-width: 640px) and (max-width: 1023px) {
              .axes-bento {
                grid-template-columns: repeat(2, 1fr) !important;
              }
              .axes-main { grid-column: span 2; }
            }
          `}} />

          <div className="axes-bento grid gap-4" style={{ gridTemplateColumns: '1fr' }}>
            {/* Large card: overview */}
            <div className="axes-main rounded-[40px] p-8 sm:p-10 flex flex-col justify-between min-h-[280px] lg:min-h-[320px]" style={{ backgroundColor: BLUE }}>
              <div>
                <span className="inline-block text-[13px] font-medium text-white/60 uppercase tracking-wider mb-4">AI-диагностика</span>
                <h3 className="text-[24px] sm:text-[28px] lg:text-[32px] font-bold text-white leading-tight">
                  5 направлений
                </h3>
                <p className="mt-3 text-[15px] sm:text-[16px] leading-relaxed text-white/70 max-w-[420px]">
                  Каждый вопрос оценивает конкретное направление. Результат — детальный профиль ваших компетенций на маркетплейсах.
                </p>
              </div>
              <div className="mt-6 flex gap-2 flex-wrap">
                {SKILL_AXES_DATA.map((axis) => (
                  <span key={axis.name} className="text-[12px] text-white/50 bg-white/10 rounded-full px-3 py-1 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: axis.color }} />
                    {axis.name}
                  </span>
                ))}
              </div>
            </div>

            {/* 4 axis cards (first axis is in the big card, show remaining 4 + one extra) */}
            {SKILL_AXES_DATA.slice(0, 4).map((axis, i) => (
              <div
                key={axis.name}
                className={`axes-${i + 1} rounded-[40px] p-8`}
                style={{ backgroundColor: GRAY_BG }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: axis.color }} />
                  <h3 className="text-[18px] sm:text-[20px] font-bold">{axis.name}</h3>
                </div>
                <p className="text-[14px] sm:text-[15px] leading-relaxed" style={{ color: TEXT, opacity: 0.7 }}>
                  {axis.desc}
                </p>
              </div>
            ))}
          </div>

          {/* 5th axis card — full width below */}
          <div className="mt-4 rounded-[40px] p-8 flex items-center gap-4" style={{ backgroundColor: GRAY_BG }}>
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: SKILL_AXES_DATA[4].color }} />
            <div>
              <h3 className="text-[18px] sm:text-[20px] font-bold">{SKILL_AXES_DATA[4].name}</h3>
              <p className="text-[14px] sm:text-[15px] leading-relaxed mt-1" style={{ color: TEXT, opacity: 0.7 }}>
                {SKILL_AXES_DATA[4].desc}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. CTA (blue) ─────────────────────────────── */}
      <section id="cta" className="py-[80px] sm:py-[120px] px-4 sm:px-6 md:px-10 lg:px-0" style={{ backgroundColor: BLUE }}>
        <div className="max-w-[760px] mx-auto text-center">
          <h2 className="text-[28px] sm:text-[36px] md:text-[48px] font-bold text-white leading-tight">
            Узнайте, чему стоит уделить{' '}
            <span className="block">внимание в первую очередь</span>
          </h2>
          <p className="mt-4 sm:mt-6 text-[16px] sm:text-[18px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.75)' }}>
            Персональный план обучения формируется сразу после прохождения диагностики
          </p>
          <a
            href={ctaHref}
            className="mt-8 sm:mt-10 inline-flex items-center justify-center rounded-full h-[52px] sm:h-[62px] px-10 sm:px-12 text-[15px] sm:text-[16px] font-medium transition-colors"
            style={{ backgroundColor: 'white', color: BLUE }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#e8e8e8')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'white')}
          >
            Пройти диагностику
          </a>
        </div>
      </section>

      <V8Footer wrapperBg="blue" />
    </div>
  );
}
