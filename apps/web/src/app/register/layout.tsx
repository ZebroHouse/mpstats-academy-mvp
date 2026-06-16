import type { Metadata } from 'next';
import { Onest } from 'next/font/google';
import { V8Header } from '@/components/v8/V8Header';
import { V8Footer } from '@/components/v8/V8Footer';

const onest = Onest({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Регистрация',
  description:
    'Зарегистрируйтесь на платформе MPSTATS Academy — AI-диагностика, персональная программа и AI-ассистент в каждом уроке.',
};

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${onest.className} min-h-screen bg-[#0F172A] text-white`}>
      {/* Marketing header (transparent over the dark canvas, white logo). */}
      <V8Header />
      {/* pt offsets the fixed header height (h-[64px] sm:h-[72px]). */}
      <main className="pt-[64px] sm:pt-[72px]">{children}</main>
      {/* Marketing footer; wrapperBg dark matches the dark canvas above it. */}
      <V8Footer wrapperBg="dark" />
    </div>
  );
}
