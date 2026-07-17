export { appRouter, type AppRouter } from './root';
export { createTRPCContext, type Context } from './trpc';
export { isFeatureEnabled } from './utils/feature-flags';
export {
  createTrialSubscription,
  ensureBaseTrial,
  BASE_TRIAL_DAYS,
} from './services/billing/trial-subscription';
export {
  resolveReferralCode,
  resolveReferralCodeRaw,
} from './services/referral/code-resolver';
export type { ResolvedReferralCode } from './services/referral/code-resolver';
export { generateAmbassadorCode } from './services/referral/code-generator';
export { fetchClientRegistry, type RegistryRange } from './services/sales-registry';
export { toRegistryCsv, type RegistryRow } from './utils/client-registry';
export {
  resolveOfferBannerState,
  type OfferBannerState,
} from './services/offer/banner-state';
