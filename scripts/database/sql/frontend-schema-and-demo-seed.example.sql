-- =============================================================================
-- Full setup: PostgreSQL schema (same shape as prisma/schema.prisma) + demo data.
-- Intended for EMPTY database or Supabase SQL Editor on a NEW project bucket.
--
-- Prefer on real projects: npx prisma db push && npm run db:seed
-- Use THIS file only if you must run DDL/seed purely in SQL.
--
-- After run: POST /auth/login demo@example.com / demo1234
-- Place IDs fixed below match JSON comments for mobile testing.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS "public";

CREATE TYPE "PlaceCategory" AS ENUM ('ATTRACTIONS', 'DINING', 'FESTIVALS');

CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT,
    "username" TEXT,
    "location" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Place" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "category" "PlaceCategory" NOT NULL,
    "coverImageUrl" TEXT NOT NULL,
    "featureLabel" TEXT NOT NULL,
    "averageRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "about" TEXT NOT NULL DEFAULT '',
    "priceLevel" DOUBLE PRECISION,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,

    CONSTRAINT "Place_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReviewImage" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "url" TEXT NOT NULL,

    CONSTRAINT "ReviewImage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReviewLike" (
    "id" SERIAL NOT NULL,
    "reviewId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "ReviewLike_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Favorite" (
    "userId" INTEGER NOT NULL,
    "placeId" TEXT NOT NULL,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("userId","placeId")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "ReviewLike_reviewId_userId_key" ON "ReviewLike"("reviewId", "userId");

ALTER TABLE "Review" ADD CONSTRAINT "Review_placeId_fkey"
  FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewImage" ADD CONSTRAINT "ReviewImage_reviewId_fkey"
  FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewLike" ADD CONSTRAINT "ReviewLike_reviewId_fkey"
  FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewLike" ADD CONSTRAINT "ReviewLike_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_placeId_fkey"
  FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- bcryptjs cost 10, plain password: demo1234
INSERT INTO "User" ("email", "passwordHash", "fullName", "username", "location", "avatarUrl") VALUES (
  'demo@example.com',
  '$2b$10$bUbfUhOA7LBVZe0riQuoyuL0Dl7VQeixMT1oRFrodqrxkM1p21SYq',
  'Alex Johnson',
  'Alex_love_travel',
  'VietNam',
  'https://th.bing.com/th/id/OIP.iY6OLSZImubhw9Yiwg6OuAHaHa?w=186&h=186&c=7&r=0&o=7&dpr=1.3&pid=1.7&rm=3'
);

INSERT INTO "Place"
  ("id", "name", "region", "category", "coverImageUrl", "featureLabel", "averageRating", "ratingCount", "about", "priceLevel")
VALUES
(
  'fe_place_gion_001',
  'Gion District',
  'Kyoto, Japan',
  'ATTRACTIONS'::"PlaceCategory",
  'https://i.pinimg.com/1200x/28/31/da/2831da0f8a4b18fde25867ef90e66207.jpg',
  'Quiet Now',
  4.9,
  850,
  'Experience the perfect tropical escape at Blue Lagoon Resort. Surrounded by lush jungles and crystal-clear waters.',
  65.3
),
(
  'fe_place_dining_happy',
  'Happy Restaurant',
  'Tokyo, Japan',
  'DINING'::"PlaceCategory",
  'https://i.pinimg.com/1200x/f1/9c/a0/f19ca09250c88864491e7cacecd1eb40.jpg',
  'Open Now',
  4.7,
  120,
  'Local dining experience in Tokyo.',
  40
),
(
  'fe_place_festival_lane',
  'Tokyo Lantern Walk',
  'Tokyo, Japan',
  'FESTIVALS'::"PlaceCategory",
  'https://i.pinimg.com/1200x/f1/9c/a0/f19ca09250c88864491e7cacecd1eb40.jpg',
  'This weekend',
  4.8,
  340,
  'Evening lanterns and street food stalls along the riverside.',
  35
);

INSERT INTO "Review" ("id", "placeId", "userId", "rating", "content")
SELECT
  'fe_review_gion_first',
  'fe_place_gion_001',
  u.id,
  4,
  'Walking through Gion at dusk was magical. The lanterns began to glow and the atmosphere was simply fresh.'
FROM "User" u WHERE u."email" = 'demo@example.com';

INSERT INTO "ReviewImage" ("id", "reviewId", "url") VALUES
('fe_rimg_a', 'fe_review_gion_first', 'https://i.pinimg.com/736x/72/41/dd/7241ddb23e868c19ec43a701104132f6.jpg'),
('fe_rimg_b', 'fe_review_gion_first', 'https://i.pinimg.com/736x/97/24/45/97244547fc44fbc06968e4c72d2efdfc.jpg');

SELECT setval(pg_get_serial_sequence('"User"', 'id'), (SELECT COALESCE(MAX("id"), 1) FROM "User"));
SELECT setval(pg_get_serial_sequence('"ReviewLike"', 'id'), (SELECT COALESCE(MAX("id"), 1) FROM "ReviewLike"));
