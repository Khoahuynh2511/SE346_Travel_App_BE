import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  await prisma.promotion.deleteMany();
  await prisma.reviewLike.deleteMany();
  await prisma.reviewImage.deleteMany();
  await prisma.review.deleteMany();
  await prisma.favorite.deleteMany();
  await prisma.place.deleteMany();
  await prisma.user.deleteMany();

  const demoHash = await bcrypt.hash("demo1234", 10);
  const user = await prisma.user.create({
    data: {
      email: "demo@example.com",
      passwordHash: demoHash,
      role: "TRAVELER",
      fullName: "Alex Johnson",
      username: "Alex_love_travel",
      location: "VietNam",
      avatarUrl:
        "https://th.bing.com/th/id/OIP.iY6OLSZImubhw9Yiwg6OuAHaHa?w=186&h=186&c=7&r=0&o=7&dpr=1.3&pid=1.7&rm=3",
    },
  });

  const owner = await prisma.user.create({
    data: {
      email: "owner@example.com",
      passwordHash: demoHash,
      role: "OWNER",
      fullName: "Owner Demo",
      username: "owner_demo",
      location: "VietNam",
    },
  });

  const p1 = await prisma.place.create({
    data: {
      ownerId: owner.id,
      name: "Gion District",
      region: "Kyoto, Japan",
      category: "ATTRACTIONS",
      coverImageUrl:
        "https://i.pinimg.com/1200x/28/31/da/2831da0f8a4b18fde25867ef90e66207.jpg",
      featureLabel: "Quiet Now",
      averageRating: 4.9,
      ratingCount: 850,
      priceLevel: 65.3,
      about:
        "Experience the perfect tropical escape at Blue Lagoon Resort. Surrounded by lush jungles and crystal-clear waters.",
    },
  });

  const r1 = await prisma.review.create({
    data: {
      placeId: p1.id,
      userId: user.id,
      rating: 4,
      content:
        "Walking through Gion at dusk was magical. The lanterns began to glow and the atmosphere was simply fresh.",
    },
  });

  await prisma.reviewImage.createMany({
    data: [
      {
        reviewId: r1.id,
        url: "https://i.pinimg.com/736x/72/41/dd/7241ddb23e868c19ec43a701104132f6.jpg",
      },
      {
        reviewId: r1.id,
        url: "https://i.pinimg.com/736x/97/24/45/97244547fc44fbc06968e4c72d2efdfc.jpg",
      },
    ],
  });

  const p2 = await prisma.place.create({
    data: {
      ownerId: owner.id,
      name: "Happy Restaurant",
      region: "Tokyo, Japan",
      category: "DINING",
      coverImageUrl:
        "https://i.pinimg.com/1200x/f1/9c/a0/f19ca09250c88864491e7cacecd1eb40.jpg",
      featureLabel: "Open Now",
      averageRating: 4.7,
      ratingCount: 120,
      priceLevel: 40,
      about: "Local dining experience in Tokyo.",
    },
  });

  await prisma.promotion.createMany({
    data: [
      {
        placeId: p1.id,
        title: "20% Off Lunch Menu",
        isActive: true,
        startDate: "Oct 10, 2024",
        endDate: "Oct 30, 2024",
        days: ["M", "T", "W", "T", "F"],
        startTime: "11:00 AM",
        endTime: "01:00 PM",
        specificTime: true,
      },
      {
        placeId: p2.id,
        title: "Happy Hour 1-for-1",
        isActive: false,
        startDate: "Oct 10, 2024",
        endDate: "Oct 30, 2024",
        days: ["Sa", "S"],
        startTime: "05:00 PM",
        endTime: "08:00 PM",
        specificTime: true,
      },
    ],
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
