// apps/web/src/app/api/partner/verify/resend/route.ts
import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/auth/supabase-admin';
import { sendPartnerConfirmEmail } from '@/lib/carrotquest/emails';
import { buildConfirmUrl } from '@/app/api/partner/mpstats/enter/route';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ ok: false }, { status: 401 });

  try {
    const admin = getSupabaseAdmin();
    const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: user.email });
    const token = link.data?.properties?.hashed_token;
    if (link.error || !token) {
      Sentry.captureException(link.error ?? new Error('generateLink returned no token'), { tags: { area: 'partner-verify', stage: 'generate-link' } });
      return NextResponse.json({ ok: false }, { status: 500 });
    }
    const origin = process.env.NEXT_PUBLIC_SITE_URL || '';
    await sendPartnerConfirmEmail(user.id, {
      email: user.email,
      name: (user.user_metadata?.full_name as string) || undefined,
      confirmUrl: buildConfirmUrl(origin, token, '/mpstats-tools'),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    Sentry.captureException(error, { tags: { area: 'partner-verify', stage: 'unhandled' } });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
