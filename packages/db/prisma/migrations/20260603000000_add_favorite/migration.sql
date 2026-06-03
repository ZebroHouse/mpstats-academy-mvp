-- Phase 61 (Обучение 2.0), D-06/D-07: polymorphic Favorite model (additive-only).
-- АДДИТИВНАЯ миграция — только CREATE TYPE / CREATE TABLE / CREATE INDEX / ADD CONSTRAINT.
-- Ни одна существующая таблица не теряет данных. Безопасна для shared prod Supabase БД.
-- Применяется в Plan 61-06 deploy task (owner-gated, через Supabase Management API).

-- 1) New enum (CREATE TYPE — НЕ ALTER TYPE ADD VALUE, т.к. enum новый)
CREATE TYPE "FavoriteItemType" AS ENUM ('LESSON', 'JOB', 'MATERIAL');

-- 2) Create Favorite table (D-06 schema)
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemType" "FavoriteItemType" NOT NULL,
    "itemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- 3) Unique index — идемпотентность add (@@unique([userId,itemType,itemId]))
CREATE UNIQUE INDEX "Favorite_userId_itemType_itemId_key" ON "Favorite"("userId", "itemType", "itemId");

-- 4) Index for per-user, per-type list queries
CREATE INDEX "Favorite_userId_itemType_idx" ON "Favorite"("userId", "itemType");

-- 5) FK Favorite.userId → UserProfile.id (Cascade — избранное удаляется вместе с юзером)
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
