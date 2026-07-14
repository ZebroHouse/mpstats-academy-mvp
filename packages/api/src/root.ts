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
import { jobRouter } from './routers/job';
import { onboardingRouter } from './routers/onboarding';
import { intentRouter } from './routers/intent';
import { favoriteRouter } from './routers/favorite';
import { partnerRouter } from './routers/partner';
import { dashboardRouter } from './routers/dashboard';
import { assistantRouter } from './routers/assistant';

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
  job: jobRouter,
  onboarding: onboardingRouter,
  intent: intentRouter,
  favorite: favoriteRouter,
  partner: partnerRouter,
  dashboard: dashboardRouter,
  assistant: assistantRouter,
});

export type AppRouter = typeof appRouter;
