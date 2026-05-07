'use client';

import { useState } from 'react';
import { Onest } from 'next/font/google';
import { V8Header } from '@/components/v8/V8Header';
import { V8Footer } from '@/components/v8/V8Footer';
import { Reveal } from '@/components/v8/Reveal';
import { CourseHeroCTA, CoursePricingSection } from '@/components/v8/CourseAccessCTA';

const COURSE_ID = '02_ads';

const onest = Onest({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '700'],
  display: 'swap',
});

/* ── Brand tokens ──────────────────────────────────────── */
const BLUE = '#2C4FF8';
const BLUE_HOVER = '#1D39C1';
const DARK = '#0F172A';
const GRAY_BG = '#f4f4f4';
const TEXT = '#121212';

/* ── Data ──────────────────────────────────────────────── */

const RESULTS = [
  {
    title: 'Поток заказов',
    before: 'Продажи зависели от удачи и сезона',
    after: 'Стабильный поток заказов через настроенную рекламу (+20-45%)',
  },
  {
    title: 'Видимость карточки',
    before: 'Карточка терялась на 10+ странице',
    after: 'Конверсия карточки выросла на 15-30%',
  },
  {
    title: 'Рекламный бюджет',
    before: 'Сливали бюджет не понимая, что работает',
    after: 'Экономия 15-35% рекламного бюджета',
  },
  {
    title: 'Управление рекламой',
    before: 'Настраивали рекламу наугад',
    after: 'Оцифрованное управление: ROI, ДРР, конверсия каждой кампании',
  },
];

const LEARNING_OUTCOMES = [
  'Настраивать автоматические и аукционные кампании на WB',
  'Оптимизировать рекламный бюджет и снижать ДРР',
  'Анализировать эффективность рекламы через MPSTATS',
  'Создавать продающие карточки и инфографику (AI-бонус)',
  'Управлять ставками и позициями в поиске',
  'Масштабировать рекламу без потери рентабельности',
];

const AUDIENCE = [
  {
    title: 'Селлеры WB',
    desc: 'Торгуете на Wildberries, но реклама не окупается — научитесь настраивать системно',
  },
  {
    title: 'Менеджеры МП',
    desc: 'Ведёте рекламу для клиентов — получите методологию и инструменты',
  },
  {
    title: 'Начинающие',
    desc: 'Только запускаете первые кампании — сразу по правильной стратегии',
  },
];

const EXPERT = {
  name: 'Виталий Филь',
  photo: '/experts/vitaliy-fil.webp',
  role: 'Селлер WB с 2021 г., оборот 150 млн \u20BD/мес, 300 консультаций, 1000 учеников',
};

const MODULES = [
  {
    name: 'Модуль 1: Основы рекламы на WB',
    lessons: 8,
    topics: ['Типы рекламы на Wildberries', 'Как работает аукцион', 'Рекламный кабинет: обзор и настройка', 'Бюджетирование первых кампаний'],
  },
  {
    name: 'Модуль 2: Автоматические кампании',
    lessons: 10,
    topics: ['Принцип работы автокампаний', 'Настройка и запуск', 'Оптимизация ставок', 'Анализ результатов', 'Когда автокампании эффективнее аукционных'],
  },
  {
    name: 'Модуль 3: Аукционные кампании',
    lessons: 9,
    topics: ['Поисковая реклама: стратегия ставок', 'Реклама в карточке и каталоге', 'Подбор ключевых фраз', 'Минус-слова и управление семантикой'],
  },
  {
    name: 'Модуль 4: Аналитика рекламы',
    lessons: 10,
    topics: ['Ключевые метрики: CTR, CPC, ДРР, ROI', 'Анализ через MPSTATS', 'Отчёты и дашборды', 'Атрибуция продаж', 'Сравнительный анализ кампаний'],
  },
  {
    name: 'Модуль 5: Оптимизация и масштабирование',
    lessons: 8,
    topics: ['Оптимизация ставок и бюджета', 'Масштабирование прибыльных кампаний', 'A/B-тесты в рекламе', 'Сезонные стратегии'],
  },
  {
    name: 'Модуль 6: Продвинутые стратегии',
    lessons: 10,
    topics: ['Комбинированные рекламные стратегии', 'Реклама для нового товара vs бестселлера', 'Конкурентный анализ рекламы', 'Работа с низкомаржинальными товарами', 'Антикризисное управление рекламой'],
  },
  {
    name: 'Модуль 7: Актуальные обновления WB',
    lessons: 6,
    topics: ['Последние изменения рекламного кабинета', 'Новые форматы и возможности', 'Адаптация стратегий под обновления'],
  },
  {
    name: 'Бонус: AI для карточек и SEO',
    lessons: 6,
    topics: ['Генерация текстов карточек с AI', 'SEO-оптимизация через нейросети', 'AI-инфографика и визуал', 'Практические кейсы'],
  },
];

