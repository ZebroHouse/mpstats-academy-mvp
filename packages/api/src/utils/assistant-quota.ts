import type { PrismaClient } from '@mpstats/db';
import { getUserActiveSubscriptions, getUserAdminBypass } from './access';

export const FREE_DAILY = 5;
export const PAID_DAILY = 50;
export const BURST_PER_MIN = 6;

const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

export type AssistantTier = 'free' | 'full';

export interface AssistantQuota {
  tier: AssistantTier;
  limit: number;
  used: number;
  remaining: number;
  resetsAt: Date;
}

export function startOfMskDay(now: Date): Date {
  const shifted = new Date(now.getTime() + MSK_OFFSET_MS);
  const midnightMsk = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  return new Date(midnightMsk - MSK_OFFSET_MS);
}

function nextMskMidnight(now: Date): Date {
  return new Date(startOfMskDay(now).getTime() + 24 * 60 * 60 * 1000);
}

export async function getAssistantQuota(
  userId: string,
  prisma: PrismaClient,
  now: Date,
): Promise<AssistantQuota> {
  const [subs, isAdmin] = await Promise.all([
    getUserActiveSubscriptions(userId, prisma),
    getUserAdminBypass(userId, prisma),
  ]);
  const full = isAdmin || subs.length > 0;
  const limit = full ? PAID_DAILY : FREE_DAILY;

  const since = startOfMskDay(now);
  const used = await prisma.assistantMessage.count({
    where: {
      role: 'assistant',
      inDomain: true,
      createdAt: { gte: since },
      conversation: { userId },
    },
  });

  return {
    tier: full ? 'full' : 'free',
    limit,
    used,
    remaining: Math.max(0, limit - used),
    resetsAt: nextMskMidnight(now),
  };
}
