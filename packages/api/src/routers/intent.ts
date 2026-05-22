/**
 * Intent Resolution Router — Track B job recommendation engine
 *
 * Endpoints:
 * - resolve: Orchestrate intent → job recommendations via RAG + synthesis
 */

import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { resolveIntent } from '@mpstats/ai';

export const intentRouter = router({
  resolve: protectedProcedure
    .input(z.object({
      query: z.string().min(1).max(500),
      surface: z.enum(['learn', 'welcome', 'diagnostic']),
      conversationState: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return resolveIntent({
        query: input.query.trim(),
        surface: input.surface,
        conversationState: input.conversationState,
      });
    }),
});
