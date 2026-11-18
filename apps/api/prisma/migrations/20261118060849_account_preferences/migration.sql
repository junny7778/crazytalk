-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "preferences" JSONB NOT NULL DEFAULT '{}';
