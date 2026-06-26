import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@mpstats/db/client';
import { sendWelcomeEmail } from '@/lib/carrotquest/emails';
import * as Sentry from '@sentry/nextjs';
import type { EmailOtpType } from '@supabase/supabase-js';
import { REFERRAL_COOKIE_NAME, isValidRefCodeShape } from '@/lib/referral/attribution';
import { issueReferralOnSignup } from '@/lib/referral/issue';
import { ensureBaseTrial } from '@mpstats/api';

export const dynamic = 'force-dynamic';

const ALLOWED_TYPES: EmailOtpType[] = ['signup', 'recovery', 'email_change', 'invite', 'magiclink'];

// Server-side OTP verification — replaces direct supabase.co/auth/v1/verify links.
// Same-domain URL bypasses ISP/browser blocks of *.supabase.co (Yandex Browser,
// corporate firewalls) and removes PKCE cookie dependency, so links work even when
// the user opens the email in a different browser than they registered in.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const token_hash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const next = url.searchParams.get('next') ?? '/dashboard';

  const origin = process.env.NEXT_PUBLIC_SITE_URL || url.origin;
  const safeNext = next.startsWith('/') ? next : '/dashboard';

  if (!token_hash || !type || !ALLOWED_TYPES.includes(type)) {
    return NextResponse.redirect(new URL('/login?error=link_invalid', origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash, type });

  if (error) {
    Sentry.captureException(error, {
      tags: { area: 'auth-confirm', email_action_type: type },
    });
    const reason = error.message?.toLowerCase().includes('expired') ? 'link_expired' : 'link_invalid';
    return NextResponse.redirect(new URL(`/login?error=${reason}`, origin));
  }

  // Recovery: send user to password reset page (skip welcome email + promo salvage)
  if (type === 'recovery') {
    return NextResponse.redirect(new URL('/reset-password', origin));
  }

  // Read referral cookie on success branch only (before recovery check already passed).
  const rawRefCode = request.cookies.get(REFERRAL_COOKIE_NAME)?.value ?? '';
  const refCode = isValidRefCodeShape(rawRefCode) ? rawRefCode : null;

  // For signup/invite/email_change: replicate /auth/callback side-effects
  // (welcome email on first confirmation, salvaged promo redirect).
  let salvagedNext: string | null = null;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const profile = await prisma.userProfile.findUnique({
        where: { id: user.id },
        select: { lastActiveAt: true, name: true },
      });
      if (profile && profile.lastActiveAt === null) {
        sendWelcomeEmail(user.id, {
          name: profile.name || user.user_metadata?.name || '',
          email: user.email || '',
          phone: user.user_metadata?.phone || '',
        }).catch(err => console.error('[AuthConfirm] Welcome email failed:', err));
      }
      const pendingPromo = user.user_metadata?.pending_promo;
      if (typeof pendingPromo === 'string' && pendingPromo.length > 0 && !safeNext.includes('promo=')) {
        salvagedNext = `/pricing?promo=${encodeURIComponent(pendingPromo)}`;
      }

      // Referral hook: fire-and-forget, never blocks redirect.
      // No referral code → grant the base auto-trial (idempotent, swallows errors).
      if (refCode) {
        issueReferralOnSignup({ refCode, friendUserId: user.id })
          .catch(err => console.error('[AuthConfirm] referral issue failed:', err));
      } else {
        await ensureBaseTrial(user.id);
      }

      // Clear partner_pending_verify flag when a partner auto-created user confirms their email.
      if (user.user_metadata?.partner_pending_verify) {
        const { getSupabaseAdmin } = await import('@/lib/auth/supabase-admin');
        await getSupabaseAdmin().auth.admin.updateUserById(user.id, {
          user_metadata: { ...user.user_metadata, partner_pending_verify: false },
        }).catch((e) => console.error('[AuthConfirm] clear partner_pending_verify failed:', e));
      }
    }
  } catch (err) {
    Sentry.captureException(err, { tags: { area: 'auth-confirm', stage: 'post-verify' } });
    console.error('[AuthConfirm] Post-verify side-effect error:', err);
  }

  const response = NextResponse.redirect(new URL(salvagedNext ?? safeNext, origin));
  if (refCode) response.cookies.delete(REFERRAL_COOKIE_NAME);
  return response;
}
