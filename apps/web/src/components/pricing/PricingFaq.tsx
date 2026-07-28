'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * FAQ content shared by `/pricing` and `/billing`. Extracted from the old
 * pricing/page.tsx inline `FAQS` array (Pricing 2.0, Task 5) — two entries
 * referencing the now-retired COURSE plan were rewritten/removed, and one
 * new entry explains the 3/6-month multimonth billing.
 */
export const PRICING_FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'Когда списывается оплата?',
    a: 'Оплата списывается при оформлении подписки — сразу за весь выбранный период (1, 3 или 6 месяцев). Следующее списание происходит по истечении этого периода. За 3 дня до списания мы напомним о продлении и отправим уведомление.',
  },
  {
    q: 'Как работает оплата за 3 и 6 месяцев?',
    a: 'Вы платите всю сумму периода сразу — 7 990 ₽ за 3 месяца или 13 990 ₽ за 6 месяцев — и получаете доступ на весь этот срок. Следующее продление произойдёт только по истечении оплаченного периода, по той же цене.',
  },
  {
    q: 'Можно ли сменить тариф?',
    a: 'Да. Перейти на другой период (например, с 1 месяца на 3 или 6) можно после окончания текущего оплаченного периода — новый тариф начнёт действовать сразу после этого.',
  },
  {
    q: 'Можно ли отключить подписку?',
    a: 'Да. Подписку можно отключить в личном кабинете в любое время. Доступ к платформе сохранится до конца оплаченного периода.',
  },
  {
    q: 'Есть ли пробный период?',
    a: 'Нет. Но вы можете бесплатно пройти AI-диагностику и получить рекомендации по обучению до оформления подписки.',
  },
  {
    q: 'Что входит в полный доступ?',
    a: 'Все материалы платформы без ограничений: все курсы, 400+ уроков, 150+ часов контента, AI-диагностика, персональный план обучения и AI-ассистент.',
  },
  {
    q: 'Можно ли оплатить обучение от лица компании?',
    a: 'Да. Мы работаем с юридическими лицами и предоставляем закрывающие документы. Для оформления напишите на support@mpstats.academy.',
  },
];

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('transition-transform duration-200', open && 'rotate-180')}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-mp-gray-900/10 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-6 text-left cursor-pointer"
      >
        <span className="text-[17px] sm:text-[19px] font-medium pr-4 text-mp-gray-900">{q}</span>
        <span className="flex-shrink-0 text-mp-gray-900">
          <ChevronDown open={open} />
        </span>
      </button>
      <div className={cn('overflow-hidden transition-all duration-300', open ? 'max-h-[400px] pb-6' : 'max-h-0')}>
        <p className="text-[15px] sm:text-[16px] leading-relaxed text-mp-gray-900/70">{a}</p>
      </div>
    </div>
  );
}

export interface PricingFaqProps {
  className?: string;
  /** Override the default question set (rarely needed — defaults to `PRICING_FAQS`). */
  faqs?: Array<{ q: string; a: string }>;
}

/**
 * Full FAQ block (heading + accordion), shared by `/pricing` and `/billing`
 * for structural parity (Pricing 2.0 Task 5).
 */
export function PricingFaq({ className, faqs = PRICING_FAQS }: PricingFaqProps) {
  return (
    <div className={className}>
      <h2 className="text-[28px] sm:text-[36px] font-bold text-center mb-12 text-mp-gray-900">
        Часто задаваемые вопросы
      </h2>
      <div className="rounded-[40px] bg-white p-6 sm:p-10">
        {faqs.map((faq) => (
          <FaqItem key={faq.q} q={faq.q} a={faq.a} />
        ))}
      </div>
    </div>
  );
}
