-- Подневный снапшот Яндекс.Метрики для продуктовой воронки в админке.
-- Additive; наполняется кроном /api/cron/metrika-snapshot.
-- windowDays=1 — подневные аддитивные метрики; windowDays=7|14|30|90 —
-- дедуплицированные уники за окно (users не суммируются по дням).
CREATE TABLE "MetrikaSnapshot" (
    "metricKey" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "windowDays" INTEGER NOT NULL DEFAULT 1,
    "value" INTEGER NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MetrikaSnapshot_pkey" PRIMARY KEY ("metricKey","day","windowDays")
);

CREATE INDEX "MetrikaSnapshot_day_idx" ON "MetrikaSnapshot"("day");

CREATE INDEX "MetrikaSnapshot_windowDays_day_idx" ON "MetrikaSnapshot"("windowDays","day");
