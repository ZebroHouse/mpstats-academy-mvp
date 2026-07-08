import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import * as Sentry from '@sentry/nextjs';
import { prisma } from '@mpstats/db/client';
import { TochkaProvider } from '@/lib/auth/oauth-providers';
import { getSupabaseAdmin } from '@/lib/auth/supabase-admin';
import { REFERRAL_COOKIE_NAME, isValidRefCodeShape } from '@/lib/referral/attribution';
import { issueReferralOnSignup } from '@/lib/referral/issue';
import { ensureBaseTrial } from '@mpstats/api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

  // Feature flag gate — silent redirect to /login when disabled.
  if (process.env.TOCHKA_LOGIN_ENABLED !== 'true') {
    return NextResponse.redirect(new URL('/login', siteUrl));
  }

  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    // 1. Validate code parameter
    if (!code) {
      return NextResponse.redirect(new URL('/login?error=missing_code', siteUrl));
    }

    // 2. CSRF state verification
    const cookieStore = await cookies();
    const storedState = cookieStore.get('tochka_oauth_state')?.value;

    if (!storedState || storedState !== state) {
      return NextResponse.redirect(new URL('/login?error=invalid_state', siteUrl));
    }

    // 3. Delete state cookie (one-time use)
    cookieStore.delete('tochka_oauth_state');

    // 4. Exchange code for access token
    const provider = new TochkaProvider();
    const { accessToken } = await provider.exchangeCode(code);

    // 5. Fetch user info from Tochka
    const userInfo = await provider.getUserInfo(accessToken);

    // Tochka may omit email — distinct error code, and we must NOT reach
    // createUser (which requires an email) below.
    if (!userInfo.email) {
      return NextResponse.redirect(new URL('/login?error=tochka_no_email', siteUrl));
    }

    // 6. Find or create Supabase user
    //
    // Lookup via raw SQL on auth.users — `admin.auth.admin.listUsers()` paginates
    // (default perPage=50) and silently misses everyone past the first page,
    // which broke Yandex login for all existing users on prod once the user
    // count crossed 50 (incident 2026-04-27, 422 email_exists from createUser).
    const admin = getSupabaseAdmin();

    // Case-insensitive match: GoTrue normalizes (lowercases) stored emails.
    const existingRows = await prisma.$queryRaw<Array<{ id: string; email: string }>>`
      SELECT id::text AS id, email
      FROM auth.users
      WHERE lower(email) = lower(${userInfo.email})
      LIMIT 1
    `;
    const isNewUser = existingRows.length === 0;

    let supabaseUserId: string;
    let supabaseUserEmail: string;

    if (existingRows.length > 0) {
      supabaseUserId = existingRows[0].id;
      supabaseUserEmail = existingRows[0].email;

      // Backfill tochka_id on user_metadata for accounts that pre-date the
      // marker. Best-effort: failures are logged but don't break sign-in.
      void admin.auth.admin
        .updateUserById(supabaseUserId, {
          user_metadata: {
            tochka_id: userInfo.id,
            full_name: userInfo.name,
          },
        })
        .then(({ error }) => {
          if (error) {
            Sentry.captureException(error, {
              tags: { route: 'tochka-callback', stage: 'backfill-tochka-id' },
            });
          }
        });
    } else {
      const { data: createData, error: createError } =
        await admin.auth.admin.createUser({
          email: userInfo.email,
          email_confirm: true,
          user_metadata: {
            full_name: userInfo.name,
            tochka_id: userInfo.id,
            tochka_email_verified: userInfo.emailVerified ?? null,
            tochka_phone_verified: userInfo.phoneVerified ?? null,
          },
        });

      if (createError || !createData.user) {
        console.error('Failed to create user:', createError);
        Sentry.captureException(createError ?? new Error('createUser returned no user'), {
          tags: { route: 'tochka-callback', stage: 'create-user' },
        });
        return NextResponse.redirect(
          new URL('/login?error=auth_callback_error', siteUrl)
        );
      }

      supabaseUserId = createData.user.id;
      supabaseUserEmail = createData.user.email!;
    }

    // 7. Generate Supabase session via magiclink trick
    const { data: linkData, error: linkError } =
      await admin.auth.admin.generateLink({
        type: 'magiclink',
        email: supabaseUserEmail,
      });

    if (linkError || !linkData) {
      console.error('Failed to generate link:', linkError);
      Sentry.captureException(linkError ?? new Error('generateLink returned no data'), {
        tags: { route: 'tochka-callback', stage: 'generate-link' },
      });
      return NextResponse.redirect(
        new URL('/login?error=auth_callback_error', siteUrl)
      );
    }

    // 8. Verify OTP to get session tokens
    const { data: otpData, error: otpError } = await admin.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'magiclink',
    });

    if (otpError || !otpData.session) {
      console.error('Failed to verify OTP:', otpError);
      Sentry.captureException(otpError ?? new Error('verifyOtp returned no session'), {
        tags: { route: 'tochka-callback', stage: 'verify-otp' },
      });
      return NextResponse.redirect(
        new URL('/login?error=auth_callback_error', siteUrl)
      );
    }

    // 9. Update UserProfile.tochkaId + phone via Prisma upsert
    let profilePhone: string | null = null;
    try {
      const upserted = await prisma.userProfile.upsert({
        where: { id: supabaseUserId },
        update: {
          tochkaId: userInfo.id,
          ...(userInfo.phone ? { phone: userInfo.phone } : {}),
        },
        create: {
          id: supabaseUserId,
          name: userInfo.name,
          tochkaId: userInfo.id,
          phone: userInfo.phone,
        },
      });
      profilePhone = upserted.phone;
    } catch (prismaError) {
      // Non-fatal: tochkaId binding failed but session is valid
      console.error('Failed to update tochkaId:', prismaError);
    }

    // 10. Create redirect response and set session cookies
    const needsPhone = isNewUser && !profilePhone;
    const redirectTo = needsPhone ? '/complete-profile' : '/dashboard';
    const response = NextResponse.redirect(new URL(redirectTo, siteUrl));

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll() {
            return [];
          },
          setAll(
            cookiesToSet: {
              name: string;
              value: string;
              options: Record<string, unknown>;
            }[]
          ) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options as Record<string, unknown>);
            });
          },
        },
      }
    );

    await supabase.auth.setSession({
      access_token: otpData.session.access_token,
      refresh_token: otpData.session.refresh_token,
    });

    // 11. Fire referral hook — new users only
    if (isNewUser) {
      const refCookie = cookieStore.get(REFERRAL_COOKIE_NAME)?.value;
      const refCode = refCookie && isValidRefCodeShape(refCookie) ? refCookie : null;
      if (refCode) {
        issueReferralOnSignup({ refCode, friendUserId: supabaseUserId }).catch((err) => {
          console.error('[TochkaCallback] referral issue failed:', err);
        });
        response.cookies.delete(REFERRAL_COOKIE_NAME);
      } else {
        // No referral code → grant the base auto-trial (idempotent, swallows errors).
        await ensureBaseTrial(supabaseUserId);
      }
    }

    return response;
  } catch (error) {
    console.error('Tochka OAuth callback error:', error);
    Sentry.captureException(error, {
      tags: { route: 'tochka-callback', stage: 'unhandled' },
    });
    return NextResponse.redirect(
      new URL('/login?error=auth_callback_error', siteUrl)
    );
  }
}
