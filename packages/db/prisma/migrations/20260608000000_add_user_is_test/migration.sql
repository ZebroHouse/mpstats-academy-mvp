-- Phase 63: analytics test-user exclusion flag
ALTER TABLE "UserProfile" ADD COLUMN "isTest" BOOLEAN NOT NULL DEFAULT false;
