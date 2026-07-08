import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  REFERRAL_COOKIE_NAME,
  isValidRefCodeShape,
} from '@/lib/referral/attribution';
import { createClient } from '@/lib/supabase/server';
import {
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

  const tochkaEnabled = process.env.TOCHKA_LOGIN_ENABLED === 'true';

  // Split layout on a dark canvas: form (left) floats as a white card; the
  // promo headline + thesis plaques sit on the dark page (right on desktop).
  // Desktop grid places the form in column 1 spanning both rows (vertically
  // centred), the headline top-right, the theses+price bottom-right (filling).
  // Mobile collapses to a single column ordered headline → form → theses.
  return (
    <div className="mx-auto w-full max-w-[1160px] px-4 sm:px-6 md:px-10 lg:px-0 pt-8 pb-16 lg:pt-14 lg:pb-24">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:gap-x-12 lg:gap-y-6 lg:items-stretch">
        {/* FORM — col 1, spans both rows, vertically centred */}
        <div className="order-2 lg:order-none lg:col-start-1 lg:row-span-2 lg:self-center">
          <Suspense fallback={<div className="animate-pulse text-white/40">Загрузка...</div>}>
            <RegisterForm initialRefCode={refCode} tochkaEnabled={tochkaEnabled} />
          </Suspense>
        </div>

        {/* PROMO headline — col 2, row 1 */}
        <RegisterValueTeaser className="order-1 lg:order-none lg:col-start-2 lg:row-start-1" />

        {/* PROMO theses + price — col 2, row 2 (fills remaining height) */}
        <div className="order-3 lg:order-none lg:col-start-2 lg:row-start-2">
          <RegisterValueStats />
        </div>
      </div>
    </div>
  );
}
