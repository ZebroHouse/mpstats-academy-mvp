-- Per-code per-day unique-visit counter for referral/ambassador share links.
-- Additive; populated going forward by /api/internal/ref-click.
CREATE TABLE "ReferralCodeClickDay" (
    "codeId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReferralCodeClickDay_pkey" PRIMARY KEY ("codeId","day")
);

CREATE INDEX "ReferralCodeClickDay_day_idx" ON "ReferralCodeClickDay"("day");
