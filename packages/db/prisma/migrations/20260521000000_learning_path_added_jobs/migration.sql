-- Phase 57 polish: LearningPath.addedJobs — list of job slugs the user added to their track.
-- ADDITIVE: single ADD COLUMN, default '[]', no rewrite of existing rows.

ALTER TABLE "LearningPath" ADD COLUMN "addedJobs" JSONB NOT NULL DEFAULT '[]';
