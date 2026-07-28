import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Курс «Реклама на Wildberries» — MPSTATS Academy' },
  description: 'Автокампании, АРК, ставки, бид-менеджмент, аналитика ДРР и ROMI. Как не сливать бюджет и выжимать максимум из рекламы WB. По подписке от 2 990 ₽/мес.',
  alternates: { canonical: '/courses/ads' },
  openGraph: {
    title: 'Курс «Реклама на Wildberries» — MPSTATS Academy',
    description: 'Автокампании, АРК, ставки, бид-менеджмент, аналитика ДРР и ROMI. Как не сливать бюджет и выжимать максимум из рекламы WB. По подписке от 2 990 ₽/мес.',
    url: '/courses/ads',
  },
};

export default function CourseAdsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
