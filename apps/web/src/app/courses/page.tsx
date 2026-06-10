'use client';

import Link from 'next/link';
import { V8Header } from '@/components/v8/V8Header';
import { V8Footer } from '@/components/v8/V8Footer';
import { Reveal } from '@/components/v8/Reveal';

/* ── V8 "Brand Bento" — Course Catalog Hub ─────────────── */

const BADGE_COLORS: Record<string, string> = {
  WB: 'bg-[#CB11AB]/10 text-[#CB11AB]',
  Ozon: 'bg-[#005BFF]/10 text-[#005BFF]',
};

interface Course {
  name: string;
  subtitle: string;
  modules: number;
  lessons: number;
  badges: string[];
  experts: string;
  bg: string;
  link: string;
}

const mainCourses: Course[] = [
  {
    name: 'Аналитика для маркетплейсов',
    subtitle: 'Считайте юнит-экономику, анализируйте ниши, конкурентов и продажи',
    modules: 8,
    lessons: 82,
    badges: ['WB', 'Ozon'],
    experts: '5 экспертов',
    bg: '#cfd4fd',
    link: '/courses/analytics',
  },
  {
    name: 'Внутренняя реклама WB',
    subtitle: 'Управляйте рекламой, контролируйте расходы и повышайте эффективность кампаний',
    modules: 11,
    lessons: 67,
    badges: ['WB'],
    experts: 'Виталий Филь',
    bg: '#fbc8c0',
    link: '/courses/ads',
  },
  {
    name: 'Нейросети для маркетплейсов',
    subtitle: 'Используйте AI для создания контента, анализа данных и ежедневных задач',
    modules: 11,
    lessons: 92,
    badges: ['WB', 'Ozon'],
    experts: '3 эксперта',
    bg: '#c0f8fb',
    link: '/courses/ai',
  },
  {
    name: 'Ozon: от старта к росту',
    subtitle: 'Научитесь работать с логистикой, продвижением и аналитикой на Ozon',
    modules: 8,
    lessons: 76,
    badges: ['Ozon'],
    experts: '4 эксперта',
    bg: '#c0dbfb',
    link: '/courses/ozon',
  },
];

interface SupplementaryItem {
  name: string;
  count: string;
  desc: string;
  badges: string[];
}

const supplementary: SupplementaryItem[] = [
  {
    name: 'Практикумы',
    count: '24 вебинара в записи',
    desc: 'Разбирайте реальные кабинеты и решения вместе с экспертами MPSTATS Academy',
    badges: ['WB', 'Ozon'],
  },
  {
    name: 'Экспресс-курсы',
    count: '16 коротких уроков',
    desc: 'Осваивайте отдельные задачи: SEO, выбор товара и анализ конкурентов',
    badges: ['WB', 'Ozon'],
  },
];

