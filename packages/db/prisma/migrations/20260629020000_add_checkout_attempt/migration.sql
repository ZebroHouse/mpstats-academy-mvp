-- Sales client registry: log of payment-widget reach (CloudPayments `check`).
-- Additive; decoupled from Payment. Populated going forward by the CP webhook.
CREATE TABLE "CheckoutAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "subscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CheckoutAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CheckoutAttempt_userId_idx" ON "CheckoutAttempt"("userId");
CREATE INDEX "CheckoutAttempt_createdAt_idx" ON "CheckoutAttempt"("createdAt");
