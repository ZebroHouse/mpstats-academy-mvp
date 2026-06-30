'use client';

import { Suspense, useState, useEffect } from 'react';
import { Onest } from 'next/font/google';
import { V8Header } from '@/components/v8/V8Header';
import { V8Footer } from '@/components/v8/V8Footer';
import { ReferralTopRibbon } from '@/components/referral/ReferralTopRibbon';
import { Reveal, useReveal } from '@/components/v8/Reveal';
import { Counter } from '@/components/v8/Counter';
import { StickyCTA } from '@/components/v8/StickyCTA';
import { createClient } from '@/lib/supabase/client';
import { getMarketingCta } from '@/lib/marketing-cta';

const onest = Onest({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '700'],
  display: 'swap',
});

/* ── Brand tokens ──────────────────────────────────────── */
const BLUE = '#2C4FF8';
const BLUE_HOVER = '#1D39C1';
const ORANGE = '#ff6b16';
const GREEN = '#87F50F';
const DARK = '#0F172A';
const GRAY_BG = '#f4f4f4';
const TEXT = '#121212';

/* ── Data ──────────────────────────────────────────────── */

const steps = [
  {
    num: '01',
    title: 'Проходите AI-диагностику',
    desc: 'Отвечаете на вопросы по 5 направлениям. В результате видите сильные стороны и темы, которым стоит уделить внимание.',
    badge: 'Быстро',
  },
  {
    num: '02',
    title: 'Получаете персональную программу',
    desc: 'AI составляет актуальный для вас трек обучения и помогает сосредоточиться на темах, которые важно усилить.',
    badge: 'Индивидуально',
  },
  {
    num: '03',
    title: 'Учитесь с AI-ассистентом',
    desc: 'Задаете вопрос и сразу переходите к нужному уроку или фрагменту. Не нужно пересматривать десятки материалов в поисках ответа.',
    badge: 'Удобно',
  },
  {
    num: '04',
    title: 'Обновляете знания',
    desc: 'В каталоге регулярно появляются новые материалы по изменениям Wildberries и Ozon.',
    badge: 'Актуально',
  },
];

type ComparisonRow = {
  param: string;
  value1: string;
  value2: string;
  highlight?: boolean;
};

const comparison: ComparisonRow[] = [
  { param: 'Цена',          value1: '45 000–90 000 ₽ сразу',       value2: '2 990 ₽ в месяц' },
  { param: 'Программа',     value1: 'Один поток для всех',          value2: 'Персональная траектория по AI-диагностике', highlight: true },
  { param: 'Что изучаете',  value1: 'Все темы подряд',             value2: 'Только темы, которые стоит усилить', highlight: true },
  { param: 'Помощь',        value1: 'Ищите ответы в общем чате',    value2: 'AI-ассистент с таймкодами по всему каталогу' },
  { param: 'Обновления',    value1: 'Записи прошлых лет',           value2: 'Материалы регулярно актуализируются' },
];

const segments = [
  { title: 'Новичкам на маркетплейсах', desc: 'Диагностика покажет пробелы и соберет программу с нуля — не надо гадать, с чего начать.' },
  { title: 'Действующим селлерам', desc: 'Усилите знания в аналитике, рекламе и юнит-экономике — программа адаптируется под ваш уровень.' },
  { title: 'Менеджерам маркетплейсов', desc: 'Прокачаете навыки, чтобы расти в должности и работать с более крупными проектами.' },
  { title: 'Владельцам бизнеса', desc: 'Будете увереннее оценивать работу команды и понимать ключевые показатели бизнеса.' },
];

const faqs = [
  {
    q: 'Как работает AI-диагностика?',
    a: 'Вы отвечаете на короткие вопросы по 5 направлениям: аналитика, маркетинг, контент, операции и финансы. Система определяет ваш текущий уровень и формирует персональный план обучения. Диагностика занимает около 10 минут.',
  },
  {
    q: 'Сколько стоит подписка?',
    a: 'Подписка на один курс стоит 1 990 ₽/мес. Полный доступ ко всей платформе — 2 990 ₽/мес. В этот тариф входят AI-диагностика, персональный план обучения и AI-ассистент.',
  },
  {
    q: 'Какие маркетплейсы охватывает платформа?',
    a: 'Платформа помогает развивать навыки для работы с Wildberries и Ozon. Материалы сфокусированы на 5 направлениях: аналитике, маркетинге, контенте, операциях и финансах.',
  },
  {
    q: 'Можно ли отключить подписку?',
    a: 'Да. Подписку можно отключить в личном кабинете в любой момент. После этого ежемесячные списания прекратятся.',
  },
  {
    q: 'Что такое AI-ассистент?',
    a: 'AI-ассистент — это помощник, который быстро находит нужную информацию в материалах платформы. Задайте вопрос прямо в уроке — искусственный интеллект подберет подходящие материалы и покажет точную минуту в видео.',
  },
];

