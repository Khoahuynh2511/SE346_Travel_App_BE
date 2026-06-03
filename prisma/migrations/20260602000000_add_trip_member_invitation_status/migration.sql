-- CreateEnum
CREATE TYPE "TripMemberStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'LEFT', 'REMOVED');

-- AlterTable
ALTER TABLE "TripMember"
  ADD COLUMN "invitedById" INTEGER,
  ADD COLUMN "status" "TripMemberStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "joinedAt" TIMESTAMP(3),
  ADD COLUMN "leftAt" TIMESTAMP(3),
  ADD COLUMN "inviteAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "inviteRejectedAt" TIMESTAMP(3),
  ADD COLUMN "removedAt" TIMESTAMP(3);

-- Existing TripMember rows represented official collaborators before invitations existed.
UPDATE "TripMember"
SET "status" = 'ACTIVE',
    "joinedAt" = COALESCE("joinedAt", "createdAt"),
    "inviteAcceptedAt" = COALESCE("inviteAcceptedAt", "createdAt");

-- CreateIndex
CREATE INDEX "TripMember_invitedById_idx" ON "TripMember"("invitedById");

-- CreateIndex
CREATE INDEX "TripMember_status_idx" ON "TripMember"("status");

-- AddForeignKey
ALTER TABLE "TripMember" ADD CONSTRAINT "TripMember_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
