'use client';

import { useState } from 'react';
import { Onest } from 'next/font/google';
import { V8Header } from '@/components/v8/V8Header';
import { V8Footer } from '@/components/v8/V8Footer';
import { Reveal } from '@/components/v8/Reveal';
import { CourseHeroCTA, CoursePricingSection } from '@/components/v8/CourseAccessCTA';

const COURSE_ID = '01_analytics';

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
    title: 'Юнит-экономика',
    before: 'Считали прибыль на глаз, не учитывая скрытые расходы',
    after: 'Точный расчёт P&L по каждому SKU с учётом всех комиссий',
  },
  {
    title: 'Выбор товара',
    before: 'Выбирали товар по ощущениям или советам из чатов',
    after: 'Осознанный выбор на основе данных MPSTATS: спрос, конкуренция, маржа',
  },
  {
    title: 'Управление продажами',
    before: 'Реагировали на падение продаж, когда уже поздно',
    after: 'Видите тренды заранее и принимаете решения на опережение',
  },
  {
    title: 'Конкурентная аналитика',
    before: 'Не знали, что делают конкуренты и почему они растут',
    after: 'Системный анализ конкурентов: цены, позиции, реклама, ассортимент',
  },
];

const LEARNING_OUTCOMES = [
  'Находить прибыльные ниши с помощью MPSTATS',
  'Считать юнит-экономику и маржинальность по каждому SKU',
  'Анализировать конкурентов: цены, позиции, рекламу, ассортимент',
  'Оптимизировать ценообразование на основе данных',
  'Управлять продажами и предотвращать спад',
  'Строить аналитические отчёты для принятия решений',
];

const AUDIENCE = [
  {
    title: 'Начинающие селлеры',
    desc: 'Только вышли на WB/Ozon — научитесь считать экономику с первого товара',
  },
  {
    title: 'Действующие селлеры',
    desc: 'Торгуете, но прибыль не растёт — найдёте, где утекают деньги',
  },
  {
    title: 'Менеджеры маркетплейсов',
    desc: 'Управляете чужими кабинетами — покажете клиенту профессиональную аналитику',
  },
];

const EXPERTS = [
  {
    name: 'Мадина Адигамова',
    photo: '/experts/madina-adigamova.webp',
    role: 'Аналитик WB и Ozon с 2021 г., 300 консультаций, 100 брендов',
  },
  {
    name: 'Анастасия Усачева',
    photo: '/experts/anastasia-usacheva.webp',
    role: 'Аналитик WB и Ozon с 2021 г., оборот 250 млн \u20BD/мес',
  },
  {
    name: 'Денис Яковлев',
    photo: '/experts/denis-yakovlev.webp',
    role: 'Селлер WB с 2022 г., оборот 70 млн \u20BD/мес',
  },
  {
    name: 'Анна Бициохо',
    photo: '/experts/anna-bicioho.webp',
    role: 'Эксперт аналитики MPSTATS, e-commerce 13+ лет',
  },
  {
    name: 'Людмила Овчинникова',
    photo: '/experts/ludmila-ovchinnikova.jpg',
    role: 'Селлер WB с 2022 г., 200+ учеников',
  },
] as const;

const MODULES = [
  {
    name: 'Вводный модуль: Фундамент аналитики',
    lessons: 3,
    topics: ['Зачем селлеру аналитика', 'Обзор инструментов MPSTATS', 'Ключевые метрики и дашборды'],
  },
  {
    name: 'Модуль 1: Экономика продаж',
    lessons: 12,
    topics: ['Юнит-экономика товара', 'Расчёт P&L по SKU', 'Себестоимость и скрытые расходы', 'Комиссии маркетплейсов', 'Точка безубыточности'],
  },
  {
    name: 'Модуль 2: Конкуренты и ниша',
    lessons: 10,
    topics: ['Оценка объёма ниши', 'Сезонность и тренды', 'Анализ прямых конкурентов', 'Поиск растущих ниш', 'Барьеры входа'],
  },
  {
    name: 'Модуль 3: Ценообразование',
    lessons: 8,
    topics: ['Стратегии входа в нишу по цене', 'Динамическое ценообразование', 'Влияние скидок и акций на маржу', 'Ценовые войны и как их избежать'],
  },
  {
    name: 'Модуль 4: Продвижение и реклама',
    lessons: 10,
    topics: ['Внутренняя реклама WB и Ozon', 'ROI рекламных кампаний', 'Оптимизация бюджета', 'Анализ эффективности продвижения'],
  },
  {
    name: 'Модуль 5: Контент и карточки',
    lessons: 12,
    topics: ['SEO-оптимизация карточек', 'Инфографика и визуал', 'A/B-тесты контента', 'CTR и конверсия карточки'],
  },
  {
    name: 'Модуль 6: Продвинутая аналитика',
    lessons: 15,
    topics: ['Аналитические дашборды', 'Прогнозирование спроса', 'Автоматизация отчётности', 'Когортный анализ'],
  },
  {
    name: 'Бонус: AI для аналитики',
    lessons: 12,
    topics: ['Нейросети для анализа данных', 'Автоматизация отчётов с AI', 'Генерация инсайтов', 'Практические кейсы'],
  },
];

