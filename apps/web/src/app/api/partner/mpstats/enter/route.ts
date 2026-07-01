// apps/web/src/app/api/partner/mpstats/enter/route.ts
import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { prisma } from '@mpstats/db/client';
import { getSupabaseAdmin } from '@/lib/auth/supabase-admin';
import { createClient } from '@/lib/supabase/server';
import { resolvePartnerLessonId } from '@/lib/partner/resolve-module';
import { verifyPartnerSignature } from '@/lib/partner/signature';
import { firePartnerEntryLead, sendPartnerConfirmEmail } from '@/lib/carrotquest/emails';
import { createFixedWindowLimiter, clientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// Per-IP throttle for this public, unauthenticated endpoint. It can create users,
// mint sessions, and send emails, so cap scripted abuse: 10 requests / 60s / IP.
// A legit partner user hits it once; a NAT'd office still fits comfortably.
const PARTNER_ENTRY_LIMIT = 10;
const PARTNER_ENTRY_WINDOW_MS = 60_000;
const partnerEntryLimiter = createFixedWindowLimiter(PARTNER_ENTRY_LIMIT, PARTNER_ENTRY_WINDOW_MS);

/**
 * Public entry from the MPSTATS service. NEVER logs the PII query params.
 * Design: docs/superpowers/specs/2026-06-10-mpstats-tools-seamless-auth-design.md
 *
 * Gated by TWO env flags:
 *   PARTNER_COURSES_ENABLED — the /mpstats-tools section must be live.
 *   PARTNER_ENTRY_ENABLED   — the entry endpoint itself (dark by default).
 *                             Flip to "true" when Igor's form + Kara's button
 *                             params are wired to this URL.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const origin = process.env.NEXT_PUBLIC_SITE_URL || url.origin;
  const home = () => NextResponse.redirect(new URL('/', origin));

  if (process.env.PARTNER_COURSES_ENABLED !== 'true' || process.env.PARTNER_ENTRY_ENABLED !== 'true') return home();

  // Rate-limit only once the endpoint is live (above gate returns early while dark).
  if (!partnerEntryLimiter.check(clientIp(request), Date.now())) {
    return new NextResponse('Too Many Requests', { status: 429 });
  }

  const email = (url.searchParams.get('email') || '').trim().toLowerCase();
  if (!email) return home();
  const name = url.searchParams.get('name') || undefined;
  const phone = url.searchParams.get('phone') || undefined;
  const moduleCode = url.searchParams.get('module_code') || '';
  const sig = url.searchParams.get('sig') || '';
  const exp = url.searchParams.get('exp') ? Number(url.searchParams.get('exp')) : NaN;

  try {
    const lessonId = await resolvePartnerLessonId(prisma, moduleCode);
    const target = lessonId ? `/mpstats-tools/${lessonId}` : '/mpstats-tools';

    const secret = process.env.MPSTATS_PARTNER_SIGNING_SECRET || '';
    const nowSeconds = Math.floor(Date.now() / 1000);
    const trusted =
      !!sig && Number.isFinite(exp) &&
      verifyPartnerSignature({ email, phone, name, moduleCode, exp, sig }, secret, nowSeconds);

    const admin = getSupabaseAdmin();
    const existing = await prisma.$queryRaw<Array<{ id: string; email: string }>>`
      SELECT id::text AS id, email FROM auth.users WHERE email = ${email} LIMIT 1
    `;
    const existingUser = existing[0] ?? null;

    // --- Trusted branch (dormant): filled in Task 6 ---
    if (trusted) {
      const userId = existingUser ? existingUser.id : await createPartnerUser(admin, email, name, /* pendingVerify */ false);
      if (!userId) return NextResponse.redirect(new URL('/login?error=partner_entry', origin));
      await upsertPartnerProfile(userId, name, phone);
      void firePartnerEntryLead(userId, { email, name, phone, moduleCode: moduleCode || undefined });
      return establishSession(admin, email, target, origin);
    }

    // --- Untrusted, existing user: filled in Task 7 ---
    if (existingUser) {
      const server = await createClient();
      const { data: { user: sessionUser } } = await server.auth.getUser();
      if (sessionUser?.email && sessionUser.email.toLowerCase() === email.toLowerCase()) {
        return NextResponse.redirect(new URL(target, origin)); // already logged in on this device
      }
      // Prove ownership via a magic link to the real inbox (reuses pa_doi delivery).
      const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
      const token = link.data?.properties?.hashed_token;
      if (link.error || !token) {
        Sentry.captureException(link.error ?? new Error('generateLink returned no token'), { tags: { area: 'partner-entry', stage: 'generate-link' } });
        return NextResponse.redirect(new URL('/login?error=partner_entry', origin));
      }
      void firePartnerEntryLead(existingUser.id, { email, name, phone, moduleCode: moduleCode || undefined });
      void sendPartnerConfirmEmail(existingUser.id, { email, name, confirmUrl: buildConfirmUrl(origin, token, target) });
      return NextResponse.redirect(new URL(`/partner/check-email?email=${encodeURIComponent(email)}`, origin));
    }

    // --- Untrusted, brand-new email: auto-create + auto-session ---
    // New users have onboardingCompletedAt === null, so the (main) layout guard will
    // bounce them to /welcome before they can reach `target`. Pass the intended
    // destination as ?next= so the wizard can restore it after completion.
    const userId = await createPartnerUser(admin, email, name, /* pendingVerify */ true);
    if (!userId) return NextResponse.redirect(new URL('/login?error=partner_entry', origin));

    await upsertPartnerProfile(userId, name, phone);
    void firePartnerEntryLead(userId, { email, name, phone, moduleCode: moduleCode || undefined });
    const onboardingTarget = `/welcome?next=${encodeURIComponent(target)}`;
    return establishSession(admin, email, onboardingTarget, origin);
  } catch (error) {
    Sentry.captureException(error, { tags: { area: 'partner-entry', stage: 'unhandled' } });
    return NextResponse.redirect(new URL('/login?error=partner_entry', origin));
  }
}

