import { PlaceCategory } from "@prisma/client";
import { prisma } from "../database/client.js";
import type { Pagination } from "../http/pagination.js";

function toFavoriteListDto(p: {
  id: string;
  name: string;
  region: string;
  averageRating: number;
  ratingCount: number;
  featureLabel: string;
  coverImageUrl: string;
  category: PlaceCategory;
  about: string;
  priceLevel: number | null;
  latitude: number | null;
  longitude: number | null;
  images: { url: string }[];
}) {
  const images = [p.coverImageUrl, ...p.images.map((img) => img.url)];
  return {
    id: p.id,
    name: p.name,
    region: p.region,
    averageRating: p.averageRating,
    ratingCount: p.ratingCount,
    featureLabel: p.featureLabel,
    coverImageUrl: p.coverImageUrl,
    category: p.category,
    about: p.about,
    priceLevel: p.priceLevel,
    latitude: p.latitude,
    longitude: p.longitude,
    images,
    Id: p.id,
    Name: p.name,
    Located: p.region,
    Location: p.region,
    Rate: p.averageRating,
    NumberOfRate: p.ratingCount,
    Features: p.featureLabel,
    Category: p.category,
    image: p.coverImageUrl,
    Image: p.coverImageUrl,
    Images: images,
  };
}

export const favoritesService = {
  async list(userId: number, paging?: Pagination) {
    const limit = paging?.limit ?? 50;
    const offset = paging?.offset ?? 0;
    const [total, rows] = await Promise.all([
      prisma.favorite.count({ where: { userId } }),
      prisma.favorite.findMany({
        where: { userId },
        include: {
          place: {
            include: { images: { orderBy: { createdAt: "asc" } } },
          },
        },
        orderBy: { placeId: "asc" },
        skip: offset,
        take: limit,
      }),
    ]);

    const items = rows.map(({ place }) => toFavoriteListDto(place));

    return { items, total, limit, offset };
  },

  async add(userId: number, placeId: string) {
    const place = await prisma.place.findUnique({ where: { id: placeId } });
    if (!place) throw Object.assign(new Error("PLACE_NOT_FOUND"), { statusCode: 404 });
    await prisma.favorite.upsert({
      where: { userId_placeId: { userId, placeId } },
      update: {},
      create: { userId, placeId },
    });
    return { ok: true };
  },

  async remove(userId: number, placeId: string) {
    await prisma.favorite.deleteMany({
      where: { userId, placeId },
    });
    return { ok: true };
  },

  async isFavorite(userId: number | undefined, placeId: string) {
    if (!userId) return false;
    const f = await prisma.favorite.findUnique({
      where: { userId_placeId: { userId, placeId } },
      select: { userId: true },
    });
    return Boolean(f);
  },
};
