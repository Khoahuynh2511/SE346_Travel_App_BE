-- AlterTable: add optimization fields to Place
ALTER TABLE "Place" ADD COLUMN "estimatedVisitDuration" INTEGER;
ALTER TABLE "Place" ADD COLUMN "recommendedTimeOfDay" TEXT;
