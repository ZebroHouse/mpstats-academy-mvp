import { describe, it, expect, vi } from 'vitest';
import {
  ACTIVITY_SIGNALS_SELECT,
  buildInsertSql,
  buildDryRunCountSql,
  backfill,
  type BackfillPrisma,
} from '../backfill-activity-days';

/**
 * scripts/backfill-activity-days.ts — idempotent, additive backfill of
 * UserActivityDay from engaged-action signals.
 *
 * HARD RULES the implementation keeps:
 *   - Idempotent via ON CONFLICT ("userId","day") DO NOTHING.
 *   - --dry-run never writes (apply path not taken → $executeRawUnsafe not called).
 *   - Additive only: NO DROP / ALTER / TRUNCATE / DELETE in any generated SQL.
 */

describe('SQL builders', () => {
  it('signals SELECT unions all five activity sources', () => {
    expect(ACTIVITY_SIGNALS_SELECT).toMatch(/"DiagnosticSession"/);
    expect(ACTIVITY_SIGNALS_SELECT).toMatch(/"DiagnosticAnswer"/);
    expect(ACTIVITY_SIGNALS_SELECT).toMatch(/"ChatMessage"/);
    expect(ACTIVITY_SIGNALS_SELECT).toMatch(/"LessonComment"/);
    expect(ACTIVITY_SIGNALS_SELECT).toMatch(/"UserProfile"/);
    expect(ACTIVITY_SIGNALS_SELECT).toMatch(/SELECT DISTINCT/);
  });

  it('insert SQL targets UserActivityDay and is idempotent', () => {
    const sql = buildInsertSql();
    expect(sql).toMatch(/INSERT INTO "UserActivityDay" \("userId", "day"\)/);
    expect(sql).toMatch(/ON CONFLICT \("userId", "day"\) DO NOTHING/);
  });

  it('dry-run SQL only counts (no INSERT)', () => {
    const sql = buildDryRunCountSql();
    expect(sql).toMatch(/SELECT COUNT\(\*\)/);
    expect(sql).not.toMatch(/\bINSERT\b/);
  });

  it('no destructive DDL/DML in any generated SQL (additive-only)', () => {
    const all = `${buildInsertSql()}\n${buildDryRunCountSql()}`;
    expect(all).not.toMatch(/\bDROP\b/i);
    expect(all).not.toMatch(/\bALTER\b/i);
    expect(all).not.toMatch(/\bTRUNCATE\b/i);
    expect(all).not.toMatch(/\bDELETE\b/i);
    expect(all).not.toMatch(/\bUPDATE\b/i);
  });
});

describe('backfill()', () => {
  function makePrismaStub(wouldInsert = 42, inserted = 30) {
    return {
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ would_insert: wouldInsert }]),
      $executeRawUnsafe: vi.fn().mockResolvedValue(inserted),
    } satisfies BackfillPrisma;
  }

  it('dry-run counts but never writes', async () => {
    const prisma = makePrismaStub();
    const r = await backfill(prisma);
    expect(r.wouldInsert).toBe(42);
    expect(r.inserted).toBeNull();
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledOnce();
    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('apply runs the idempotent INSERT and reports inserted count', async () => {
    const prisma = makePrismaStub(42, 30);
    const r = await backfill(prisma, { apply: true });
    expect(r.wouldInsert).toBe(42);
    expect(r.inserted).toBe(30);
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledOnce();
    expect(prisma.$executeRawUnsafe.mock.calls[0][0]).toMatch(/ON CONFLICT/);
  });

  it('handles empty count result as 0', async () => {
    const prisma = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([]),
      $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    } satisfies BackfillPrisma;
    const r = await backfill(prisma);
    expect(r.wouldInsert).toBe(0);
  });
});
