/**
 * Phase 63 — list & flag the test-account backlog (UserProfile.isTest).
 *
 * Candidate heuristic (owner reviews the printed list BEFORE applying):
 *   - email matches @mpstats.academy / @mpstats.io, or starts with tester@/test@
 *   - OR the user owns a subscription on a hidden plan (e.g. 10₽ smoke plan)
 *
 * Usage:
 *   pnpm tsx scripts/analytics/backfill-is-test.ts            # dry-run: print candidates
 *   pnpm tsx scripts/analytics/backfill-is-test.ts --confirm  # apply isTest=true
 *
 * Reads SUPABASE_SECRET_KEY + NEXT_PUBLIC_SUPABASE_URL + DATABASE_URL from env.
 */
import { prisma } from '@mpstats/db';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--confirm');

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // 1. email-based candidates
  const { data: authData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const emailById = new Map<string, string>();
  (authData?.users ?? []).forEach((u) => { if (u.email) emailById.set(u.id, u.email); });
  const emailCandidates = [...emailById.entries()]
    .filter(([, email]) => {
      const e = email.toLowerCase();
      return e.endsWith('@mpstats.academy') || e.endsWith('@mpstats.io') ||
             e.startsWith('tester@') || e.startsWith('test@');
    })
    .map(([id]) => id);

  // 2. hidden-plan subscribers
  const hiddenSubs = await prisma.subscription.findMany({
    where: { plan: { hidden: true } },
    select: { userId: true },
  });
  const hiddenPlanUserIds = hiddenSubs.map((s) => s.userId);

  const candidateIds = [...new Set([...emailCandidates, ...hiddenPlanUserIds])];

  console.log(`\n=== ${candidateIds.length} test-account candidates ===`);
  for (const id of candidateIds) {
    console.log(`  ${id}  ${emailById.get(id) ?? '(no email)'}`);
  }

  if (!APPLY) {
    console.log('\nDry-run. Re-run with --confirm to set isTest=true on the above.');
    return;
  }

  const res = await prisma.userProfile.updateMany({
    where: { id: { in: candidateIds } },
    data: { isTest: true },
  });
  console.log(`\nApplied isTest=true to ${res.count} users.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
