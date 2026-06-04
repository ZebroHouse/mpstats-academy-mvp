import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import type { User } from '@supabase/supabase-js';
import { prisma, type PrismaClient } from '@mpstats/db';
import { createRateLimitMiddleware } from './middleware/rate-limit';

export interface Context {
  prisma: PrismaClient;
  user: User | null;
}

export const createTRPCContext = (user: User | null): Context => {
  return {
    prisma,
    user,
  };
};

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape }) {
    return shape;
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  }

  // Fire-and-forget: update lastActiveAt (debounced to every 5 min)
  const userId = ctx.user.id;
  ctx.prisma.userProfile.findUnique({
    where: { id: userId },
    select: { lastActiveAt: true },
  }).then(profile => {
    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
    if (!profile?.lastActiveAt || profile.lastActiveAt < fiveMinAgo) {
      // Record per-day activity for DAU/WAU/MAU analytics. Idempotent no-op on
      // conflict (composite PK userId+day). Fully isolated: its own catch so an
      // error here never breaks lastActiveAt or the request.
      const day = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
      ));
      ctx.prisma.userActivityDay.upsert({
        where: { userId_day: { userId, day } },
        create: { userId, day },
        update: {},
      }).catch(err => {
        console.error('[tRPC] userActivityDay upsert failed:', err);
      });

      return ctx.prisma.userProfile.update({
        where: { id: userId },
        data: { lastActiveAt: now },
      });
    }
  }).catch(err => {
    console.error('[tRPC] lastActiveAt update failed:', err);
  });

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

// Admin procedure — requires role ADMIN or SUPERADMIN
export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const profile = await ctx.prisma.userProfile.findUnique({
    where: { id: ctx.user.id },
    select: { role: true },
  });

  if (!profile || (profile.role !== 'ADMIN' && profile.role !== 'SUPERADMIN')) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }

  return next({ ctx: { ...ctx, userRole: profile.role } });
});

// Superadmin procedure — requires role SUPERADMIN only
export const superadminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const profile = await ctx.prisma.userProfile.findUnique({
    where: { id: ctx.user.id },
    select: { role: true },
  });

  if (!profile || profile.role !== 'SUPERADMIN') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Superadmin access required' });
  }

  return next({ ctx: { ...ctx, userRole: profile.role } });
});

// AI procedures with rate limiting (built on top of protectedProcedure).
// getLessonSummary intentionally does NOT use this — it's a query backed by
// a persistent DB cache, so legitimate browsing of many lessons should never
// be throttled. aiProcedure stays available for future generative endpoints.
export const aiProcedure = protectedProcedure.use(
  createRateLimitMiddleware(200, 3600000, 'ai') // 200 req/hour
);

export const chatProcedure = protectedProcedure.use(
  createRateLimitMiddleware(40, 3600000, 'chat') // 40 req/hour
);
