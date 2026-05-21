-- Add 5 onboarding qualification columns to UserProfile (Phase 56 entry-flow redesign).
-- These store the /welcome wizard answers (marketplaces, experience, goals) and the
-- onboardingCompletedAt marker the (main)-layout guard reads to decide whether to
-- show the wizard.
-- Nullable / DEFAULT — additive, backwards-compatible, zero data-loss.
ALTER TABLE "UserProfile" ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);
ALTER TABLE "UserProfile" ADD COLUMN "marketplaces" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "UserProfile" ADD COLUMN "experienceLevel" TEXT;
ALTER TABLE "UserProfile" ADD COLUMN "goals" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "UserProfile" ADD COLUMN "goalText" TEXT;