const plans = [
  {
    name: 'Подписка на курс',
    price: '1 990',
    period: '/мес',
    features: [
      'Один курс на выбор',
      'Все уроки по выбранной теме',
      'AI-ассистент в каждом уроке',
      'Персональный план обучения',
    ],
    highlighted: false,
  },
  {
    name: 'Полный доступ',
    price: '2 990',
    period: '/мес',
    features: [
      'Весь каталог по 5 направлениям',
      '400+ уроков, 150+ часов контента',
      'AI-диагностика за 10 минут',
      'AI-ассистент с таймкодами',
      'Персональный план обучения',
      'Гибкая платформа — растет и обновляется',
    ],
    highlighted: true,
  },
];

/* ── Mini Radar SVG (Bento card) ──────────────────────── */

const RADAR_SIZE = 120;
const RADAR_CENTER = RADAR_SIZE / 2;
const RADAR_R = 44;
const AXES = 5;
const AXIS_ANGLES = Array.from({ length: AXES }, (_, i) => (Math.PI * 2 * i) / AXES - Math.PI / 2);
const radarPt = (angle: number, r: number): [number, number] => [
  RADAR_CENTER + r * Math.cos(angle),
  RADAR_CENTER + r * Math.sin(angle),
];
const radarPoly = (pct: number) =>
  AXIS_ANGLES.map((a) => radarPt(a, RADAR_R * pct).map((v) => v.toFixed(1)).join(',')).join(' ');

const radarValues = [0.85, 0.6, 0.9, 0.45, 0.7];
const radarDataPoly = AXIS_ANGLES.map((a, i) =>
  radarPt(a, RADAR_R * radarValues[i]).map((v) => v.toFixed(1)).join(',')
).join(' ');

function MiniRadar() {
  return (
    <svg width={RADAR_SIZE} height={RADAR_SIZE} viewBox={`0 0 ${RADAR_SIZE} ${RADAR_SIZE}`} className="opacity-80">
      {[0.25, 0.5, 0.75, 1].map((p) => (
        <polygon key={p} points={radarPoly(p)} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
      ))}
      {AXIS_ANGLES.map((a, i) => {
        const [x, y] = radarPt(a, RADAR_R);
        return <line key={i} x1={RADAR_CENTER} y1={RADAR_CENTER} x2={x} y2={y} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />;
      })}
      <polygon points={radarDataPoly} fill="rgba(135,245,15,0.25)" stroke={GREEN} strokeWidth="2" />
      {AXIS_ANGLES.map((a, i) => {
        const [cx, cy] = radarPt(a, RADAR_R * radarValues[i]);
        return <circle key={i} cx={cx} cy={cy} r="3" fill="white" />;
      })}
    </svg>
  );
}

/* ── Hero SkillRadar (circles, not pentagons) ────────── */