const TOTAL_LESSONS = 67;
const TOTAL_MODULES = 11;

const OTHER_COURSES = [
  { name: 'Аналитика для маркетплейсов', bg: '#cfd4fd', href: '/courses/analytics' },
  { name: 'Нейросети для селлеров', bg: '#c0f8fb', href: '/courses/ai' },
  { name: 'Ozon: от старта к росту', bg: '#c0dbfb', href: '/courses/ozon' },
];

/* ── Icons ─────────────────────────────────────────────── */

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CheckCircle() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
      <circle cx="12" cy="12" r="12" fill={BLUE} />
      <polyline points="7 12 10.5 15.5 17 9" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowRight() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

/* ── Accordion Item ────────────────────────────────────── */

function ModuleAccordion({ index, module, isOpen, onToggle }: {
  index: number;
  module: typeof MODULES[number];
  isOpen: boolean;
  onToggle: () => void;
}) {
  const lessonWord = module.lessons === 6 ? 'уроков' : module.lessons === 8 ? 'уроков' : 'уроков';

  return (
    <div className="border-b border-[#121212]/10 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-5 sm:py-6 text-left cursor-pointer group"
      >
        <div className="flex items-center gap-4 sm:gap-5 pr-4">
          <span
            className="text-[13px] sm:text-[14px] font-medium rounded-full w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: BLUE, color: 'white' }}
          >
            {String(index + 1).padStart(2, '0')}
          </span>
          <div>
            <span className="text-[16px] sm:text-[18px] font-medium" style={{ color: TEXT }}>
              {module.name}
            </span>
            <span className="ml-3 text-[13px] sm:text-[14px]" style={{ color: TEXT, opacity: 0.5 }}>
              {module.lessons} {lessonWord}
            </span>
          </div>
        </div>
        <span className="flex-shrink-0" style={{ color: TEXT, opacity: 0.4 }}>
          <ChevronDown open={isOpen} />
        </span>
      </button>
      <div className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-[500px] pb-5 sm:pb-6' : 'max-h-0'}`}>
        <ul className="pl-[52px] sm:pl-[58px] space-y-2">
          {module.topics.map((topic) => (
            <li key={topic} className="flex items-start gap-2.5 text-[14px] sm:text-[15px]" style={{ color: TEXT, opacity: 0.65 }}>
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: BLUE, opacity: 0.5 }} />
              {topic}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ── Page Component ────────────────────────────────────── */

export default function CourseAdsPage() {
  const [openModule, setOpenModule] = useState<number | null>(0);

  return (
    <div className={onest.className} style={{ color: TEXT }}>

      <V8Header onDarkHero={true} />

      {/* ── 1. Hero ─────────────────────────────────────── */}
      <section style={{ backgroundColor: DARK }} className="pt-[110px] sm:pt-[130px] pb-[60px] sm:pb-[90px] px-4 sm:px-6 md:px-10 lg:px-0">
        <div className="max-w-[1160px] mx-auto flex flex-col lg:flex-row items-center gap-10 lg:gap-16">
          <div className="flex-1 text-center lg:text-left">
            {/* Breadcrumbs */}
            <nav className="flex items-center gap-2 text-[13px] sm:text-[14px] justify-center lg:justify-start mb-6 sm:mb-8" style={{ color: 'rgba(255,255,255,0.5)' }}>
              <a href="/" className="hover:text-white/70 transition-colors">Курсы</a>
              <span>/</span>
              <span style={{ color: 'rgba(255,255,255,0.8)' }}>Внутренняя реклама WB</span>
            </nav>

            <h1 className="text-[28px] sm:text-[36px] md:text-[48px] lg:text-[56px] font-bold leading-[1.1] tracking-tight text-white">
              Внутренняя реклама<br />на Wildberries
            </h1>

            <p className="mt-4 sm:mt-5 text-[15px] sm:text-[17px] leading-relaxed max-w-[540px] mx-auto lg:mx-0" style={{ color: 'rgba(255,255,255,0.7)' }}>
              Настроите рекламу так, чтобы она приносила продажи, а не сливала бюджет. Пошаговая стратегия продвижения на WB.
            </p>

            {/* Meta */}
            <div className="mt-5 sm:mt-6 flex flex-wrap items-center gap-3 sm:gap-4 justify-center lg:justify-start">
              <span className="text-[14px] sm:text-[16px]" style={{ color: 'rgba(255,255,255,0.6)' }}>
                {TOTAL_LESSONS} уроков &middot; {TOTAL_MODULES} модулей
              </span>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full px-3 py-1 text-[12px] font-medium bg-white/10 text-white/80">
                  WB
                </span>
              </div>
            </div>

            {/* CTA */}
            <div className="mt-8 sm:mt-10">
              <CourseHeroCTA courseId={COURSE_ID} />
            </div>
          </div>

          {/* Key skills block */}
          <div className="hidden lg:flex flex-shrink-0">
            <div
              className="w-[340px] xl:w-[400px] rounded-[40px] p-8 flex flex-col justify-center gap-5"
              style={{ backgroundColor: '#fbc8c0' }}
            >
              <p className="text-[13px] font-bold uppercase tracking-[0.1em]" style={{ color: DARK, opacity: 0.5 }}>Чему научитесь</p>
              {[
                'Настраивать рекламные кампании, которые окупаются',
                'Оптимизировать бюджет и снижать ДРР',
                'Анализировать эффективность через MPSTATS',
              ].map((skill) => (
                <div key={skill} className="flex items-start gap-3">
                  <svg className="flex-shrink-0 mt-0.5" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={DARK} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  <span className="text-[15px] font-medium leading-snug" style={{ color: DARK }}>{skill}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. Результаты ───────────────────────────────── */}
      <section id="результаты" className="py-[60px] sm:py-[80px] lg:py-[100px] px-4 sm:px-6 md:px-10 lg:px-0 bg-white">
        <div className="max-w-[1160px] mx-auto">
          <h2 className="text-[24px] sm:text-[32px] md:text-[40px] font-bold tracking-tight" style={{ color: TEXT }}>
            Что изменится после курса
          </h2>

          <div className="mt-8 sm:mt-10 grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
            {RESULTS.map((item, i) => (
              <Reveal
                key={item.title}
                className="rounded-[40px] p-7 sm:p-8 lg:p-10 transition-transform duration-300 hover:-translate-y-1"
                style={{ backgroundColor: GRAY_BG }}
                delay={i * 70}
              >
                <h3 className="text-[18px] sm:text-[20px] font-bold" style={{ color: TEXT }}>
                  {item.title}
                </h3>

                <div className="mt-5">
                  <span className="text-[12px] font-medium uppercase tracking-wider" style={{ color: TEXT, opacity: 0.4 }}>
                    Раньше
                  </span>
                  <p className="mt-1.5 text-[14px] sm:text-[15px] leading-relaxed line-through" style={{ color: TEXT, opacity: 0.45 }}>
                    {item.before}
                  </p>
                </div>

                <div className="mt-4">
                  <span className="text-[12px] font-medium uppercase tracking-wider" style={{ color: BLUE }}>
                    Сейчас
                  </span>
                  <p className="mt-1.5 text-[15px] sm:text-[16px] leading-relaxed font-medium" style={{ color: TEXT }}>
                    {item.after}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3. Чему научитесь ───────────────────────────── */}
      <section style={{ backgroundColor: GRAY_BG }} className="py-[60px] sm:py-[80px] lg:py-[100px] px-4 sm:px-6 md:px-10 lg:px-0">
        <div className="max-w-[1160px] mx-auto">
          <h2 className="text-[24px] sm:text-[32px] md:text-[40px] font-bold tracking-tight" style={{ color: TEXT }}>
            Чему вы научитесь
          </h2>

          <div className="mt-8 sm:mt-10 rounded-[48px] bg-white p-8 sm:p-10 lg:p-14">
            <ul className="space-y-5 sm:space-y-6">
              {LEARNING_OUTCOMES.map((outcome) => (
                <li key={outcome} className="flex items-start gap-4">
                  <CheckCircle />
                  <span className="text-[16px] sm:text-[18px] leading-relaxed" style={{ color: TEXT }}>
                    {outcome}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── 4. Для кого ─────────────────────────────────── */}
      <section className="py-[60px] sm:py-[80px] lg:py-[100px] px-4 sm:px-6 md:px-10 lg:px-0 bg-white">
        <div className="max-w-[1160px] mx-auto">
          <h2 className="text-[24px] sm:text-[32px] md:text-[40px] font-bold tracking-tight" style={{ color: TEXT }}>
            Для кого этот курс
          </h2>

          <div className="mt-8 sm:mt-10 grid grid-cols-1 lg:grid-cols-3 gap-4">
            {AUDIENCE.map((item) => (
              <div
                key={item.title}
                className="rounded-[40px] border border-[#121212]/10 p-7 sm:p-8 lg:p-10 flex flex-col"
              >
                <h3 className="text-[18px] sm:text-[20px] font-bold" style={{ color: TEXT }}>
                  {item.title}
                </h3>
                <p className="mt-3 text-[14px] sm:text-[15px] leading-relaxed" style={{ color: TEXT, opacity: 0.6 }}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 5. Эксперты ─────────────────────────────────── */}
      <section id="эксперты" style={{ backgroundColor: GRAY_BG }} className="py-[60px] sm:py-[80px] lg:py-[100px] px-4 sm:px-6 md:px-10 lg:px-0">
        <div className="max-w-[1160px] mx-auto">
          <h2 className="text-[24px] sm:text-[32px] md:text-[40px] font-bold tracking-tight" style={{ color: TEXT }}>
            Эксперт курса
          </h2>

          <div className="mt-8 sm:mt-10">
            <div className="rounded-[40px] bg-white p-8 flex flex-col sm:flex-row items-center gap-8">
              <img
                src={EXPERT.photo}
                alt={EXPERT.name}
                className="w-[140px] h-[140px] sm:w-[180px] sm:h-[180px] rounded-full object-cover flex-shrink-0"
              />
              <div className="text-center sm:text-left">
                <div className="text-[22px] sm:text-[26px] font-bold" style={{ color: TEXT }}>
                  {EXPERT.name}
                </div>
                <p className="mt-3 text-[15px] sm:text-[17px] leading-relaxed" style={{ color: TEXT, opacity: 0.6 }}>
                  {EXPERT.role}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. Программа курса ──────────────────────────── */}
      <section id="программа" className="py-[60px] sm:py-[80px] lg:py-[100px] px-4 sm:px-6 md:px-10 lg:px-0 bg-white">
        <div className="max-w-[1160px] mx-auto">
          <h2 className="text-[24px] sm:text-[32px] md:text-[40px] font-bold tracking-tight" style={{ color: TEXT }}>
            Программа курса
          </h2>
          <p className="mt-3 text-[15px] sm:text-[16px]" style={{ color: TEXT, opacity: 0.5 }}>
            {TOTAL_MODULES} модулей, {TOTAL_LESSONS} уроков — от основ до продвинутых стратегий
          </p>

          <div className="mt-8 sm:mt-10">
            {MODULES.map((module, i) => (
              <ModuleAccordion
                key={module.name}
                index={i}
                module={module}
                isOpen={openModule === i}
                onToggle={() => setOpenModule(openModule === i ? null : i)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── 7. Другие курсы ─────────────────────────────── */}
      <section id="курсы" style={{ backgroundColor: GRAY_BG }} className="py-[60px] sm:py-[80px] lg:py-[100px] px-4 sm:px-6 md:px-10 lg:px-0">
        <div className="max-w-[1160px] mx-auto">
          <h2 className="text-[24px] sm:text-[32px] md:text-[40px] font-bold tracking-tight" style={{ color: TEXT }}>
            Другие курсы платформы
          </h2>

          <div className="mt-8 sm:mt-10 flex gap-4 sm:gap-5 overflow-x-auto pb-4 -mx-4 px-4 sm:-mx-6 sm:px-6 md:mx-0 md:px-0 scrollbar-hide">
            {OTHER_COURSES.map((course) => (
              <a
                key={course.name}
                href={course.href}
                className="flex-shrink-0 w-[220px] sm:w-[260px] rounded-[40px] p-6 sm:p-8 transition-transform hover:scale-[1.02] block"
                style={{ backgroundColor: course.bg }}
              >
                <div className="text-[16px] sm:text-[18px] font-bold" style={{ color: DARK }}>
                  {course.name}
                </div>
                <div className="mt-6 flex items-center gap-1.5 text-[13px] font-medium" style={{ color: DARK, opacity: 0.7 }}>
                  Подробнее <ArrowRight />
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ── 8. CTA ──────────────────────────────────────── */}
      <CoursePricingSection courseId={COURSE_ID} />

      <V8Footer wrapperBg="dark" />
    </div>
  );
}
