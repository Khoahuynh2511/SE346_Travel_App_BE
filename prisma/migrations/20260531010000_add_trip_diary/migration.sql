CREATE TABLE "TripDiaryEntry" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "locationName" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripDiaryEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TripDiaryImage" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripDiaryImage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TripDiaryEntry_tripId_idx" ON "TripDiaryEntry"("tripId");
CREATE INDEX "TripDiaryEntry_userId_idx" ON "TripDiaryEntry"("userId");
CREATE INDEX "TripDiaryEntry_occurredAt_idx" ON "TripDiaryEntry"("occurredAt");
CREATE INDEX "TripDiaryImage_entryId_idx" ON "TripDiaryImage"("entryId");

ALTER TABLE "TripDiaryEntry" ADD CONSTRAINT "TripDiaryEntry_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripDiaryEntry" ADD CONSTRAINT "TripDiaryEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripDiaryImage" ADD CONSTRAINT "TripDiaryImage_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "TripDiaryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
