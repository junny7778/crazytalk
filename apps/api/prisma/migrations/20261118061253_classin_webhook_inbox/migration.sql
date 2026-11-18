-- CreateTable
CREATE TABLE "ClassInWebhook" (
    "id" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "ClassInWebhook_pkey" PRIMARY KEY ("id")
);
