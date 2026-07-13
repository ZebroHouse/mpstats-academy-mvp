-- Make PromoCode.planType nullable: for discount codes, NULL means "applies to any
-- plan type". Duration codes still set planType. Applied to prod Supabase via the
-- Management API. Idempotent: dropping NOT NULL on an already-nullable column is a no-op.
ALTER TABLE "PromoCode" ALTER COLUMN "planType" DROP NOT NULL;
