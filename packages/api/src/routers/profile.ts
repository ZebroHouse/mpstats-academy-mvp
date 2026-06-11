import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { ensureUserProfile } from '../utils/ensure-user-profile';
import { handleDatabaseError } from '../utils/db-errors';
import { getLatestSkillProfile, getCompletedSessions } from './diagnostic';
import type { PrismaClient } from '@mpstats/db';
import type {
  DashboardData,
  SkillProfile,
  UserStats,
  RecentActivity,
  LessonWithProgress,
} from '@mpstats/shared';

// ============== HELPER FUNCTIONS ==============

/**
 * Calculate consecutive days with activity (lessons or diagnostics).
 * Counts backwards from today/yesterday.
 */
function calculateCurrentStreak(
  lessonProgress: Array<{ completedAt: Date | null }>,
  diagnostics: Array<{ completedAt: Date | null }>,
): number {
  const activityDates = new Set<string>();
  lessonProgress.forEach((p) => {
    if (p.completedAt) activityDates.add(p.completedAt.toISOString().split('T')[0]);
  });
  diagnostics.forEach((d) => {
    if (d.completedAt) activityDates.add(d.completedAt.toISOString().split('T')[0]);
  });

  if (activityDates.size === 0) return 0;

  let streak = 0;
  const checkDate = new Date();

  for (let i = 0; i < 365; i++) {
    const dateStr = checkDate.toISOString().split('T')[0];
    if (activityDates.has(dateStr)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else if (i === 0) {
      // Today has no activity, check from yesterday
      checkDate.setDate(checkDate.getDate() - 1);
      continue;
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Build recent activity list from real lesson progress and diagnostic sessions.
 */
function buildRecentActivity(
  lessonProgress: Array<{
    id: string;
    completedAt: Date | null;
    status: string;
    lesson: { id: string; courseId: string; title: string };
  }>,
  diagnostics: Array<{ id: string; completedAt: Date | null; status: string }>,
): RecentActivity[] {
  const activities: RecentActivity[] = [];

  lessonProgress
    .filter((p) => p.completedAt)
    .slice(0, 5)
    .forEach((p) => {
      activities.push({
        id: `lesson-${p.id}`,
        type: p.status === 'COMPLETED' ? 'lesson_completed' : 'lesson_started',
        title: p.lesson.title,
        description: p.status === 'COMPLETED' ? 'Урок завершён' : 'Урок начат',
        timestamp: p.completedAt!,
        metadata: { lessonId: p.lesson.id, courseId: p.lesson.courseId },
      });
    });

  diagnostics.slice(0, 3).forEach((d) => {
    activities.push({
      id: `diag-${d.id}`,
      type: 'diagnostic_completed',
      title: 'Диагностика навыков',
      description: 'Диагностика завершена',
      timestamp: d.completedAt!,
    });
  });

  return activities
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 10);
}

/**
 * Get next uncompleted lesson for a user, ordered by course then lesson order.
 */
async function getNextUncompletedLesson(
  prisma: PrismaClient,
  _userId: string,
  progress: Array<{ lessonId: string; status: string; watchedPercent: number }>,
): Promise<LessonWithProgress | null> {
  const completedIds = new Set(
    progress.filter((p) => p.status === 'COMPLETED').map((p) => p.lessonId),
  );

  const nextLesson = await prisma.lesson.findFirst({
    where: {
      id: { notIn: [...completedIds] },
      isHidden: false,
      course: { isHidden: false },
    },
    orderBy: [{ course: { order: 'asc' } }, { order: 'asc' }],
    include: { course: true },
  });

  if (!nextLesson) return null;

  const inProgress = progress.find((p) => p.lessonId === nextLesson.id);
  return {
    id: nextLesson.id,
    courseId: nextLesson.courseId,
    title: nextLesson.title,
    description: nextLesson.description,
    videoUrl: nextLesson.videoUrl || '',
    videoId: nextLesson.videoId ?? null,
    duration: nextLesson.duration || 0,
    order: nextLesson.order,
    skillCategory: nextLesson.skillCategory,
    skillLevel: nextLesson.skillLevel,
    status: (inProgress?.status as any) || 'NOT_STARTED',
    watchedPercent: inProgress?.watchedPercent || 0,
  };
}

// ============== ROUTER ==============

export const profileRouter = router({
  // Get current user profile
  get: protectedProcedure.query(async ({ ctx }) => {
    try {
      await ensureUserProfile(ctx.prisma, ctx.user);

      const profile = await ctx.prisma.userProfile.findUnique({
        where: { id: ctx.user.id },
        include: { skillProfile: true },
      });

      // One-time copy of OAuth name (Yandex/other) into UserProfile on first fetch
      if (profile && !profile.name) {
        const oauthName = ctx.user.user_metadata?.full_name || ctx.user.user_metadata?.name;
        if (oauthName && typeof oauthName === 'string') {
          await ctx.prisma.userProfile.update({
            where: { id: ctx.user.id },
            data: { name: oauthName },
          });
          profile.name = oauthName;
        }
      }

      // Surface auth-side fields the UI needs (email + how the user signed up).
      // Email isn't duplicated in UserProfile by design — auth.users is the
      // source of truth (see CLAUDE.md).
      //
      // OAuth detection is non-trivial here:
      //   - Our Yandex flow doesn't use Supabase's native OAuth — the callback
      //     calls admin.createUser({ email, ... }) which writes an `email`
      //     identity AND a randomly-generated encrypted_password. So neither
      //     auth.identities[].provider nor encrypted_password tells us OAuth.
      //   - The actual marker is user_metadata.yandex_id, set by our callback.
      //   - Native Supabase OAuth (e.g. google) does show up in identities[].
      //
      // Rule: a user has a real password they know if they signed up by
      // email/password AND aren't an OAuth-created shadow account.
      const yandexId = ctx.user.user_metadata?.yandex_id as
        | string
        | undefined;
      const identities = ctx.user.identities ?? [];
      const nativeOauthProviders = identities
        .map((i) => i.provider)
        .filter(
          (p): p is string => typeof p === 'string' && p !== 'email',
        );
      const oauthProviders = [
        ...(yandexId ? ['yandex'] : []),
        ...nativeOauthProviders,
      ];
      const hasPassword = oauthProviders.length === 0;
      const passwordless = (ctx.user.user_metadata?.passwordless as boolean | undefined) === true;

      return profile
        ? {
            ...profile,
            email: ctx.user.email ?? null,
            hasPassword,
            oauthProviders,
            passwordless,
          }
        : null;
    } catch (error) {
      handleDatabaseError(error);
    }
  }),

  // Get dashboard data with real stats
  getDashboard: protectedProcedure.query(async ({ ctx }): Promise<DashboardData> => {
    try {
      await ensureUserProfile(ctx.prisma, ctx.user);

      const [skillProfile, _learningPath, completedDiagnostics, allProgress] =
        await Promise.all([
          ctx.prisma.skillProfile.findUnique({ where: { userId: ctx.user.id } }),
          ctx.prisma.learningPath.findUnique({
            where: { userId: ctx.user.id },
            include: {
              progress: {
                include: { lesson: true },
                orderBy: { completedAt: 'desc' },
              },
            },
          }),
          getCompletedSessions(ctx.prisma, ctx.user.id),
          ctx.prisma.lessonProgress.findMany({
            where: { path: { userId: ctx.user.id } },
            include: { lesson: true },
            orderBy: { completedAt: 'desc' },
          }),
        ]);

      // Calculate stats
      const completedLessons = allProgress.filter((p) => p.status === 'COMPLETED');
      const totalWatchTime = completedLessons.reduce(
        (sum, p) => sum + (p.lesson.duration || 0),
        0,
      );

      // Average score from diagnostic sessions
      const averageScore =
        completedDiagnostics.length > 0 && skillProfile
          ? Math.round(
              (skillProfile.analytics +
                skillProfile.marketing +
                skillProfile.content +
                skillProfile.operations +
                skillProfile.finance) /
                5,
            )
          : 0;

      // Activity streak
      const currentStreak = calculateCurrentStreak(allProgress, completedDiagnostics);

      // Recent activity
      const recentActivity = buildRecentActivity(allProgress, completedDiagnostics);

      // Next lesson recommendation
      const progressForNext = allProgress.map((p) => ({
        lessonId: p.lessonId,
        status: p.status,
        watchedPercent: p.watchedPercent,
      }));
      const nextLesson = await getNextUncompletedLesson(
        ctx.prisma,
        ctx.user.id,
        progressForNext,
      );

      // Completion percent — denominator excludes hidden content so the user
      // sees progress against what they can actually watch.
      const totalLessons = await ctx.prisma.lesson.count({
        where: { isHidden: false, course: { isHidden: false } },
      });
      const completionPercent =
        totalLessons > 0
          ? Math.round((completedLessons.length / totalLessons) * 100)
          : 0;

      return {
        stats: {
          totalLessonsCompleted: completedLessons.length,
          totalWatchTime,
          currentStreak,
          longestStreak: 0, // MVP: not calculated from full history
          averageScore,
          lastActivityAt:
            completedLessons[0]?.completedAt ||
            completedDiagnostics[0]?.completedAt ||
            null,
        },
        skillProfile: skillProfile
          ? {
              analytics: skillProfile.analytics,
              marketing: skillProfile.marketing,
              content: skillProfile.content,
              operations: skillProfile.operations,
              finance: skillProfile.finance,
            }
          : null,
        recentActivity,
        nextLesson,
        completionPercent,
      };
    } catch (error) {
      handleDatabaseError(error);
    }
  }),

  // Get skill profile for current user
  getSkillProfile: protectedProcedure.query(async ({ ctx }): Promise<SkillProfile | null> => {
    try {
      return await getLatestSkillProfile(ctx.prisma, ctx.user.id);
    } catch (error) {
      handleDatabaseError(error);
    }
  }),

  // Get user stats
  getStats: protectedProcedure.query(async ({ ctx }): Promise<UserStats> => {
    try {
      const [completedLessons, completedDiagnostics, skillProfile] = await Promise.all([
        ctx.prisma.lessonProgress.findMany({
          where: { path: { userId: ctx.user.id }, status: 'COMPLETED' },
          include: { lesson: true },
          orderBy: { completedAt: 'desc' },
        }),
        ctx.prisma.diagnosticSession.findMany({
          where: { userId: ctx.user.id, status: 'COMPLETED' },
          orderBy: { completedAt: 'desc' },
        }),
        ctx.prisma.skillProfile.findUnique({ where: { userId: ctx.user.id } }),
      ]);

      const totalWatchTime = completedLessons.reduce(
        (sum, p) => sum + (p.lesson.duration || 0),
        0,
      );
      const averageScore =
        skillProfile
          ? Math.round(
              (skillProfile.analytics +
                skillProfile.marketing +
                skillProfile.content +
                skillProfile.operations +
                skillProfile.finance) /
                5,
            )
          : 0;
      const currentStreak = calculateCurrentStreak(completedLessons, completedDiagnostics);

      return {
        totalLessonsCompleted: completedLessons.length,
        totalWatchTime,
        currentStreak,
        longestStreak: 0,
        averageScore,
        lastActivityAt:
          completedLessons[0]?.completedAt ||
          completedDiagnostics[0]?.completedAt ||
          null,
      };
    } catch (error) {
      handleDatabaseError(error);
    }
  }),

  // Get recent activity
  getRecentActivity: protectedProcedure.query(async ({ ctx }) => {
    try {
      const [allProgress, completedDiagnostics] = await Promise.all([
        ctx.prisma.lessonProgress.findMany({
          where: { path: { userId: ctx.user.id } },
          include: { lesson: true },
          orderBy: { completedAt: 'desc' },
          take: 10,
        }),
        ctx.prisma.diagnosticSession.findMany({
          where: { userId: ctx.user.id, status: 'COMPLETED' },
          orderBy: { completedAt: 'desc' },
          take: 5,
        }),
      ]);

      return buildRecentActivity(allProgress, completedDiagnostics);
    } catch (error) {
      handleDatabaseError(error);
    }
  }),

  // Generate avatar upload path for client-side Supabase Storage upload
  getAvatarUploadUrl: protectedProcedure.query(async ({ ctx }) => {
    const timestamp = Date.now();
    const path = `${ctx.user.id}/${timestamp}.webp`;
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/avatars/${path}`;
    return { path, url, bucket: 'avatars' as const };
  }),

  // Delete avatar — clears avatarUrl from profile (Storage deletion happens client-side)
  deleteAvatar: protectedProcedure
    .input(z.object({ path: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Security: verify the path belongs to this user
      if (!input.path.startsWith(ctx.user.id + '/')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot delete other user avatars' });
      }
      await ctx.prisma.userProfile.update({
        where: { id: ctx.user.id },
        data: { avatarUrl: null },
      });
      return { success: true };
    }),

  // Update profile
  update: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100).optional(),
        avatarUrl: z.string().url().optional().nullable(),
        phone: z.string().regex(/^\+[1-9]\d{9,14}$/, 'Некорректный номер телефона').optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await ensureUserProfile(ctx.prisma, ctx.user);
        const profile = await ctx.prisma.userProfile.update({
          where: { id: ctx.user.id },
          data: input,
        });
        return profile;
      } catch (error) {
        handleDatabaseError(error);
      }
    }),

  // Mark a tour as completed for the current user (idempotent).
  // Stored per-user so onboarding doesn't restart on a new device.
  markTourCompleted: protectedProcedure
    .input(z.object({ page: z.enum(['dashboard', 'learn', 'lesson']) }))
    .mutation(async ({ ctx, input }) => {
      try {
        await ensureUserProfile(ctx.prisma, ctx.user);
        const profile = await ctx.prisma.userProfile.findUnique({
          where: { id: ctx.user.id },
          select: { toursCompleted: true },
        });
        const current = profile?.toursCompleted ?? [];
        if (current.includes(input.page)) {
          return { toursCompleted: current };
        }
        const updated = await ctx.prisma.userProfile.update({
          where: { id: ctx.user.id },
          data: { toursCompleted: [...current, input.page] },
          select: { toursCompleted: true },
        });
        return { toursCompleted: updated.toursCompleted };
      } catch (error) {
        handleDatabaseError(error);
      }
    }),

  // Update notification settings (mock — no Settings model in schema)
  updateSettings: protectedProcedure
    .input(
      z.object({
        emailNotifications: z.boolean().optional(),
        weeklyDigest: z.boolean().optional(),
        newLessonAlerts: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return {
        emailNotifications: input.emailNotifications ?? true,
        weeklyDigest: input.weeklyDigest ?? true,
        newLessonAlerts: input.newLessonAlerts ?? false,
      };
    }),
});
