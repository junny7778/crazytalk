ALTER TABLE "ClassInJob" ADD COLUMN "operationId" TEXT, ADD COLUMN "retryAt" TIMESTAMP(3);
CREATE INDEX "ClassInJob_operationId_idx" ON "ClassInJob"("operationId");
