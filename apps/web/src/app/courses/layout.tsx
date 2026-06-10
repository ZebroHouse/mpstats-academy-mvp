import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Каталог MPSTATS Academy — 400+ уроков по 5 направлениям' },
  description: 'Весь каталог платформы — Аналитика, Маркетинг, Контент, Операции, Финансы. 400+ уроков, 150+ часов контента. Программа собирается под ваш уровень.',
  alternates: { canonical: '/courses' },
  openGraph: {
    title: 'Каталог MPSTATS Academy — 400+ уроков по 5 направлениям',
    description: 'Весь каталог платформы — Аналитика, Маркетинг, Контент, Операции, Финансы. 400+ уроков, 150+ часов контента. Программа собирается под ваш уровень.',
    url: '/courses',
  },
};

export default function CoursesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
