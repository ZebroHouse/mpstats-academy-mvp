import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@mpstats/db/client';
import { resolveReferralCodeRaw } from '@mpstats/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Internal beacon: records a unique-visit click for an ambassador share link.
 *
 * Called fire-and-forget by middleware (via event.waitUntil) on first-touch of a
 * `?ref=CODE` URL — dedup (one count per visitor) is done in middleware by the
 * ref cookie, so this endpoint just increments the per-code/per-day counter.
 *
 * Best-effort: any failure returns 204 and is swallowed, never affecting the
 * user's navigation. Recording REQUIRES the shared REF_CLICK_SECRET (fail-closed):
 * an unset secret is a no-op. This keeps both unauthenticated callers and staging
 * — which shares the prod Supabase but does not set the secret — from inflating
 * the counter. Prod sets REF_CLICK_SECRET; the middleware beacon sends it.
 */
export async function POST(request: NextRequest) {
  try {
    const secret = process.env.REF_CLICK_SECRET;
    if (!secret || request.headers.get('x-ref-click-secret') !== secret) {
      return new NextResponse(null, { status: 204 });
    }

    const body = await request.json().catch(() => null);
    const code = typeof body?.code === 'string' ? body.code : null;
    if (!code) return new NextResponse(null, { status: 204 });

    const record = await resolveReferralCodeRaw(code);
    // Only ambassador codes have a ReferralCode.id to key the counter on.
    if (!record || record.codeType !== 'AMBASSADOR') {
      return new NextResponse(null, { status: 204 });
    }

    const now = new Date();
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    await prisma.referralCodeClickDay.upsert({
      where: { codeId_day: { codeId: record.id, day } },
      create: { codeId: record.id, day, count: 1 },
      update: { count: { increment: 1 } },
    });

    return new NextResponse(null, { status: 204 });
  } catch {
    // Never surface beacon errors — analytics must not break navigation.
    return new NextResponse(null, { status: 204 });
  }
}
