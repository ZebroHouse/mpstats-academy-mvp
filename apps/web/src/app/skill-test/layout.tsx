import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'AI-диагностика навыков селлера за 10 минут' },
  description: 'Ответьте на короткие вопросы по 5 направлениям — аналитика, маркетинг, контент, операции, финансы. Получите персональный план обучения под свой уровень.',
  alternates: { canonical: '/skill-test' },
  openGraph: {
    title: 'AI-диагностика навыков селлера за 10 минут',
    description: 'Ответьте на короткие вопросы по 5 направлениям — аналитика, маркетинг, контент, операции, финансы. Получите персональный план обучения под свой уровень.',
    url: '/skill-test',
  },
};

export default function SkillTestLayout({ children }: { children: React.ReactNode }) {
  return children;
}
