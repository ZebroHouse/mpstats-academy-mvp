-- Phase 60: ambassador referral codes (additive-only).
-- АДДИТИВНАЯ миграция — только ADD VALUE / CREATE TABLE / CREATE INDEX / ADD COLUMN / ADD CONSTRAINT.
-- Ни одна существующая таблица не теряет данных. Безопасна для shared prod Supabase БД.
-- Применяется в Plan 60-04 deploy task с owner-gated шагом.

-- 1) Add AMBASSADOR to ReferralCodeType enum (must run outside transaction; Prisma migrate handles)
ALTER TYPE "ReferralCodeType" ADD VALUE 'AMBASSADOR';

-- 2) Create ReferralCode table (Phase 60 D-07 schema)
CREATE TABLE "ReferralCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "codeType" "ReferralCodeType" NOT NULL,
    "label" TEXT NOT NULL,
    "refereeTrialDays" INTEGER NOT NULL,
    "maxUses" INTEGER,
    "currentUses" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReferralCode_pkey" PRIMARY KEY ("id")
);

-- 3) Unique index on code
CREATE UNIQUE INDEX "ReferralCode_code_key" ON "ReferralCode"("code");

-- 4) Index for active-and-not-expired lookups
CREATE INDEX "ReferralCode_isActive_expiresAt_idx" ON "ReferralCode"("isActive", "expiresAt");

-- 5) FK ReferralCode.createdByUserId → UserProfile.id (Restrict — нельзя удалить юзера, создавшего код)
ALTER TABLE "ReferralCode" ADD CONSTRAINT "ReferralCode_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6) Add Referral.codeId nullable column (existing rows get NULL — non-destructive)
ALTER TABLE "Referral" ADD COLUMN "codeId" TEXT;

-- 7) Index for Referral.codeId
CREATE INDEX "Referral_codeId_idx" ON "Referral"("codeId");

-- 8) FK Referral.codeId → ReferralCode.id (SetNull — если код удалён, реферал сохраняется)
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_codeId_fkey"
    FOREIGN KEY ("codeId") REFERENCES "ReferralCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
