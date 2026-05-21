import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Добро пожаловать',
  description: 'Пара вопросов — и платформа MPSTATS Academy подстроится под ваши задачи.',
  robots: {
    index: false,
    follow: false,
  },
};

/**
 * Standalone fullscreen layout for the onboarding wizard.
 * Lives outside (main) — no sidebar / nav / header.
 *
 * Auth-guard here is mandatory: edge-middleware protectedRoutes also lists
 * /welcome (defense in depth), but the layout check is the reliable one
 * since middleware cannot read the DB.
 */
export default async function WelcomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data?.user) {
    redirect('/login');
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-mp-gray-50 px-4 py-8 sm:py-12">
      <span className="mb-6 select-none text-caption font-semibold uppercase tracking-wide text-mp-gray-400">
        MPSTATS Academy
      </span>
      {children}
    </div>
  );
}
