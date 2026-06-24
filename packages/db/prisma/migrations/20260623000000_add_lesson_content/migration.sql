-- Additive: new enums + nullable/defaulted columns. No data loss.
CREATE TYPE "LessonContentType" AS ENUM ('VIDEO', 'TEXT', 'INTERACTIVE');
CREATE TYPE "LessonContentStatus" AS ENUM ('DRAFT', 'PUBLISHED');

ALTER TABLE "Lesson"
  ADD COLUMN "contentType" "LessonContentType" NOT NULL DEFAULT 'VIDEO',
  ADD COLUMN "contentStatus" "LessonContentStatus" NOT NULL DEFAULT 'PUBLISHED',
  ADD COLUMN "body" JSONB;
