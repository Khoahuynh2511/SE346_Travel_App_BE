ALTER TABLE "Trip" ADD COLUMN "budget" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Trip" ADD COLUMN "coverImageUrl" TEXT;

UPDATE "Trip"
SET "budget" = "totalBudgetPerPerson"
WHERE "budget" = 0;