const TOTAL_LESSONS = 82;
const TOTAL_MODULES = 8;

const OTHER_COURSES = [
  { name: 'Внутренняя реклама WB', bg: '#fbc8c0', href: '/courses/ads' },
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
              {module.lessons} {module.lessons === 3 ? 'урока' : 'уроков'}
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

/* ── Expert Avatar ─────────────────────────────────────── */

function ExpertAvatar({ expert }: { expert: typeof EXPERTS[number] }) {
  if ('photo' in expert && expert.photo) {
    return (
      <img
        src={expert.photo}
        alt={expert.name}
        className="w-20 h-20 rounded-full mx-auto object-cover"
      />
    );
  }

  const initials = 'initials' in expert ? (expert as any).initials : '';
  const color = 'initialsColor' in expert ? (expert as any).initialsColor : BLUE;

  return (
    <div
      className="w-20 h-20 rounded-full mx-auto flex items-center justify-center text-white text-[24px] font-bold"
      style={{ backgroundColor: color }}
    >
      {initials}
    </div>
  );
}

/* ── Page Component ────────────────────────────────────── */

export default function CourseDetailPage() {
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
              <span style={{ color: 'rgba(255,255,255,0.8)' }}>Аналитика для маркетплейсов</span>
            </nav>

            <h1 className="text-[28px] sm:text-[36px] md:text-[48px] lg:text-[56px] font-bold leading-[1.1] tracking-tight text-white">
              Аналитика для<br />маркетплейсов
            </h1>

            <p className="mt-4 sm:mt-5 text-[15px] sm:text-[17px] leading-relaxed max-w-[540px] mx-auto lg:mx-0" style={{ color: 'rgba(255,255,255,0.7)' }}>
              Научитесь считать юнит-экономику, анализировать ниши и конкурентов. Поймёте, где теряете прибыль — и предотвратите спад продаж.
            </p>

            {/* Meta */}
            <div className="mt-5 sm:mt-6 flex flex-wrap items-center gap-3 sm:gap-4 justify-center lg:justify-start">
              <span className="text-[14px] sm:text-[16px]" style={{ color: 'rgba(255,255,255,0.6)' }}>
                {TOTAL_LESSONS} урока &middot; {TOTAL_MODULES} модулей
              </span>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full px-3 py-1 text-[12px] font-medium bg-white/10 text-white/80">
                  WB
                </span>
                <span className="inline-flex items-center rounded-full px-3 py-1 text-[12px] font-medium bg-white/10 text-white/80">
                  Ozon
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
              style={{ backgroundColor: '#cfd4fd' }}
            >
              <p className="text-[13px] font-bold uppercase tracking-[0.1em]" style={{ color: DARK, opacity: 0.5 }}>Чему научитесь</p>
              {[
                'Считать юнит-экономику и находить скрытые потери',
                'Анализировать ниши и конкурентов через MPSTATS',
                'Принимать решения на основе данных, а не интуиции',
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
            Эксперты курса
          </h2>

          <div className="mt-8 sm:mt-10 flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 sm:-mx-6 sm:px-6 md:mx-0 md:px-0 scrollbar-hide lg:grid lg:grid-cols-5 lg:overflow-visible lg:pb-0">
            {EXPERTS.map((expert) => (
              <div
                key={expert.name}
                className="flex-shrink-0 w-[180px] sm:w-[200px] lg:w-auto rounded-[40px] bg-white p-6 text-center"
              >
                <ExpertAvatar expert={expert} />
                <div className="mt-4 text-[15px] sm:text-[16px] font-bold" style={{ color: TEXT }}>
                  {expert.name}
                </div>
                <p className="mt-2 text-[13px] sm:text-[14px] leading-relaxed" style={{ color: TEXT, opacity: 0.5 }}>
                  {expert.role}
                </p>
              </div>
            ))}
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
            {TOTAL_MODULES} модулей, {TOTAL_LESSONS} урока — от основ до продвинутой аналитики
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
