import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const userCount = await prisma.user.count();
  const placeCount = await prisma.place.count();
  const reviewCount = await prisma.review.count();
  console.log(`users:${userCount} places:${placeCount} reviews:${reviewCount}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