function Badge({ label }: { label: string }) {
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${BADGE_COLORS[label] ?? ''}`}>
      {label}
    </span>
  );
}

function ArrowIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="inline-block ml-1">
      <path
        d="M4 10h12m0 0l-4-4m4 4l-4 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function DesignNewV8CoursesPage() {
  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "'Onest', sans-serif" }}>
      {/* Google Fonts */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;700&display=swap"
        rel="stylesheet"
      />

      <V8Header onDarkHero={true} />

      {/* ── Hero ────────────────────────────────────────── */}
      <section className="bg-[#0F172A] pt-28 sm:pt-36 pb-16 sm:pb-24">
        <div className="max-w-[1160px] mx-auto px-4 sm:px-6 text-center">
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight tracking-tight">
            400+ уроков по 5 направлениям
          </h1>
          <p className="mt-5 sm:mt-6 text-base sm:text-lg text-white/70 max-w-[640px] mx-auto leading-relaxed">
            Выберите один курс или откройте доступ ко всей библиотеке материалов без ограничений
          </p>
        </div>
      </section>

      {/* ── 4 Main Courses ──────────────────────────────── */}
      <section className="py-16 sm:py-24 bg-white">
        <div className="max-w-[1160px] mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {mainCourses.map((course, i) => (
              <Reveal key={course.name} delay={i * 80}>
              <Link
                href={course.link}
                className="rounded-[40px] p-8 min-h-[320px] flex flex-col transition-transform duration-300 hover:-translate-y-1"
                style={{ backgroundColor: course.bg }}
              >
                {/* Badges */}
                <div className="flex flex-wrap gap-1.5">
                  {course.badges.map((badge) => (
                    <Badge key={badge} label={badge} />
                  ))}
                </div>

                {/* Title + subtitle */}
                <div className="mt-4">
                  <h3 className="text-[22px] sm:text-[26px] font-bold text-[#121212] leading-snug">
                    {course.name}
                  </h3>
                  <p className="mt-2 text-sm text-[#121212]/70 leading-relaxed">
                    {course.subtitle}
                  </p>
                </div>

                {/* Bottom row */}
                <div className="mt-auto pt-6 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-[#121212]/50">
                      {course.lessons} уроков &middot; {course.modules} модулей
                    </span>
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-[#121212]/10 text-[#121212]/70">
                      {course.experts}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-[#121212]/70 flex items-center">
                    Подробнее
                    <ArrowIcon />
                  </span>
                </div>
              </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Также в подписке ────────────────────────────── */}
      <section className="py-16 sm:py-24 bg-[#f4f4f4]">
        <div className="max-w-[1160px] mx-auto px-4 sm:px-6">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#121212] text-center mb-10 sm:mb-14">
            Что еще вы получите в подписке
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {supplementary.map((item, i) => (
              <Reveal
                key={item.name}
                className="bg-white rounded-[40px] p-6 flex flex-col transition-transform duration-300 hover:-translate-y-1"
                delay={i * 80}
              >
                <h3 className="text-lg sm:text-xl font-bold text-[#121212]">
                  {item.name}
                </h3>
                <p className="mt-2 text-sm font-medium text-[#121212]/70">
                  {item.count}
                </p>
                <p className="mt-1 text-sm text-[#121212]/50 leading-relaxed">
                  {item.desc}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-4">
                  {item.badges.map((badge) => (
                    <Badge key={badge} label={badge} />
                  ))}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing Mini ────────────────────────────────── */}
      <section className="py-16 sm:py-24 bg-white">
        <div className="max-w-[1160px] mx-auto px-4 sm:px-6 text-center">
          <p className="text-base sm:text-lg text-[#121212]/70">
            Подписка на курс{' '}
            <span className="font-bold text-[#121212]">1 990 &#8381;/мес</span>
            {' '}&middot;{' '}
            Полный доступ{' '}
            <span className="font-bold text-[#121212]">2 990 &#8381;/мес</span>
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button className="w-full sm:w-auto px-8 h-[52px] sm:h-[62px] rounded-full text-sm font-semibold border-2 border-[#121212] text-[#121212] hover:bg-[#121212] hover:text-white transition-colors">
              Выбрать курс
            </button>
            <button className="w-full sm:w-auto px-8 h-[52px] sm:h-[62px] rounded-full text-sm font-semibold bg-[#2C4FF8] text-white hover:bg-[#1D39C1] transition-colors">
              Полный доступ
            </button>
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────── */}
      <section className="py-16 sm:py-24 bg-[#0F172A]">
        <div className="max-w-[1160px] mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white leading-tight">
            Не знаете, с чего начать?
          </h2>
          <p className="mt-4 text-base sm:text-lg text-white/60 max-w-[520px] mx-auto">
            Пройдите AI-диагностику и получите рекомендации по темам и урокам
          </p>
          <button className="mt-8 px-8 h-[52px] sm:h-[62px] rounded-full text-base font-semibold bg-[#2C4FF8] text-white hover:bg-[#1D39C1] transition-colors">
            Пройти диагностику
          </button>
        </div>
      </section>

      <V8Footer wrapperBg="dark" />
    </div>
  );
}
