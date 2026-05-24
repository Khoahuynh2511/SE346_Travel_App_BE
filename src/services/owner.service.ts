import { PlaceCategory } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../database/client.js";

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
  isActive: z.boolean().optional(),
  schedule: scheduleSchema,
});

const createPlaceSchema = z.object({
  name: z.string().min(1).max(200),
  region: z.string().min(1).max(200),
  category: z.string().min(1),
  about: z.string().default(""),
  coverImageUrl: z.string().url(),
  imageUrls: z.array(z.string().url()).optional(),
  featureLabel: z.string().default("Open Now"),
  priceLevel: z.number().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  promotions: z.array(promotionBodySchema).optional(),
});

const updatePlaceSchema = createPlaceSchema.partial();

const feCategoryMap: Record<string, PlaceCategory> = {
  restaurant: PlaceCategory.DINING,
  cafe: PlaceCategory.DINING,
  hotel: PlaceCategory.ATTRACTIONS,
  attraction: PlaceCategory.ATTRACTIONS,
  attractions: PlaceCategory.ATTRACTIONS,
  dining: PlaceCategory.DINING,
  festivals: PlaceCategory.FESTIVALS,
};

function mapFeCategory(input: string): PlaceCategory {
  const key = input.trim().toLowerCase();
  return feCategoryMap[key] ?? PlaceCategory.ATTRACTIONS;
}

function toOwnerPlaceDto(p: {
  id: string;
  name: string;
  region: string;
  coverImageUrl: string;
  images: { url: string }[];
}) {
  return {
    Id: p.id,
    Name: p.name,
    Location: p.region,
    Image: p.coverImageUrl,
    Images: [p.coverImageUrl, ...p.images.map((img) => img.url)],
  };
}

function toPromotionDto(p: {
  id: string;
  title: string;
  isActive: boolean;
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

export const ownerService = {
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
    return {
      Id: place.id,
      Name: place.name,
      Location: place.region,
      Image: place.coverImageUrl,
      Images: [place.coverImageUrl, ...place.images.map((img) => img.url)],
      category: place.category,
      about: place.about,
      featureLabel: place.featureLabel,
      priceLevel: place.priceLevel,
      latitude: place.latitude,
      longitude: place.longitude,
      promotions: place.promotions.map(toPromotionDto),
    };
  },

  async createPlace(ownerId: number, body: unknown) {
    const data = createPlaceSchema.parse(body);
    const place = await prisma.place.create({
      data: {
        ownerId,
        name: data.name,
        region: data.region,
        category: mapFeCategory(data.category),
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
        ...(data.category !== undefined ? { category: mapFeCategory(data.category) } : {}),
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
        startDate: data.schedule.startDate,
        endDate: data.schedule.endDate,
        days: data.schedule.days,
        startTime: data.schedule.startTime,
        endTime: data.schedule.endTime,
        specificTime: data.schedule.specificTime,
      },
    });
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
      data: { isActive: !promo.isActive },
    });
    return toPromotionDto(updated);
  },
};