const SKILL_AXES = [
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
      {/* Concentric circle rings — pulsing ripple from inner to outer */}
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
        {SKILL_AXES.map((a, i) => {
          const angle = (i / SKILL_AXES.length) * 360 - 90;
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

/* ── Icons (inline SVG) ────────────────────────────────── */

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ArrowRight() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/* ── FAQ Item ──────────────────────────────────────────── */

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[#121212]/10 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-6 text-left cursor-pointer"
      >
        <span className="text-[17px] sm:text-[19px] font-medium pr-4" style={{ color: TEXT }}>{q}</span>
        <span className="flex-shrink-0" style={{ color: TEXT }}><ChevronDown open={open} /></span>
      </button>
      <div className={`overflow-hidden transition-all duration-300 ${open ? 'max-h-[400px] pb-6' : 'max-h-0'}`}>
        <p className="text-[15px] sm:text-[16px] leading-relaxed" style={{ color: TEXT, opacity: 0.7 }}>{a}</p>
      </div>
    </div>
  );
}

/* ── Comparison table (desktop, with expanding BLUE column) ── */

function ComparisonTableDesktop() {
  const { ref, visible } = useReveal<HTMLDivElement>();

  const blueStyle = (delay: number) => ({
    backgroundColor: BLUE,
    transform: visible ? 'scaleX(1)' : 'scaleX(0)',
    transformOrigin: 'right' as const,
    transition: `transform 700ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`,
    willChange: 'transform',
  });

  const textStyle = (delay: number) => ({
    opacity: visible ? 1 : 0,
    transition: `opacity 300ms ease-out ${delay + 350}ms`,
  });

  return (
    <div ref={ref} className="hidden md:block rounded-[32px] overflow-hidden border border-[#121212]/10">
      {/* Header */}
      <div className="grid grid-cols-[1fr,1.2fr,1.3fr]">
        <div className="p-5 text-[12px] font-medium uppercase tracking-wider bg-white" style={{ color: TEXT, opacity: 0.4 }}>Параметр</div>
        <div className="p-5 text-[14px] font-bold bg-white" style={{ color: TEXT, opacity: 0.7 }}>Обычный курс</div>
        <div className="p-5 text-[14px] font-bold text-white" style={blueStyle(0)}>
          <span style={textStyle(0)}>Платформа MPSTATS Academy</span>
        </div>
      </div>
      {/* Rows */}
      {comparison.map((row, i) => {
        const delay = 80 + i * 70;
        return (
          <div key={row.param} className="grid grid-cols-[1fr,1.2fr,1.3fr] border-t border-[#121212]/10">
            <div className="p-5 text-[15px] font-semibold bg-white flex items-center" style={{ color: TEXT }}>{row.param}</div>
            <div className="p-5 text-[14px] bg-white flex items-center" style={{ color: TEXT, opacity: 0.7 }}>{row.value1}</div>
            <div className={`p-5 text-[14px] text-white flex items-center ${row.highlight ? 'font-bold' : ''}`} style={blueStyle(delay)}>
              <span style={textStyle(delay)}>{row.value2}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Page Component ────────────────────────────────────── */

/** Высота верхней реф-ленты (h-11) — на неё сдвигаем шапку, когда лента видна. */
const REFERRAL_RIBBON_HEIGHT = 44;

export default function DesignNewV8() {
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [ribbonVisible, setRibbonVisible] = useState(false);
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setIsAuthed(!!data.user));
  }, []);

  // Auth-aware marketing CTAs. Renders as guest until auth resolves (the marketing
  // default), so a guest never flashes a product route.
  const cta = getMarketingCta(isAuthed === true);

  return (
    <div className={onest.className} style={{ color: TEXT }}>

      {/* useSearchParams must sit under a Suspense boundary to avoid prerender bailout in next build. */}
      <Suspense fallback={null}>
        <ReferralTopRibbon onVisibilityChange={setRibbonVisible} />
      </Suspense>
      <V8Header onDarkHero={true} topOffset={ribbonVisible ? REFERRAL_RIBBON_HEIGHT : 0} />

      {/* ── 2. Hero ────────────────────────────────────── */}
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
            <h1 className="text-[28px] sm:text-[36px] md:text-[48px] lg:text-[64px] font-bold leading-[1.1] tracking-tight text-white">
              Первая адаптивная{' '}
              <span className="block">образовательная платформа</span>
              <span className="block">для селлеров</span>
            </h1>
            <p className="mt-5 sm:mt-6 text-[16px] sm:text-[18px] leading-relaxed max-w-[520px] mx-auto lg:mx-0" style={{ color: 'rgba(255,255,255,0.7)' }}>
              Пройдите AI-диагностику за 10 минут и получите программу, которая учитывает ваш запрос и уровень подготовки
            </p>
            <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center lg:justify-start">
              <a
                href={cta.primary.href}
                className="inline-flex items-center justify-center rounded-full h-[52px] sm:h-[62px] px-8 sm:px-10 text-[15px] sm:text-[16px] font-medium text-white transition-colors"
                style={{ backgroundColor: BLUE }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = BLUE_HOVER)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = BLUE)}
              >
                {cta.primary.label}
              </a>
              <a
                href="#тарифы"
                className="inline-flex items-center justify-center rounded-full h-[52px] sm:h-[62px] px-8 sm:px-10 text-[15px] sm:text-[16px] font-medium text-white border border-white/30 transition-colors hover:bg-white/10"
              >
                Посмотреть тарифы
              </a>
            </div>
            <p className="mt-6 sm:mt-8 text-[13px] sm:text-[14px] text-white/50">
              2 990 ₽/мес · Гибкая платформа · 400+ уроков · 5 направлений
            </p>
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

      {/* ── 3. Bento Grid ──────────────────────────────── */}
      <section id="возможности" className="py-[80px] sm:py-[120px] px-4 sm:px-6 md:px-10 lg:px-0 bg-white">
        <div className="max-w-[1160px] mx-auto">
          <h2 className="text-[24px] sm:text-[32px] md:text-[40px] font-bold tracking-tight text-center mb-10 sm:mb-14">
            Все для роста на маркетплейсах
          </h2>

          {/* Bento grid: CSS Grid with asymmetric layout */}
          <div
            className="grid gap-4"
            style={{
              gridTemplateColumns: 'repeat(1, 1fr)',
            }}
          >
            {/* Desktop: use named areas for asymmetric layout */}
            <style dangerouslySetInnerHTML={{ __html: `
              @media (min-width: 1024px) {
                .bento-grid {
                  grid-template-columns: repeat(3, 1fr) !important;
                  grid-template-rows: auto auto auto auto;
                  grid-template-areas:
                    "diag diag plan"
                    "diag diag assist"
                    "lessons live live"
                  ;
                }
                .bento-diag { grid-area: diag; }
                .bento-plan { grid-area: plan; }
                .bento-assist { grid-area: assist; }
                .bento-lessons { grid-area: lessons; }
                .bento-live { grid-area: live; }
              }
              @media (min-width: 640px) and (max-width: 1023px) {
                .bento-grid {
                  grid-template-columns: repeat(2, 1fr) !important;
                }
                .bento-diag { grid-column: span 2; }
                .bento-live { grid-column: span 2; }
              }
            `}} />

            <div className="bento-grid grid gap-4" style={{ gridTemplateColumns: 'repeat(1, 1fr)' }}>

              {/* AI-Diagnostic — big card */}
              <Reveal className="bento-diag rounded-[40px] p-8 sm:p-10 flex flex-col justify-between min-h-[280px] lg:min-h-[400px] transition-transform duration-300 hover:-translate-y-1" style={{ backgroundColor: BLUE }} delay={0}>
                <div>
                  <span className="inline-block text-[13px] font-medium text-white/60 uppercase tracking-wider mb-4">Ключевая особенность</span>
                  <h3 className="text-[24px] sm:text-[28px] lg:text-[32px] font-bold text-white leading-tight">
                    AI-диагностика
                  </h3>
                  <p className="mt-3 text-[15px] sm:text-[16px] leading-relaxed text-white/70 max-w-[420px]">
                    За 10 минут определяет ваш уровень по 5 направлениям и составляет персональный план обучения.
                  </p>
                </div>
                <div className="mt-6 flex items-end justify-between">
                  <div className="flex gap-2 flex-wrap">
                    {['Аналитика', 'Маркетинг', 'Контент', 'Операции', 'Финансы'].map((axis) => (
                      <span key={axis} className="text-[12px] text-white/50 bg-white/10 rounded-full px-3 py-1">{axis}</span>
                    ))}
                  </div>
                  <div className="hidden sm:block flex-shrink-0 ml-4">
                    <MiniRadar />
                  </div>
                </div>
              </Reveal>

              {/* Personal plan */}
              <Reveal className="bento-plan rounded-[40px] p-8 transition-transform duration-300 hover:-translate-y-1" style={{ backgroundColor: GRAY_BG }} delay={80}>
                <h3 className="text-[20px] sm:text-[22px] font-bold mb-4">Персональный план</h3>
                <ul className="space-y-3">
                  {['Исключает знакомые темы', 'Определяет следующие шаги', 'Адаптируется к прогрессу', 'Помогает сосредоточиться на важном'].map((item) => (
                    <li key={item} className="flex items-start gap-3 text-[14px] sm:text-[15px]" style={{ color: TEXT, opacity: 0.8 }}>
                      <span className="flex-shrink-0 mt-0.5" style={{ color: BLUE }}><CheckIcon /></span>
                      {item}
                    </li>
                  ))}
                </ul>
              </Reveal>

              {/* AI assistant */}
              <Reveal className="bento-assist rounded-[40px] p-8 transition-transform duration-300 hover:-translate-y-1" style={{ backgroundColor: GRAY_BG }} delay={160}>
                <h3 className="text-[20px] sm:text-[22px] font-bold mb-3">AI-ассистент</h3>
                <p className="text-[14px] sm:text-[15px] leading-relaxed" style={{ color: TEXT, opacity: 0.7 }}>
                  Задаете вопрос прямо в уроке — ассистент отвечает и показывает нужные фрагменты по всему каталогу.
                </p>
                <div className="mt-4 flex gap-2">
                  <span className="text-[12px] bg-[#121212]/5 rounded-full px-3 py-1">Таймкоды</span>
                  <span className="text-[12px] bg-[#121212]/5 rounded-full px-3 py-1">В каждом уроке</span>
                  <span className="text-[12px] bg-[#121212]/5 rounded-full px-3 py-1">24/7</span>
                </div>
              </Reveal>

              {/* 400+ lessons */}
              <Reveal className="bento-lessons rounded-[40px] p-8 flex flex-col justify-between min-h-[200px] transition-transform duration-300 hover:-translate-y-1" style={{ backgroundColor: DARK }} delay={240}>
                <Counter end={400} suffix="+" duration={1600} className="text-[56px] sm:text-[64px] font-bold leading-none text-white" />
                <div>
                  <h3 className="text-[20px] sm:text-[22px] font-bold text-white">уроков</h3>
                  <p className="mt-1 text-[14px] text-white/50">Собрали в единую систему обучения</p>
                </div>
              </Reveal>

              {/* Live platform — wide */}
              <Reveal className="bento-live rounded-[40px] p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 min-h-[160px] transition-transform duration-300 hover:-translate-y-1" style={{ backgroundColor: ORANGE }} delay={320}>
                <div>
                  <h3 className="text-[20px] sm:text-[24px] font-bold text-white">Гибкая платформа</h3>
                  <p className="mt-2 text-[14px] sm:text-[15px] text-white/80">
                    Регулярно добавляем новые материалы, инструкции и инструменты. Реагируем на изменения Wildberries и Ozon.
                  </p>
                </div>
                <span className="flex-shrink-0 text-[40px] sm:text-[48px] font-bold text-white/30">+</span>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. Comparison — курс vs Платформа ──────────── */}
      <section id="чем-отличаемся" className="py-[80px] sm:py-[120px] px-4 sm:px-6 md:px-10 lg:px-0 bg-white">
        <div className="max-w-[1160px] mx-auto">
          <h2 className="text-[24px] sm:text-[32px] md:text-[40px] font-bold tracking-tight text-center mb-4 leading-tight">
            Обычный курс и платформа MPSTATS Academy —<br className="hidden sm:block" /> разные форматы
          </h2>
          <p className="text-center text-[15px] sm:text-[17px] leading-relaxed max-w-[680px] mx-auto mb-10 sm:mb-14" style={{ color: TEXT, opacity: 0.6 }}>
            Адаптивное обучение вместо единой программы для всех. Вот как это выглядит на практике
          </p>

          {/* Desktop: 3-column table with expanding BLUE column */}
          <ComparisonTableDesktop />


          {/* Mobile: stacked cards */}
          <div className="md:hidden space-y-4">
            {comparison.map((row) => (
              <div key={row.param} className="rounded-[24px] overflow-hidden border border-[#121212]/10">
                <div className="p-4 bg-white">
                  <span className="text-[13px] font-medium uppercase tracking-wider" style={{ color: TEXT, opacity: 0.4 }}>
                    {row.param}
                  </span>
                </div>
                <div className="p-4 bg-white border-t border-[#121212]/10">
                  <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: TEXT, opacity: 0.5 }}>Обычный курс</span>
                  <p className="mt-1 text-[14px]" style={{ color: TEXT, opacity: 0.85 }}>{row.value1}</p>
                </div>
                <div className="p-4 text-white" style={{ backgroundColor: BLUE }}>
                  <span className="text-[11px] font-medium uppercase tracking-wider text-white/60">Платформа MPSTATS Academy</span>
                  <p className={`mt-1 text-[14px] ${row.highlight ? 'font-bold' : ''}`}>{row.value2}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 5. Как работает платформа ──────────────────── */}
      <section id="как-работает" className="py-[80px] sm:py-[120px] px-4 sm:px-6 md:px-10 lg:px-0" style={{ backgroundColor: GRAY_BG }}>
        <div className="max-w-[1160px] mx-auto">
          <h2 className="text-[24px] sm:text-[32px] md:text-[40px] font-bold tracking-tight text-center mb-4">
            Как работает платформа
          </h2>
          <p className="text-center text-[15px] sm:text-[17px] leading-relaxed max-w-[620px] mx-auto mb-10 sm:mb-14" style={{ color: TEXT, opacity: 0.6 }}>
            От AI-диагностики до персонального плана — за 10 минут
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {steps.map((step, i) => (
              <Reveal key={step.num} className="bg-white rounded-[32px] p-6 sm:p-7 flex flex-col min-h-[240px] transition-transform duration-300 hover:-translate-y-1" delay={i * 80}>
                <span className="text-[40px] sm:text-[48px] font-bold leading-none" style={{ color: BLUE, opacity: 0.22 }}>
                  {step.num}
                </span>
                <h3 className="mt-4 text-[17px] sm:text-[19px] font-bold leading-tight" style={{ color: TEXT }}>
                  {step.title}
                </h3>
                <p className="mt-3 text-[14px] sm:text-[15px] leading-relaxed flex-1" style={{ color: TEXT, opacity: 0.7 }}>
                  {step.desc}
                </p>
                <span className="mt-4 inline-block self-start text-[11px] sm:text-[12px] font-medium rounded-full px-3 py-1" style={{ backgroundColor: 'rgba(44,79,248,0.08)', color: BLUE }}>
                  {step.badge}
                </span>
              </Reveal>
            ))}
          </div>

          {/* Catalog teaser */}
          <div className="mt-8 sm:mt-10 bg-white rounded-[32px] p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-6">
            <p className="text-[14px] sm:text-[15px] text-center sm:text-left leading-relaxed" style={{ color: TEXT, opacity: 0.75 }}>
              Внутри:{' '}
              <span className="font-semibold" style={{ color: TEXT, opacity: 1 }}>400+ уроков по 5 направлениям</span>
              {' '}· 4 больших курса · 24 разбора кабинетов · уроки до 20 минут
            </p>
            <a
              href="/courses"
              className="group flex-shrink-0 inline-flex items-center gap-2 text-[14px] sm:text-[15px] font-medium whitespace-nowrap transition-opacity hover:opacity-80"
              style={{ color: BLUE }}
            >
              Смотреть каталог
              <span className="inline-block transition-transform duration-300 group-hover:translate-x-1">
                <ArrowRight />
              </span>
            </a>
          </div>
        </div>
      </section>

      {/* ── 6. For Who ─────────────────────────────────── */}
      <section className="py-[80px] sm:py-[120px] px-4 sm:px-6 md:px-10 lg:px-0 bg-white">
        <div className="max-w-[1160px] mx-auto">
          <h2 className="text-[24px] sm:text-[32px] md:text-[40px] font-bold tracking-tight text-center mb-10 sm:mb-14">
            Кому подойдет платформа
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {segments.map((seg, i) => (
              <Reveal
                key={seg.title}
                className="group rounded-[40px] p-8 border transition-transform duration-300 hover:-translate-y-1 hover:border-[#2C4FF8]/40 cursor-default"
                style={{ borderColor: 'rgba(18,18,18,0.1)' }}
                delay={i * 70}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[17px] sm:text-[19px] font-bold" style={{ color: TEXT }}>{seg.title}</h3>
                  <span className="transition-transform duration-300 group-hover:translate-x-1" style={{ color: TEXT, opacity: 0.4 }}><ArrowRight /></span>
                </div>
                <p className="text-[14px] sm:text-[15px] leading-relaxed" style={{ color: TEXT, opacity: 0.7 }}>
                  {seg.desc}
                </p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── 6b. Mid CTA ────────────────────────────────── */}
      <section className="py-[80px] px-4 sm:px-6 md:px-10 lg:px-0" style={{ backgroundColor: BLUE }}>
        <div className="max-w-[760px] mx-auto text-center">
          <h2 className="text-[24px] sm:text-[32px] md:text-[40px] font-bold text-white leading-tight">
            Начните с бесплатной диагностики
          </h2>
          <p className="mt-4 text-[16px] sm:text-[18px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.75)' }}>
            Получите рекомендации по обучению и персональный маршрут развития
          </p>
          <a
            href={cta.diagnostic.href}
            className="mt-8 inline-flex items-center justify-center rounded-full h-[52px] sm:h-[58px] px-10 sm:px-12 text-[15px] sm:text-[16px] font-medium transition-colors"
            style={{ backgroundColor: 'white', color: BLUE }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#e8e8e8')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'white')}
          >
            {cta.diagnostic.label}
          </a>
        </div>
      </section>

      {/* ── 7. Pricing ─────────────────────────────────── */}
      <section id="тарифы" className="py-[80px] sm:py-[120px] px-4 sm:px-6 md:px-10 lg:px-0" style={{ backgroundColor: GRAY_BG }}>
        <div className="max-w-[1160px] mx-auto">
          <h2 className="text-[24px] sm:text-[32px] md:text-[40px] font-bold tracking-tight text-center mb-10 sm:mb-14">
            Тарифы
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-[760px] mx-auto">
            {plans.map((plan, i) => (
              <Reveal
                key={plan.name}
                className="rounded-[40px] p-8 sm:p-10 flex flex-col transition-transform duration-300 hover:-translate-y-1"
                style={{
                  backgroundColor: plan.highlighted ? BLUE : 'white',
                  color: plan.highlighted ? 'white' : TEXT,
                }}
                delay={i * 80}
              >
                <span className="text-[14px] font-medium uppercase tracking-wider" style={{ opacity: 0.6 }}>
                  {plan.name}
                </span>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-[36px] sm:text-[44px] font-bold leading-none">{plan.price}</span>
                  <span className="text-[16px]" style={{ opacity: 0.6 }}>{plan.period}</span>
                </div>
                <ul className="mt-6 space-y-3 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-3 text-[14px] sm:text-[15px]">
                      <span className="flex-shrink-0 mt-0.5" style={{ opacity: plan.highlighted ? 0.8 : 0.5 }}>
                        <CheckIcon />
                      </span>
                      <span style={{ opacity: plan.highlighted ? 0.9 : 0.7 }}>{f}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href="/pricing"
                  className="mt-8 inline-flex items-center justify-center rounded-full h-[52px] sm:h-[56px] text-[15px] font-medium transition-colors"
                  style={{
                    backgroundColor: plan.highlighted ? 'white' : BLUE,
                    color: plan.highlighted ? BLUE : 'white',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = plan.highlighted ? '#e8e8e8' : BLUE_HOVER;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = plan.highlighted ? 'white' : BLUE;
                  }}
                >
                  Выбрать тариф
                </a>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── 8. FAQ ──────────────────────────────────────── */}
      <section id="faq" className="py-[80px] sm:py-[120px] px-4 sm:px-6 md:px-10 lg:px-0 bg-white">
        <div className="max-w-[760px] mx-auto">
          <h2 className="text-[24px] sm:text-[32px] md:text-[40px] font-bold tracking-tight text-center mb-10 sm:mb-14">
            Часто задаваемые вопросы
          </h2>
          <div>
            {faqs.map((faq) => (
              <FaqItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ── 9. Footer CTA ──────────────────────────────── */}
      <section id="cta" className="py-[80px] sm:py-[120px] px-4 sm:px-6 md:px-10 lg:px-0" style={{ backgroundColor: DARK }}>
        <div className="max-w-[760px] mx-auto text-center">
          <h2 className="text-[28px] sm:text-[36px] md:text-[48px] font-bold text-white leading-tight">
            Начните с бесплатной AI-диагностики
          </h2>
          <p className="mt-4 sm:mt-6 text-[16px] sm:text-[18px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
            10 минут — и персональный план готов
          </p>
          <a
            href={cta.primary.href}
            className="mt-8 sm:mt-10 inline-flex items-center justify-center rounded-full h-[52px] sm:h-[62px] px-10 sm:px-12 text-[15px] sm:text-[16px] font-medium text-white transition-colors"
            style={{ backgroundColor: BLUE }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = BLUE_HOVER)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = BLUE)}
          >
            {cta.primary.label}
          </a>
        </div>
      </section>

      <V8Footer wrapperBg="dark" />

      <StickyCTA
        href={cta.primary.href}
        buttonLabel={cta.primary.label}
        hideWhenId="cta"
        title="Начните с AI-диагностики — это бесплатно"
        subtitle="10 минут — и персональный план готов"
      />
    </div>
  );
}
