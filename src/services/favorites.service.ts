import { prisma } from "../database/client.js";

export const favoritesService = {
  async list(userId: number) {
    const rows = await prisma.favorite.findMany({
      where: { userId },
      include: {
        place: {
          include: { images: { orderBy: { createdAt: "asc" } } },
        },
      },
    });
    return rows.map(({ place: p }) => ({
      Id: p.id,
      Name: p.name,
      Located: p.region,
      Rate: p.averageRating,
      NumberOfRate: p.ratingCount,
      Features: p.featureLabel,
      image: p.coverImageUrl,
      images: [p.coverImageUrl, ...p.images.map((img) => img.url)],
    }));
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
