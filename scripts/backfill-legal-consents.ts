/**
 * Task 10: backfill reconstructed legacy consents for existing users.
 *
 * For each UserProfile, inserts two UserConsent rows (OFFER + PDN) with:
 *   - source: 'BACKFILL'
 *   - version: 'legacy-pre-2026-07-28'
 *   - acceptedAt: UserProfile.createdAt
 *
 * ADV is intentionally NOT backfilled — no data exists, and presuming ad
 * consent would be a 38-FZ risk. See docs/superpowers/plans/2026-07-28-legal-consent-audit-trail.md §2.7.
 *
 * Honesty over completeness: the legacy-* version + BACKFILL source make it
 * visible in any dispute that this is a reconstruction from registration date,
 * not a recorded real acceptance.
 *
 * Idempotent — re-running skips users who already have a BACKFILL-source
 * consent row (checked once via a single query for all existing BACKFILL
 * userIds).
 *
 * Usage:
 *   NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/backfill-legal-consents.ts --dry-run
 *   NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/backfill-legal-consents.ts --apply
 */

import { PrismaClient, ConsentKind, ConsentSource } from '@prisma/client';

const prisma = new PrismaClient();

const LEGACY_VERSION = 'legacy-pre-2026-07-28';
const BACKFILL_KINDS: ConsentKind[] = [ConsentKind.OFFER, ConsentKind.PDN];

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const apply = args.includes('--apply');

  if (!dryRun && !apply) {
    console.error('Usage: --dry-run or --apply');
    process.exit(1);
  }

  const totalUsers = await prisma.userProfile.count();
  console.log(`Total UserProfile rows: ${totalUsers}`);

  // Users that already have a BACKFILL-source consent row — skip them.
  const alreadyBackfilled = await prisma.userConsent.findMany({
    where: { source: ConsentSource.BACKFILL },
    select: { userId: true },
    distinct: ['userId'],
  });
  const skipIds = new Set(alreadyBackfilled.map((r) => r.userId));

  const users = await prisma.userProfile.findMany({
    where: { id: { notIn: [...skipIds] } },
    select: { id: true, createdAt: true },
  });

  console.log(`Users already backfilled (skip): ${skipIds.size}`);
  console.log(`Users to backfill: ${users.length}`);
  console.log(`Rows that would be inserted (2 per user): ${users.length * 2}`);

  if (dryRun) {
    console.log('[DRY RUN] Would backfill:');
    for (const u of users.slice(0, 10)) {
      console.log(`  - ${u.id} (createdAt=${u.createdAt.toISOString()})`);
    }
    if (users.length > 10) console.log(`  ... and ${users.length - 10} more`);
    return;
  }

  let backfilled = 0;
  let rowsInserted = 0;
  for (const user of users) {
    try {
      for (const kind of BACKFILL_KINDS) {
        await prisma.userConsent.create({
          data: {
            userId: user.id,
            kind,
            version: LEGACY_VERSION,
            source: ConsentSource.BACKFILL,
            acceptedAt: user.createdAt,
          },
        });
        rowsInserted++;
      }
      backfilled++;
      if (backfilled % 25 === 0) {
        console.log(`Backfilled ${backfilled}/${users.length} users (${rowsInserted} rows)...`);
      }
    } catch (err) {
      console.error(`Failed for user ${user.id}:`, err);
    }
  }
  console.log(`Done. Backfilled ${backfilled} users, inserted ${rowsInserted} rows.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
