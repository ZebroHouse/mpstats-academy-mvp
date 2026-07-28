import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Курс «Аналитика маркетплейсов» — MPSTATS Academy' },
  description: 'Решения на цифрах: ёмкость ниши, ABC, юнит-экономика, выкуп, ROI. Практика на MPSTATS для селлеров Wildberries и Ozon. По подписке от 2 990 ₽/мес.',
  alternates: { canonical: '/courses/analytics' },
  openGraph: {
    title: 'Курс «Аналитика маркетплейсов» — MPSTATS Academy',
    description: 'Решения на цифрах: ёмкость ниши, ABC, юнит-экономика, выкуп, ROI. Практика на MPSTATS для селлеров Wildberries и Ozon. По подписке от 2 990 ₽/мес.',
    url: '/courses/analytics',
  },
};

export default function CourseAnalyticsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
