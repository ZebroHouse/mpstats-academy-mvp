/**
 * Fetches + assembles the sales client registry from our DB for a date range
 * (by registration date). Shared by the admin.analytics.getClientRegistry tRPC
 * procedure (JSON for the table) and the CSV export route — both call this so
 * the data is identical. Test users are excluded.
 */

import { Prisma, type PrismaClient } from '@mpstats/db';
import { assembleClientRegistry, type RegistryRow, type RegistrySource } from '../utils/client-registry';

export interface RegistryRange {
  from: Date;
  to: Date;
}

/** Failsafe cap on rows pulled per export (range is also bounded by callers). */
const MAX_REGISTRY_ROWS = 20000;

export async function fetchClientRegistry(
  prisma: PrismaClient,
  range: RegistryRange,
): Promise<RegistryRow[]> {
  const profiles = await prisma.userProfile.findMany({
    where: { createdAt: { gte: range.from, lte: range.to }, isTest: false },
    select: { id: true, name: true, phone: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: MAX_REGISTRY_ROWS,
  });
  const ids = profiles.map((p) => p.id);
  if (ids.length === 0) return [];

  const [emailRows, referrals, payments, checkouts] = await Promise.all([
    // Email lives in Supabase auth.users, not UserProfile.
    prisma.$queryRaw<Array<{ id: string; email: string | null }>>`
      SELECT id::text AS id, email FROM auth.users WHERE id IN (${Prisma.join(ids)})
    `,
    prisma.referral.findMany({
      where: { referredUserId: { in: ids } },
      select: {
        referredUserId: true,
        referralCode: { select: { label: true } },
        referrer: { select: { name: true } },
      },
    }),
    prisma.payment.findMany({
      where: { subscription: { userId: { in: ids } } },
      select: {
        status: true,
        amount: true,
        paidAt: true,
        subscription: { select: { userId: true, plan: { select: { name: true } } } },
      },
    }),
    prisma.checkoutAttempt.findMany({
      where: { userId: { in: ids } },
      select: { userId: true },
      distinct: ['userId'],
    }),
  ]);

  const emailById = new Map(emailRows.map((r) => [r.id, r.email]));

  const sources: RegistrySource[] = referrals.map((r) =>
    r.referralCode
      ? { referredUserId: r.referredUserId, type: 'ambassador', label: r.referralCode.label }
      : { referredUserId: r.referredUserId, type: 'referral', label: r.referrer?.name ?? '—' },
  );

  return assembleClientRegistry({
    users: profiles.map((p) => ({
      id: p.id,
      email: emailById.get(p.id) ?? null,
      name: p.name,
      phone: p.phone,
      createdAt: p.createdAt,
    })),
    sources,
    payments: payments.map((p) => ({
      userId: p.subscription.userId,
      status: p.status,
      amount: p.amount,
      paidAt: p.paidAt,
      planName: p.subscription.plan?.name ?? null,
    })),
    checkoutUserIds: checkouts.map((c) => c.userId).filter((u): u is string => !!u),
  });
}
