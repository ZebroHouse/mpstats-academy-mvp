-- Library redesign (Phase 57): Job + JobLesson.
-- АДДИТИВНАЯ миграция — только CREATE, ни одной существующей таблицы не трогает.
-- Безопасна для shared prod Supabase БД.

CREATE TYPE "JobMarketplace" AS ENUM ('WB', 'OZON', 'BOTH');

CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "outcomes" JSONB NOT NULL DEFAULT '[]',
    "axes" JSONB NOT NULL DEFAULT '[]',
    "skillBlocks" JSONB NOT NULL DEFAULT '[]',
    "marketplace" "JobMarketplace" NOT NULL DEFAULT 'WB',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Job_slug_key" ON "Job"("slug");
CREATE INDEX "Job_isPublished_idx" ON "Job"("isPublished");

CREATE TABLE "JobLesson" (
    "jobId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    CONSTRAINT "JobLesson_pkey" PRIMARY KEY ("jobId", "lessonId")
);

CREATE INDEX "JobLesson_lessonId_idx" ON "JobLesson"("lessonId");

ALTER TABLE "JobLesson" ADD CONSTRAINT "JobLesson_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobLesson" ADD CONSTRAINT "JobLesson_lessonId_fkey"
    FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
