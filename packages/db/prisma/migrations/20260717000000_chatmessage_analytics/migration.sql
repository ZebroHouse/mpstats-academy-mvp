-- Additive: quality columns + createdAt index on the dormant (empty) ChatMessage.
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "model" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "sourceCount" INTEGER;
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "noAnswer" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "ChatMessage_createdAt_idx" ON "ChatMessage"("createdAt");
