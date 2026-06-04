-- CreateEnum
CREATE TYPE "PlaceStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'place_approved';
ALTER TYPE "NotificationType" ADD VALUE 'place_rejected';

-- AlterTable: add approval fields to Place
ALTER TABLE "Place" ADD COLUMN "status" "PlaceStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Place" ADD COLUMN "rejectionReason" TEXT;
ALTER TABLE "Place" ADD COLUMN "reviewedAt" TIMESTAMP(3);
ALTER TABLE "Place" ADD COLUMN "reviewedBy" INTEGER;

-- Set existing places to APPROVED so they remain publicly visible
UPDATE "Place" SET "status" = 'APPROVED';

-- AddForeignKey
ALTER TABLE "Place" ADD CONSTRAINT "Place_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Place_status_idx" ON "Place"("status");
