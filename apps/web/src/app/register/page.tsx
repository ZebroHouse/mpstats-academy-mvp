import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  REFERRAL_COOKIE_NAME,
  isValidRefCodeShape,
} from '@/lib/referral/attribution';
import { createClient } from '@/lib/supabase/server';
import {
  RegisterValuePanel,
  RegisterValueTeaser,
  RegisterValueStats,
} from '@/components/register/value-panel';
import { RegisterForm } from './register-form';

function resolveRefCode(urlRef: string | undefined, cookieRef: string | undefined): string | null {
  // URL ?ref= takes precedence over cookie (explicit user action wins).
  const candidate = (urlRef ?? cookieRef ?? '').toUpperCase();
  if (!candidate) return null;
  return isValidRefCodeShape(candidate) ? candidate : null;
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: { ref?: string };
}) {
  // Authed users hitting /register (e.g. via someone else's referral link)
  // should not see the form — show them the platform instead.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect('/learn');

  const cookieStore = cookies();
  const cookieRef = cookieStore.get(REFERRAL_COOKIE_NAME)?.value;
  const refCode = resolveRefCode(searchParams.ref, cookieRef);

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 py-8 lg:py-12">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:gap-6 lg:items-stretch">
        {/* LEFT: (mobile teaser when no ref) + form + (mobile stats) */}
        <div className="flex flex-col gap-5">
          {/* On mobile, when a referral is present the form's own
              "🎁 +N дней" banner is the most relevant context, so the
              generic teaser is suppressed to avoid stacking two blocks. */}
          {!refCode && <RegisterValueTeaser className="lg:hidden" />}
          <Suspense fallback={<div className="animate-pulse text-gray-400">Загрузка...</div>}>
            <RegisterForm initialRefCode={refCode} />
          </Suspense>
          <RegisterValueStats className="lg:hidden" />
        </div>

        {/* RIGHT: desktop-only full value panel */}
        <RegisterValuePanel className="hidden lg:flex" />
      </div>
    </div>
  );
}
