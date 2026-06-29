-- Storefront backbone: editorial badges (START/NEW/HOT/QUICK) on lessons and jobs.
-- Additive only — existing rows default to an empty array. Powers /dashboard shelves
-- + the knowledge-base tag filter. Applied to prod Supabase via Management API.
ALTER TABLE "Lesson" ADD COLUMN IF NOT EXISTS "badges" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "badges" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
