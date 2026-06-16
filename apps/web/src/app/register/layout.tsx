import type { Metadata } from 'next';
import { Logo } from '@/components/shared/Logo';

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
    <div className="min-h-screen flex flex-col bg-mp-gray-50">
      {/* Header */}
      <header className="border-b border-mp-gray-200 bg-white">
        <div className="container mx-auto px-4 h-16 flex items-center">
          <Logo size="md" />
        </div>
      </header>

      {/* Content — full width (no max-w-md centering) */}
      <main className="flex-1 flex items-center py-8 lg:py-0">
        <div className="w-full">{children}</div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-caption text-mp-gray-500 bg-white border-t border-mp-gray-200">
        &copy; 2025 MPSTATS Academy
      </footer>
    </div>
  );
}
