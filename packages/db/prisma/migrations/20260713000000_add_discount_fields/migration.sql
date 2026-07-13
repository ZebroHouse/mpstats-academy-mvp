-- Discount fields for promo + ambassador codes: a DiscountType enum plus nullable
-- discount columns on PromoCode/ReferralCode and a discountConsumedAt stamp on Referral.
-- Additive only — existing rows keep NULL (no discount). Applied to prod Supabase via
-- the Management API. Idempotent: guarded enum create + ADD COLUMN IF NOT EXISTS.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DiscountType') THEN
    CREATE TYPE "DiscountType" AS ENUM ('PERCENT', 'FIXED');
  END IF;
END $$;
ALTER TABLE "PromoCode" ADD COLUMN IF NOT EXISTS "discountType" "DiscountType", ADD COLUMN IF NOT EXISTS "discountValue" INTEGER;
ALTER TABLE "ReferralCode" ADD COLUMN IF NOT EXISTS "discountType" "DiscountType", ADD COLUMN IF NOT EXISTS "discountValue" INTEGER;
ALTER TABLE "Referral" ADD COLUMN IF NOT EXISTS "discountConsumedAt" TIMESTAMP(3);
