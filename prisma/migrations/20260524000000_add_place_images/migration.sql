-- CreateTable
CREATE TABLE "PlaceImage" (
	"id" TEXT NOT NULL,
	"placeId" TEXT NOT NULL,
	"url" TEXT NOT NULL,
	"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

	CONSTRAINT "PlaceImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlaceImage_placeId_idx" ON "PlaceImage"("placeId");

-- AddForeignKey
ALTER TABLE "PlaceImage" ADD CONSTRAINT "PlaceImage_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;
