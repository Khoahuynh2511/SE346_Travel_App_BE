-- CreateEnum
CREATE TYPE "TripActivityPeriod" AS ENUM ('MORNING', 'AFTERNOON', 'EVENING', 'NIGHT');

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "destination" TEXT,
    "currentHotelName" TEXT,
    "currentHotelPlaceId" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "totalBudgetPerPerson" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripMember" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "userId" INTEGER,
    "name" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripDay" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "title" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "estimatedBudget" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isExpanded" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TripDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripActivity" (
    "id" TEXT NOT NULL,
    "tripDayId" TEXT NOT NULL,
    "placeId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "period" "TripActivityPeriod" NOT NULL,
    "scheduledTime" TEXT,
    "estimatedCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rating" DOUBLE PRECISION,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Trip_userId_idx" ON "Trip"("userId");

-- CreateIndex
CREATE INDEX "Trip_currentHotelPlaceId_idx" ON "Trip"("currentHotelPlaceId");

-- CreateIndex
CREATE UNIQUE INDEX "TripMember_tripId_userId_key" ON "TripMember"("tripId", "userId");

-- CreateIndex
CREATE INDEX "TripMember_tripId_idx" ON "TripMember"("tripId");

-- CreateIndex
CREATE INDEX "TripMember_userId_idx" ON "TripMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TripDay_tripId_dayNumber_key" ON "TripDay"("tripId", "dayNumber");

-- CreateIndex
CREATE INDEX "TripDay_tripId_idx" ON "TripDay"("tripId");

-- CreateIndex
CREATE INDEX "TripActivity_tripDayId_idx" ON "TripActivity"("tripDayId");

-- CreateIndex
CREATE INDEX "TripActivity_placeId_idx" ON "TripActivity"("placeId");

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_currentHotelPlaceId_fkey" FOREIGN KEY ("currentHotelPlaceId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripMember" ADD CONSTRAINT "TripMember_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripMember" ADD CONSTRAINT "TripMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripDay" ADD CONSTRAINT "TripDay_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripActivity" ADD CONSTRAINT "TripActivity_tripDayId_fkey" FOREIGN KEY ("tripDayId") REFERENCES "TripDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripActivity" ADD CONSTRAINT "TripActivity_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;
