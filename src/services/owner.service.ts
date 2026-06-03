import { PlaceCategory } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../database/client.js";
import { notificationService } from "./notification.service.js";

const placeCategorySchema = z.enum([
  "ATTRACTIONS",
  "DINING",
  "FESTIVALS",
  "STAYS",
  "SHOPPING",
]);

const scheduleSchema = z.object({
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  days: z.array(z.string()),
  startTime: z.string().default(""),
  endTime: z.string().default(""),
  specificTime: z.boolean().default(false),
});

const promotionBodySchema = z.object({
  title: z.string().min(1).max(200),
  discount: z.coerce.number().nonnegative().optional(),
  isActive: z.boolean().optional(),
  schedule: scheduleSchema,
});

const createPlaceSchema = z.object({
  name: z.string().min(1).max(200),
  region: z.string().min(1).max(200),
  category: placeCategorySchema,
  about: z.string().default(""),
  coverImageUrl: z.string().url(),
  imageUrls: z.array(z.string().url()).optional(),
  featureLabel: z.string().default("Open Now"),
  priceLevel: z.number().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  promotions: z.array(promotionBodySchema).optional(),
});

const updatePlaceSchema = createPlaceSchema.partial();

type OwnerDashboardPlace = {
  id: string;
  name: string;
  coverImageUrl: string;
  averageRating: number;
  ratingCount: number;
  promotions: {
    id: string;
    title: string;
    isActive: boolean;
    activeAt: Date | null;
    createdAt: Date;
  }[];
};

function toOwnerPlaceDto(p: {
  id: string;
  name: string;
  region: string;
  category: PlaceCategory;
  averageRating: number;
  featureLabel: string;
  coverImageUrl: string;
  images: { url: string }[];
}) {
  return {
    Id: p.id,
    Name: p.name,
    Location: p.region,
    Image: p.coverImageUrl,
    Images: [p.coverImageUrl, ...p.images.map((img) => img.url)],
    Rate: p.averageRating,
    category: p.category,
    Category: p.category,
    Features: p.featureLabel,
  };
}

function toOwnerPlaceDetailDto(p: {
  id: string;
  name: string;
  region: string;
  category: PlaceCategory;
  averageRating: number;
  featureLabel: string;
  coverImageUrl: string;
  about: string;
  priceLevel: number | null;
  latitude: number | null;
  longitude: number | null;
  images: { url: string }[];
  promotions: Parameters<typeof toPromotionDto>[0][];
}) {
  return {
    ...toOwnerPlaceDto(p),
    about: p.about,
    featureLabel: p.featureLabel,
    priceLevel: p.priceLevel,
    latitude: p.latitude,
    longitude: p.longitude,
    promotions: p.promotions.map(toPromotionDto),
  };
}

function toPromotionDto(p: {
  id: string;
  title: string;
  isActive: boolean;
  activeAt: Date | null;
  startDate: string;
  endDate: string;
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
      startDate: p.startDate,
      endDate: p.endDate,
      days: p.days,
      startTime: p.startTime,
      endTime: p.endTime,
      specificTime: p.specificTime,
    },
  };
}

async function assertOwnedPlace(ownerId: number, placeId: string) {
  const place = await prisma.place.findFirst({
    where: { id: placeId, ownerId },
  });
  if (!place) throw Object.assign(new Error("PLACE_NOT_FOUND"), { statusCode: 404 });
  return place;
}

async function createPromotionsForPlace(
  placeId: string,
  items: z.infer<typeof promotionBodySchema>[]
) {
  if (!items.length) return;
  await prisma.promotion.createMany({
    data: items.map((item) => ({
      placeId,
      title: item.title,
      isActive: item.isActive ?? true,
      activeAt: (item.isActive ?? true) ? new Date() : null,
      startDate: item.schedule.startDate,
      endDate: item.schedule.endDate,
      days: item.schedule.days,
      startTime: item.schedule.startTime,
      endTime: item.schedule.endTime,
      specificTime: item.schedule.specificTime,
    })),
  });
}

function uniqueUrls(urls: string[]) {
  return Array.from(new Set(urls));
}

