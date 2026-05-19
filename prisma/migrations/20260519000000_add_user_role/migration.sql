-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('TRAVELER', 'OWNER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'TRAVELER';
