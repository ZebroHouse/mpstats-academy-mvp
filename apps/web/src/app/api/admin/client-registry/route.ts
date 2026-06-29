/**
 * GET /api/admin/client-registry?from=ISO&to=ISO
 *
 * CSV export of the sales client registry for a registration-date range.
 * Admin/superadmin only. Shares fetchClientRegistry with the analytics tab so
 * the export matches the on-screen table. The sales lead matches emails +
 * assigns payments to managers manually downstream.
 */
import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { prisma } from '@mpstats/db/client';
import { createClient } from '@/lib/supabase/server';
import { fetchClientRegistry, toRegistryCsv } from '@mpstats/api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const profile = await prisma.userProfile.findUnique({
      where: { id: user.id },
      select: { role: true },
    });
    if (!profile || (profile.role !== 'ADMIN' && profile.role !== 'SUPERADMIN')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const toParam = searchParams.get('to');
    const fromParam = searchParams.get('from');
    const to = toParam ? new Date(toParam) : new Date();
    const from = fromParam ? new Date(fromParam) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return NextResponse.json({ error: 'Invalid date range' }, { status: 400 });
    }
    if ((to.getTime() - from.getTime()) / 86_400_000 > 366) {
      return NextResponse.json({ error: 'Date range too large (max 366 days)' }, { status: 400 });
    }

    const rows = await fetchClientRegistry(prisma, { from, to });
    const csv = toRegistryCsv(rows);
    const fname = `client-registry_${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fname}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    Sentry.captureException(error);
    console.error('[client-registry] export failed:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