function getMonthWindows(now = new Date()) {
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { currentMonthStart, nextMonthStart, previousMonthStart };
}

function calculateGrowthPercent(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function countByPlaceId<T extends { placeId: string; _count: { _all: number } }>(items: T[]) {
  return new Map(items.map((item) => [item.placeId, item._count._all]));
}

function pickFeaturedActiveCampaignPlace(
  places: OwnerDashboardPlace[],
  savesByPlaceId: Map<string, number>
) {
  return places
    .flatMap((place) =>
      place.promotions
        .filter((promotion) => promotion.isActive)
        .map((promotion) => ({ place, promotion }))
    )
    .sort((a, b) => {
      const saveDelta = (savesByPlaceId.get(b.place.id) ?? 0) - (savesByPlaceId.get(a.place.id) ?? 0);
      if (saveDelta !== 0) return saveDelta;
      return b.promotion.createdAt.getTime() - a.promotion.createdAt.getTime();
    })[0]?.place;
}

export const ownerService = {
  async getDashboard(ownerId: number) {
    const places = await prisma.place.findMany({
      where: { ownerId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        coverImageUrl: true,
        averageRating: true,
        ratingCount: true,
        promotions: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            title: true,
            isActive: true,
            activeAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (places.length === 0) {
      return {
        summary: {
          placeId: "",
          placeName: "",
          saves: 0,
          growthPercent: 0,
        },
        campaigns: [],
        places: [],
      };
    }

    const placeIds = places.map((place) => place.id);
    const { currentMonthStart, nextMonthStart, previousMonthStart } = getMonthWindows();

    const [reviewTotals, favoriteTotals, currentMonthSaves, previousMonthSaves] = await Promise.all([
      prisma.review.groupBy({
        by: ["placeId"],
        where: { placeId: { in: placeIds } },
        _count: { _all: true },
      }),
      prisma.favorite.groupBy({
        by: ["placeId"],
        where: { placeId: { in: placeIds } },
        _count: { _all: true },
      }),
      prisma.favorite.groupBy({
        by: ["placeId"],
        where: {
          placeId: { in: placeIds },
          saveAt: { gte: currentMonthStart, lt: nextMonthStart },
        },
        _count: { _all: true },
      }),
      prisma.favorite.groupBy({
        by: ["placeId"],
        where: {
          placeId: { in: placeIds },
          saveAt: { gte: previousMonthStart, lt: currentMonthStart },
        },
        _count: { _all: true },
      }),
    ]);

    const commentsByPlaceId = countByPlaceId(reviewTotals);
    const savesByPlaceId = countByPlaceId(favoriteTotals);
    const currentSavesByPlaceId = countByPlaceId(currentMonthSaves);
    const previousSavesByPlaceId = countByPlaceId(previousMonthSaves);
    const featuredPlace = pickFeaturedActiveCampaignPlace(places, savesByPlaceId);

    const campaigns = await Promise.all(
      places.flatMap((place) =>
        place.promotions.map(async (promotion) => {
          const activeAt = promotion.activeAt ?? promotion.createdAt;
          const [commentsBefore, commentsAfter, savesBefore, savesAfter] = await Promise.all([
            prisma.review.count({
              where: { placeId: place.id, createdAt: { lt: activeAt } },
            }),
            prisma.review.count({
              where: { placeId: place.id, createdAt: { gte: activeAt } },
            }),
            prisma.favorite.count({
              where: { placeId: place.id, saveAt: { lt: activeAt } },
            }),
            prisma.favorite.count({
              where: { placeId: place.id, saveAt: { gte: activeAt } },
            }),
          ]);

          return {
            campaignId: promotion.id,
            campaignName: promotion.title,
            placeId: place.id,
            placeName: place.name,
            comments: { before: commentsBefore, after: commentsAfter },
            saves: { before: savesBefore, after: savesAfter },
          };
        })
      )
    );

    const summary = featuredPlace
      ? {
          placeId: featuredPlace.id,
          placeName: featuredPlace.name,
          saves: savesByPlaceId.get(featuredPlace.id) ?? 0,
          growthPercent: calculateGrowthPercent(
            currentSavesByPlaceId.get(featuredPlace.id) ?? 0,
            previousSavesByPlaceId.get(featuredPlace.id) ?? 0
          ),
        }
      : {
          placeId: "",
          placeName: "",
          saves: 0,
          growthPercent: 0,
        };

    return {
      summary,
      campaigns,
      places: places.map((place) => ({
        id: place.id,
        name: place.name,
        imageUrl: place.coverImageUrl,
        averageRating: place.averageRating,
        ratingCount: place.ratingCount,
        comments: commentsByPlaceId.get(place.id) ?? 0,
        saves: savesByPlaceId.get(place.id) ?? 0,
      })),
    };
  },

  async listPlaces(ownerId: number) {
    const list = await prisma.place.findMany({
      where: { ownerId },
      orderBy: { name: "asc" },
      include: { images: { orderBy: { createdAt: "asc" } } },
    });
    return list.map(toOwnerPlaceDto);
  },

  async getPlace(ownerId: number, placeId: string) {
    const place = await prisma.place.findFirst({
      where: { id: placeId, ownerId },
      include: {
        promotions: { orderBy: { createdAt: "desc" } },
        images: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!place) throw Object.assign(new Error("PLACE_NOT_FOUND"), { statusCode: 404 });
    return toOwnerPlaceDetailDto(place);
  },

  async createPlace(ownerId: number, body: unknown) {
    const data = createPlaceSchema.parse(body);
    const place = await prisma.place.create({
      data: {
        ownerId,
        name: data.name,
        region: data.region,
        category: data.category as PlaceCategory,
        coverImageUrl: data.coverImageUrl,
        featureLabel: data.featureLabel,
        about: data.about,
        priceLevel: data.priceLevel ?? null,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
      },
    });
    const imageUrls = uniqueUrls(data.imageUrls ?? []).filter((url) => url !== data.coverImageUrl);
    if (imageUrls.length > 0) {
      await prisma.placeImage.createMany({
        data: imageUrls.map((url) => ({ placeId: place.id, url })),
      });
    }
    if (data.promotions?.length) {
      await createPromotionsForPlace(place.id, data.promotions);
    }
    const created = await prisma.place.findUnique({
      where: { id: place.id },
      include: { images: { orderBy: { createdAt: "asc" } } },
    });
    if (!created) throw Object.assign(new Error("PLACE_NOT_FOUND"), { statusCode: 404 });
    return toOwnerPlaceDto(created);
  },

  async updatePlace(ownerId: number, placeId: string, body: unknown) {
    await assertOwnedPlace(ownerId, placeId);
    const data = updatePlaceSchema.parse(body);
    const place = await prisma.place.update({
      where: { id: placeId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.region !== undefined ? { region: data.region } : {}),
        ...(data.category !== undefined ? { category: data.category as PlaceCategory } : {}),
        ...(data.coverImageUrl !== undefined ? { coverImageUrl: data.coverImageUrl } : {}),
        ...(data.featureLabel !== undefined ? { featureLabel: data.featureLabel } : {}),
        ...(data.about !== undefined ? { about: data.about } : {}),
        ...(data.priceLevel !== undefined ? { priceLevel: data.priceLevel } : {}),
        ...(data.latitude !== undefined ? { latitude: data.latitude } : {}),
        ...(data.longitude !== undefined ? { longitude: data.longitude } : {}),
      },
    });
    if (data.imageUrls !== undefined) {
      const imageUrls = uniqueUrls(data.imageUrls).filter((url) => url !== place.coverImageUrl);
      await prisma.placeImage.deleteMany({ where: { placeId } });
      if (imageUrls.length > 0) {
        await prisma.placeImage.createMany({
          data: imageUrls.map((url) => ({ placeId, url })),
        });
      }
    }
    if (data.promotions !== undefined) {
      await prisma.promotion.deleteMany({ where: { placeId } });
      await createPromotionsForPlace(placeId, data.promotions);
    }
    const updated = await prisma.place.findUnique({
      where: { id: placeId },
      include: { images: { orderBy: { createdAt: "asc" } } },
    });
    if (!updated) throw Object.assign(new Error("PLACE_NOT_FOUND"), { statusCode: 404 });
    return toOwnerPlaceDto(updated);
  },

  async deletePlace(ownerId: number, placeId: string) {
    await assertOwnedPlace(ownerId, placeId);
    await prisma.place.delete({ where: { id: placeId } });
  },

  async listPromotions(ownerId: number, placeId: string) {
    await assertOwnedPlace(ownerId, placeId);
    const list = await prisma.promotion.findMany({
      where: { placeId },
      orderBy: { createdAt: "desc" },
    });
    return list.map(toPromotionDto);
  },

  async createPromotion(ownerId: number, placeId: string, body: unknown) {
    await assertOwnedPlace(ownerId, placeId);
    const data = promotionBodySchema.parse(body);
    const promo = await prisma.promotion.create({
      data: {
        placeId,
        title: data.title,
        isActive: data.isActive ?? true,
        activeAt: (data.isActive ?? true) ? new Date() : null,
        startDate: data.schedule.startDate,
        endDate: data.schedule.endDate,
        days: data.schedule.days,
        startTime: data.schedule.startTime,
        endTime: data.schedule.endTime,
        specificTime: data.schedule.specificTime,
      },
    });
    await createNotificationSideEffect(() =>
      notificationService.createPromotionNotification({
        ownerId,
        placeId,
        promotionId: promo.id,
        discount: data.discount ?? extractDiscount(data.title),
      })
    );
    return toPromotionDto(promo);
  },

  async updatePromotion(ownerId: number, promotionId: string, body: unknown) {
    const promo = await prisma.promotion.findUnique({
      where: { id: promotionId },
      include: { place: { select: { ownerId: true } } },
    });
    if (!promo || promo.place.ownerId !== ownerId) {
      throw Object.assign(new Error("PROMOTION_NOT_FOUND"), { statusCode: 404 });
    }
    const data = promotionBodySchema.partial().extend({
      isActive: z.boolean().optional(),
    }).parse(body);

    const updated = await prisma.promotion.update({
      where: { id: promotionId },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.isActive === true && (!promo.isActive || promo.activeAt === null)
          ? { activeAt: new Date() }
          : {}),
        ...(data.isActive === false ? { activeAt: null } : {}),
        ...(data.schedule?.startDate !== undefined ? { startDate: data.schedule.startDate } : {}),
        ...(data.schedule?.endDate !== undefined ? { endDate: data.schedule.endDate } : {}),
        ...(data.schedule?.days !== undefined ? { days: data.schedule.days } : {}),
        ...(data.schedule?.startTime !== undefined ? { startTime: data.schedule.startTime } : {}),
        ...(data.schedule?.endTime !== undefined ? { endTime: data.schedule.endTime } : {}),
        ...(data.schedule?.specificTime !== undefined
          ? { specificTime: data.schedule.specificTime }
          : {}),
      },
    });
    return toPromotionDto(updated);
  },

  async deletePromotion(ownerId: number, promotionId: string) {
    const promo = await prisma.promotion.findUnique({
      where: { id: promotionId },
      include: { place: { select: { ownerId: true } } },
    });
    if (!promo || promo.place.ownerId !== ownerId) {
      throw Object.assign(new Error("PROMOTION_NOT_FOUND"), { statusCode: 404 });
    }
    await prisma.promotion.delete({ where: { id: promotionId } });
  },

  async togglePromotion(ownerId: number, promotionId: string) {
    const promo = await prisma.promotion.findUnique({
      where: { id: promotionId },
      include: { place: { select: { ownerId: true } } },
    });
    if (!promo || promo.place.ownerId !== ownerId) {
      throw Object.assign(new Error("PROMOTION_NOT_FOUND"), { statusCode: 404 });
    }
    const updated = await prisma.promotion.update({
      where: { id: promotionId },
      data: {
        isActive: !promo.isActive,
        activeAt: promo.isActive ? null : new Date(),
      },
    });
    return toPromotionDto(updated);
  },
};

function extractDiscount(title: string) {
  const match = title.match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

async function createNotificationSideEffect<T>(factory: () => Promise<T>) {
  try {
    return await factory();
  } catch {
    return null;
  }
}
