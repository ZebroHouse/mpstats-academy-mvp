-- AlterTable
ALTER TABLE "Course" ADD COLUMN "partnerKey" TEXT;

-- CreateIndex
CREATE INDEX "Course_partnerKey_idx" ON "Course"("partnerKey");
