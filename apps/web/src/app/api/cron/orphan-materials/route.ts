import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { prisma } from '@mpstats/db/client';
import { MATERIAL_STORAGE_BUCKET } from '@mpstats/shared';

export const dynamic = 'force-dynamic';

/**
 * Cron: Cleanup orphan files in lesson-materials Storage bucket (Phase 49 D-13).
 *
 * Strategy:
 *  - Walk bucket recursively (top-level type/ -> {materialId|uploadId}/ -> filename)
 *  - For each file, check if any Material has matching storagePath in DB
 *  - Delete files older than 24h with no DB reference
 *
 * Auth: CRON_SECRET Bearer header.
 * Schedule: GitHub Action 03:00 UTC daily (06:00 МСК).
 */

const ORPHAN_AGE_MS = 24 * 60 * 60 * 1000; // 24h (D-13)
const TYPE_DIRS = [
  'presentation',
  'calculation_table',
  'external_service',
  'checklist',
  'memo',
];

async function handle(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // GitHub Actions schedules drift 60-100min under load — wide margin avoids false alerts.
  const checkInId = Sentry.captureCheckIn(
    {
      monitorSlug: 'orphan-materials',
      status: 'in_progress',
    },
    {
      schedule: { type: 'crontab', value: '0 3 * * *' },
      checkinMargin: 180,
      maxRuntime: 30,
      timezone: 'UTC',
    },
  );

  try {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
    );

    // 1) Walk bucket and collect all file paths with timestamps
    const allPaths: { path: string; updatedAt: number }[] = [];
    for (const t of TYPE_DIRS) {
      const { data: idDirs, error: e1 } = await sb.storage
        .from(MATERIAL_STORAGE_BUCKET)
        .list(t, { limit: 1000 });
      if (e1) {
        console.error(`[orphan-materials] list error for ${t}/`, e1);
        continue;
      }
      for (const idDir of idDirs ?? []) {
        const { data: files, error: e2 } = await sb.storage
          .from(MATERIAL_STORAGE_BUCKET)
          .list(`${t}/${idDir.name}`, { limit: 100 });
        if (e2) {
          console.error(`[orphan-materials] list error for ${t}/${idDir.name}/`, e2);
          continue;
        }
        for (const f of files ?? []) {
          const meta = f as { updated_at?: string; created_at?: string };
          const ts = meta.updated_at || meta.created_at;
          allPaths.push({
            path: `${t}/${idDir.name}/${f.name}`,
            updatedAt: ts ? new Date(ts).getTime() : 0,
          });
        }
      }
    }

    // 2) Get all known storagePaths from DB
    const materials = await prisma.material.findMany({
      select: { storagePath: true },
      where: { storagePath: { not: null } },
    });
    const known = new Set(
      materials
        .map((m: { storagePath: string | null }) => m.storagePath)
        .filter((p: string | null): p is string => Boolean(p)),
    );

    // 3) Identify orphans (no DB ref + older than 24h)
    const now = Date.now();
    const orphans: string[] = [];
    for (const p of allPaths) {
      if (known.has(p.path)) continue;
      const age = p.updatedAt > 0 ? now - p.updatedAt : Infinity;
      if (age >= ORPHAN_AGE_MS) orphans.push(p.path);
    }

    // 4) Bulk delete (Supabase remove() accepts up to 1000 paths per call)
    let deleted = 0;
    if (orphans.length > 0) {
      const { data, error } = await sb.storage
        .from(MATERIAL_STORAGE_BUCKET)
        .remove(orphans);
      if (error) throw error;
      deleted = data?.length ?? 0;
    }

    console.log(
      `[orphan-materials] scanned=${allPaths.length} orphans=${orphans.length} deleted=${deleted}`,
    );

    Sentry.captureCheckIn({
      checkInId,
      monitorSlug: 'orphan-materials',
      status: 'ok',
    });

    return NextResponse.json({
      ok: true,
      scanned: allPaths.length,
      orphans: orphans.length,
      deleted,
    });
  } catch (error) {
    Sentry.captureException(error);
    Sentry.captureCheckIn({
      checkInId,
      monitorSlug: 'orphan-materials',
      status: 'error',
    });
    console.error('[orphan-materials] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
