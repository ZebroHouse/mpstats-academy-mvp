import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@mpstats/db/client';
import { sendWelcomeEmail } from '@/lib/carrotquest/emails';
import { REFERRAL_COOKIE_NAME, isValidRefCodeShape } from '@/lib/referral/attribution';
import { issueReferralOnSignup } from '@/lib/referral/issue';
import { ensureBaseTrial } from '@mpstats/api';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') ?? '/dashboard';

  // Use SITE_URL for redirects — requestUrl.origin returns internal Docker address (0.0.0.0:3000)
  const origin = process.env.NEXT_PUBLIC_SITE_URL || requestUrl.origin;

  // Recovery links land here with ?next=/reset-password — they must NOT trigger
  // trial/referral side-effects (the user already exists and is just resetting).
  const isRecovery = next === '/reset-password';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Fire pa_registration_completed for first-time email confirmation;
      // also salvage the promo flow if `?next=/pricing?promo=...` was lost
      // (PKCE cookie missing in mail-client browser, /resend without redirect_to, etc.)
      let salvagedNext: string | null = null;

      // Referral / base-trial: this code-exchange path is the second DOI-confirm
      // route (alongside /auth/confirm). Without this block, users whose signup
      // confirmation resolves through /auth/callback instead of /auth/confirm never
      // received their base trial — ~half of registrations (2026-07 funnel audit).
      const rawRefCode = request.cookies.get(REFERRAL_COOKIE_NAME)?.value ?? '';
      const refCode = isValidRefCodeShape(rawRefCode) ? rawRefCode : null;

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const profile = await prisma.userProfile.findUnique({
            where: { id: user.id },
            select: { lastActiveAt: true, name: true },
          });
          // lastActiveAt === null means first authenticated request ever
          if (profile && profile.lastActiveAt === null) {
            sendWelcomeEmail(user.id, {
              name: profile.name || user.user_metadata?.name || '',
              email: user.email || '',
              phone: user.user_metadata?.phone || '',
            }).catch(err => console.error('[Auth] Welcome email failed:', err));
          }
          const pendingPromo = user.user_metadata?.pending_promo;
          if (typeof pendingPromo === 'string' && pendingPromo.length > 0 && !next.includes('promo=')) {
            salvagedNext = `/pricing?promo=${encodeURIComponent(pendingPromo)}`;
          }

          // Referral hook: fire-and-forget, never blocks redirect.
          // No referral code → grant the base auto-trial (idempotent, swallows errors).
          // Skipped on recovery — resetting a password must not mint a trial.
          if (!isRecovery) {
            if (refCode) {
              issueReferralOnSignup({ refCode, friendUserId: user.id })
                .catch(err => console.error('[Auth] referral issue failed:', err));
            } else {
              await ensureBaseTrial(user.id);
            }
          }
        }
      } catch (err) {
        console.error('[Auth] Registration completed event error:', err);
      }

      const response = NextResponse.redirect(new URL(salvagedNext ?? next, origin));
      if (refCode) response.cookies.delete(REFERRAL_COOKIE_NAME);
      return response;
    }
  }

  return NextResponse.redirect(
    new URL('/login?error=auth_callback_error', origin)
  );
}
