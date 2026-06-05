-- Active-user analytics: DAU/WAU/MAU (additive-only).
-- АДДИТИВНАЯ миграция — только CREATE TABLE / CREATE INDEX.
-- Ни одна существующая таблица не теряет данных. Безопасна для shared prod Supabase БД.
-- Применяется отдельно через Supabase Management API (owner-gated). НЕ через db push.
--
-- "userId" = text (matches UserProfile.id, which is String @id without @db.Uuid).
-- NO FK relation — keep standalone/additive to avoid cascade risk on shared prod DB.

CREATE TABLE IF NOT EXISTS "UserActivityDay" (
    "userId" text NOT NULL,
    "day" date NOT NULL,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "UserActivityDay_pkey" PRIMARY KEY ("userId","day")
);

CREATE INDEX IF NOT EXISTS "UserActivityDay_day_idx" ON "UserActivityDay" ("day");
