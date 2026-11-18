-- AlterTable
ALTER TABLE "AppliedCommand" ADD COLUMN     "undo" JSONB;

-- CreateTable
CREATE TABLE "ClassInJob" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassInJob_pkey" PRIMARY KEY ("id")
);
