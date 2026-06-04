import { PlaceCategory } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../database/client.js";
import type { Pagination } from "../http/pagination.js";
import { notDeleted } from "../utils/softDelete.js";

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
  promotions?: { id: string }[];
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
    hasActivePromotion: Array.isArray(p.promotions) && p.promotions.length > 0,
  };
}

function toPromotionDto(p: {
  id: string;
  title: string;
  isActive: boolean;
  activeAt: Date | null;
  startDate: Date;
  endDate: Date;
  days: string[];
  startTime: string;
  endTime: string;
  specificTime: boolean;
}) {
  return {
    id: p.id,
    title: p.title,
    isActive: p.isActive,
    activeAt: p.activeAt?.toISOString() ?? null,
    schedule: {
      startDate: p.startDate.toISOString(),
      endDate: p.endDate.toISOString(),
      days: p.days,
      startTime: p.startTime,
      endTime: p.endTime,
      specificTime: p.specificTime,
    },
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
    const search = query.search;
    const region = query.region;
    const minRating = query.minRating ? parseFloat(query.minRating) : undefined;
    const maxPrice = query.maxPrice ? parseFloat(query.maxPrice) : undefined;

    const where: Record<string, unknown> = { status: "APPROVED", ...notDeleted };

    if (category) where.category = category;

    // Text search on name, region, about (case-insensitive)
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { region: { contains: search, mode: "insensitive" } },
        { about: { contains: search, mode: "insensitive" } },
      ];
    }

    // Region filter (case-insensitive contains)
    if (region) {
      if (where.OR) {
        // If we already have OR from search, we need to combine properly
        // In this case, add region as a separate condition with AND
        where.AND = [
          { OR: where.OR },
          { region: { contains: region, mode: "insensitive" } },
        ];
        delete where.OR;
      } else {
        where.region = { contains: region, mode: "insensitive" };
      }
    }

    // Rating filter (minimum rating)
    if (minRating && !isNaN(minRating)) {
      where.averageRating = { gte: minRating };
    }

    // Price filter (maximum price level)
    if (maxPrice && !isNaN(maxPrice)) {
      where.priceLevel = { lte: maxPrice };
    }

    const [total, list] = await Promise.all([
      prisma.place.count({ where }),
      prisma.place.findMany({
        where,
        orderBy: { ratingCount: "desc" },
        include: {
          images: { orderBy: { createdAt: "asc" } },
          promotions: {
            where: { isActive: true, ...notDeleted },
            select: { id: true },
            take: 1,
          },
        },
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
    const place = await prisma.place.findFirst({
      where: { id: placeId, ...notDeleted },
      include: {
        images: { orderBy: { createdAt: "asc" } },
        promotions: {
          where: { isActive: true, ...notDeleted },
          orderBy: { createdAt: "desc" },
        },
        reviews: {
          where: notDeleted,
          include: {
            user: { select: { fullName: true, username: true, avatarUrl: true } },
            images: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!place) return null;

    // Only show APPROVED places to the public
    if ((place as any).status !== "APPROVED") return null;

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
      promotions: place.promotions.map(toPromotionDto),
      Promotions: place.promotions.map(toPromotionDto),
      Reviews: reviews,
    };
  },

  async listPromotions(placeId: string) {
    const place = await prisma.place.findFirst({
      where: { id: placeId, ...notDeleted },
      select: { id: true },
    });
    if (!place) return null;

    const promotions = await prisma.promotion.findMany({
      where: { placeId, isActive: true, ...notDeleted },
      orderBy: { createdAt: "desc" },
    });

    return promotions.map(toPromotionDto);
  },
};
