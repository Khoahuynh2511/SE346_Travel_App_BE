import { PlaceCategory } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../database/client.js";
import type { Pagination } from "../http/pagination.js";

const placeCategorySchema = z.enum([
  "ATTRACTIONS",
  "DINING",
  "FESTIVALS",
  "STAYS",
  "SHOPPING",
]);

function toListDto(p: {
  id: string;
  name: string;
  region: string;
  averageRating: number;
  ratingCount: number;
  featureLabel: string;
  coverImageUrl: string;
  category: PlaceCategory;
  priceLevel: number | null;
  images: { url: string }[];
}) {
  return {
    Id: p.id,
    Name: p.name,
    Located: p.region,
    Rate: p.averageRating,
    NumberOfRate: p.ratingCount,
    Features: p.featureLabel,
    category: p.category,
    Category: p.category,
    priceLevel: p.priceLevel,
    image: p.coverImageUrl,
    images: [p.coverImageUrl, ...p.images.map((img) => img.url)],
  };
}

function formatReviewDate(d: Date) {
  return d.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export const placesService = {
  async list(query: Record<string, string | undefined>, paging: Pagination) {
    const category = query.category
      ? (placeCategorySchema.parse(query.category) as PlaceCategory)
      : undefined;
    const where = category ? { category } : {};
    const [total, list] = await Promise.all([
      prisma.place.count({ where }),
      prisma.place.findMany({
        where,
        orderBy: { ratingCount: "desc" },
        include: { images: { orderBy: { createdAt: "asc" } } },
        skip: paging.offset,
        take: paging.limit,
      }),
    ]);
    return {
      items: list.map(toListDto),
      total,
      limit: paging.limit,
      offset: paging.offset,
    };
  },

  async getById(placeId: string) {
    const place = await prisma.place.findUnique({
      where: { id: placeId },
      include: {
        images: { orderBy: { createdAt: "asc" } },
        reviews: {
          include: {
            user: { select: { fullName: true, username: true, avatarUrl: true } },
            images: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!place) return null;

    const reviews = place.reviews.map((r) => {
      const displayName = r.user.fullName || r.user.username || "Traveler";
      return {
        userId: r.userId,
        ava:
          r.user.avatarUrl ??
          `https://i.pravatar.cc/150?u=${encodeURIComponent(displayName)}`,
        Name: displayName,
        Date: formatReviewDate(r.createdAt),
        Content: r.content,
        Rate: r.rating,
        Pictures: r.images.map((img) => img.url),
      };
    });

    return {
      Id: place.id,
      Name: place.name,
      Location: place.region,
      Rate: place.averageRating,
      NumberOfRate: place.ratingCount,
      Image: place.coverImageUrl,
      Images: [place.coverImageUrl, ...place.images.map((img) => img.url)],
      Features: place.featureLabel,
      category: place.category,
      Category: place.category,
      about: place.about,
      priceLevel: place.priceLevel,
      Reviews: reviews,
    };
  },
};
