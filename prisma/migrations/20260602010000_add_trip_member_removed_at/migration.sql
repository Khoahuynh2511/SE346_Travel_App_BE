-- Add removed timestamp separately for databases that already applied the invitation status migration.
ALTER TABLE "TripMember"
  ADD COLUMN IF NOT EXISTS "removedAt" TIMESTAMP(3);
