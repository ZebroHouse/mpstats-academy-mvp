-- Ambassador codes: per-code share-link landing target (HOME / REGISTER).
-- Additive, default REGISTER preserves existing copy-link behaviour.
ALTER TABLE "ReferralCode" ADD COLUMN "landingTarget" TEXT NOT NULL DEFAULT 'REGISTER';
