'use client';

import { cn } from '@/lib/utils';

/**
 * Replaces the retired COURSE-vs-PLATFORM comparison table (Pricing 2.0,
 * Task 5) — since PLATFORM is now the only product, there is nothing left to
 * compare against. Instead: a single "what's included" value list, shared by
 * `/pricing` and `/billing`.
 */
const INCLUDED_ITEMS: Array<{ title: string; description: string }> = [
  {
    title: 'Все курсы платформы',
    description: '400+ уроков, 150+ часов контента — WB, Ozon, аналитика, реклама, продвижение.',
  },
  {
    title: 'AI-ассистент',
    description: 'Отвечает на вопросы по материалам курсов и подсказывает, что делать дальше.',
  },
  {
    title: 'Решения под задачу',
    description: 'Подборки уроков и материалов, собранные под конкретную рабочую задачу.',
  },
  {
    title: 'AI-диагностика',
    description: 'Персональный план обучения на основе ваших целей и текущего уровня.',
  },
  {
    title: 'Новые материалы и обновления',
    description: 'Добавляем уроки и учитываем изменения Wildberries и Ozon без доплат.',
  },
];

function CheckIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#2C4FF8"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-shrink-0"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export interface WhatsIncludedProps {
  className?: string;
  /** Override the heading (defaults to "Что входит в полный доступ"). */
  title?: string;
}

/**
 * "What's included in PLATFORM" value list — single reusable block shared by
 * `/pricing` and `/billing` (Pricing 2.0 Task 5, replaces `COMPARISON_ROWS`).
 */
export function WhatsIncluded({ className, title = 'Что входит в полный доступ' }: WhatsIncludedProps) {
  return (
    <div className={className}>
      <h2 className="text-[24px] sm:text-[32px] font-bold text-center mb-4 leading-tight text-mp-gray-900">
        {title}
      </h2>
      <p className="text-center text-[15px] sm:text-[17px] leading-relaxed max-w-[620px] mx-auto mb-10 sm:mb-14 text-mp-gray-500">
        Всё, что нужно для системного обучения, в одной подписке
      </p>
      <div className="rounded-[40px] bg-white border border-mp-gray-200 divide-y divide-mp-gray-100 max-w-[720px] mx-auto overflow-hidden">
        {INCLUDED_ITEMS.map((item) => (
          <div key={item.title} className={cn('flex items-start gap-4 p-6 sm:p-7')}>
            <span className="mt-0.5">
              <CheckIcon />
            </span>
            <div>
              <h3 className="text-[16px] sm:text-[17px] font-bold text-mp-gray-900">{item.title}</h3>
              <p className="mt-1 text-[14px] sm:text-[15px] leading-relaxed text-mp-gray-500">
                {item.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
