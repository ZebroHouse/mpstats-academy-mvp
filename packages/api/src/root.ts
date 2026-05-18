import { router } from './trpc';
import { profileRouter } from './routers/profile';
import { diagnosticRouter } from './routers/diagnostic';
import { learningRouter } from './routers/learning';
import { aiRouter } from './routers/ai';
import { adminRouter } from './routers/admin';
import { billingRouter } from './routers/billing';
import { commentsRouter } from './routers/comments';
import { promoRouter } from './routers/promo';
import { materialRouter } from './routers/material';
import { notificationsRouter } from './routers/notifications';
import { referralRouter } from './routers/referral';
import { onboardingRouter } from './routers/onboarding';

export const appRouter = router({
  profile: profileRouter,
  diagnostic: diagnosticRouter,
  learning: learningRouter,
  ai: aiRouter,
  admin: adminRouter,
  billing: billingRouter,
  comments: commentsRouter,
  promo: promoRouter,
  material: materialRouter,
  notifications: notificationsRouter,
  referral: referralRouter,
  onboarding: onboardingRouter,
});

export type AppRouter = typeof appRouter;