/** Creates a partner user (email_confirm:true so the session mints reliably). */
async function createPartnerUser(
  admin: ReturnType<typeof getSupabaseAdmin>,
  email: string,
  name: string | undefined,
  pendingVerify: boolean,
): Promise<string | null> {
  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: name ?? '', passwordless: true, ...(pendingVerify ? { partner_pending_verify: true } : {}) },
  });
  if (created.error || !created.data.user) {
    Sentry.captureException(created.error ?? new Error('createUser returned no user'), { tags: { area: 'partner-entry', stage: 'create-user' } });
    return null;
  }
  return created.data.user.id;
}

async function upsertPartnerProfile(userId: string, name: string | undefined, phone: string | undefined): Promise<void> {
  await prisma.userProfile.upsert({
    where: { id: userId },
    update: { ...(phone ? { phone } : {}) },
    create: { id: userId, name: name ?? null, phone: phone ?? null },
  }).catch((e) => Sentry.captureException(e, { tags: { area: 'partner-entry', stage: 'profile-upsert' } }));
}

/** Mints a session for `email` and returns a redirect to `target` with cookies set. */
async function establishSession(
  admin: ReturnType<typeof getSupabaseAdmin>,
  email: string,
  target: string,
  origin: string,
): Promise<Response> {
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const token = link.data?.properties?.hashed_token;
  if (link.error || !token) {
    Sentry.captureException(link.error ?? new Error('generateLink returned no token'), { tags: { area: 'partner-entry', stage: 'generate-link' } });
    return NextResponse.redirect(new URL('/login?error=partner_entry', origin));
  }
  const otp = await admin.auth.verifyOtp({ token_hash: token, type: 'magiclink' });
  if (otp.error || !otp.data.session) {
    Sentry.captureException(otp.error ?? new Error('verifyOtp returned no session'), { tags: { area: 'partner-entry', stage: 'verify-otp' } });
    return NextResponse.redirect(new URL('/login?error=partner_entry', origin));
  }
  const response = NextResponse.redirect(new URL(target, origin));
  const { createServerClient } = await import('@supabase/ssr');
  const ssr = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return []; },
        setAll(cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  await ssr.auth.setSession({ access_token: otp.data.session.access_token, refresh_token: otp.data.session.refresh_token });
  return response;
}

/** Builds the same-domain confirm URL for magic-link delivery (Task 7 / banner). */
export function buildConfirmUrl(origin: string, tokenHash: string, target: string): string {
  return `${origin}/auth/confirm?token_hash=${tokenHash}&type=magiclink&next=${encodeURIComponent(target)}`;
}
