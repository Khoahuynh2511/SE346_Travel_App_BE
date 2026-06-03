-- AlterTable
ALTER TABLE "Promotion" ADD COLUMN "activeAt" TIMESTAMP(3);

-- Backfill existing active promotions so active rows always have an activation timestamp.
UPDATE "Promotion"
SET "activeAt" = "createdAt"
WHERE "isActive" = true AND "activeAt" IS NULL;
