import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Тарифы MPSTATS Academy — от 2 990 ₽ в месяц' },
  description: 'Полный доступ ко всей платформе от 2 990 ₽/мес. AI-диагностика, персональный план и AI-ассистент в каждом уроке.',
  alternates: { canonical: '/pricing' },
  openGraph: {
    title: 'Тарифы MPSTATS Academy — от 2 990 ₽ в месяц',
    description: 'Полный доступ ко всей платформе от 2 990 ₽/мес. AI-диагностика, персональный план и AI-ассистент в каждом уроке.',
    url: '/pricing',
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
