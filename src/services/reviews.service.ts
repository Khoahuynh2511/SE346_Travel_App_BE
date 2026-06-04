import { z } from "zod";
import { prisma } from "../database/client.js";
import type { Pagination } from "../http/pagination.js";
import { notificationService } from "./notification.service.js";
import { realtimeService } from "./realtime.service.js";

async function recalcPlaceStats(placeId: string) {
  const agg = await prisma.review.aggregate({
    where: { placeId },
    _avg: { rating: true },
    _count: true,
  });
  const avg = agg._avg.rating ?? 0;
  await prisma.place.update({
    where: { id: placeId },
    data: {
      averageRating: Math.round(avg * 10) / 10,
      ratingCount: agg._count,
    },
  });
}

const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  content: z.string().min(1).max(8000),
  imageUrls: z.array(z.string().url()).optional(),
});

const updateReviewSchema = z
  .object({
    rating: z.number().int().min(1).max(5).optional(),
    content: z.string().min(1).max(8000).optional(),
    imageUrls: z.array(z.string().url()).optional(),
  })
  .refine(
    (d) =>
      d.rating !== undefined || d.content !== undefined || d.imageUrls !== undefined,
    { message: "EMPTY_UPDATE" }
  );

function mapReviewListItem(r: {
  id: string;
  userId: number;
  rating: number;
  content: string;
  createdAt: Date;
  user: { fullName: string | null; username: string | null; avatarUrl: string | null };
  images: { url: string }[];
  _count: { likes: number };
}) {
  return {
    id: r.id,
    userId: r.userId,
    username: r.user.fullName || r.user.username || "Traveler",
    Rate: r.rating,
    date: r.createdAt.toLocaleDateString("en-US", {
      month: "long",
      day: "2-digit",
      year: "numeric",
    }),
    content: r.content,
    avatar:
      r.user.avatarUrl ??
      `https://i.pravatar.cc/150?u=${encodeURIComponent(String(r.userId))}`,
    images: r.images.map((i) => i.url),
    likes: r._count.likes,
  };
}

export const reviewsService = {
  async listForPlace(placeId: string, paging: Pagination) {
    const place = await prisma.place.findUnique({
      where: { id: placeId },
      select: { id: true },
    });
    if (!place) throw Object.assign(new Error("PLACE_NOT_FOUND"), { statusCode: 404 });

    const where = { placeId };
    const [total, list] = await Promise.all([
      prisma.review.count({ where }),
      prisma.review.findMany({
        where,
        include: {
          user: { select: { fullName: true, username: true, avatarUrl: true } },
          images: true,
          _count: { select: { likes: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: paging.offset,
        take: paging.limit,
      }),
    ]);

    return {
      items: list.map(mapReviewListItem),
      total,
      limit: paging.limit,
      offset: paging.offset,
    };
  },

  async listForUser(userId: number, paging: Pagination) {
    const where = { userId };
    const [total, list] = await Promise.all([
      prisma.review.count({ where }),
      prisma.review.findMany({
        where,
        include: {
          place: {
            include: { images: { orderBy: { createdAt: "asc" } } },
          },
          images: true,
          _count: { select: { likes: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: paging.offset,
        take: paging.limit,
      }),
    ]);

    return {
      items: list.map((r) => ({
        id: r.id,
        placeId: r.placeId,
        placeName: r.place.name,
        placeCoverUrl: r.place.coverImageUrl,
        placeImages: [r.place.coverImageUrl, ...r.place.images.map((img) => img.url)],
        placeRegion: r.place.region,
        Rate: r.rating,
        date: r.createdAt.toLocaleDateString("en-US", {
          month: "long",
          day: "2-digit",
          year: "numeric",
        }),
        content: r.content,
        images: r.images.map((i) => i.url),
        likes: r._count.likes,
      })),
      total,
      limit: paging.limit,
      offset: paging.offset,
    };
  },

  async create(placeId: string, userId: number, body: unknown) {
    const data = createReviewSchema.parse(body);
    const place = await prisma.place.findUnique({ where: { id: placeId } });
    if (!place) throw Object.assign(new Error("PLACE_NOT_FOUND"), { statusCode: 404 });

    const rev = await prisma.review.create({
      data: {
        placeId,
        userId,
        rating: data.rating,
        content: data.content,
        images: data.imageUrls?.length
          ? { create: data.imageUrls.map((url) => ({ url })) }
          : undefined,
      },
    });
    await recalcPlaceStats(placeId);
    void realtimeService.publishReviewCreated({
      placeId,
      reviewId: rev.id,
    });
    return rev;
  },

  async toggleLike(reviewId: string, userId: number) {
    const rev = await prisma.review.findUnique({ where: { id: reviewId } });
    if (!rev) throw Object.assign(new Error("REVIEW_NOT_FOUND"), { statusCode: 404 });

    const existing = await prisma.reviewLike.findFirst({
      where: { reviewId, userId },
    });
    if (existing) {
      await prisma.reviewLike.delete({ where: { id: existing.id } });
      const count = await prisma.reviewLike.count({ where: { reviewId } });
      return { liked: false, likes: count };
    }
    await prisma.reviewLike.create({ data: { reviewId, userId } });
    await createNotificationSideEffect(() =>
      notificationService.createReviewLikeNotification({
        actorId: userId,
        reviewId,
      })
    );
    const count = await prisma.reviewLike.count({ where: { reviewId } });
    return { liked: true, likes: count };
  },

  async update(reviewId: string, userId: number, body: unknown) {
    const data = updateReviewSchema.parse(body);
    const rev = await prisma.review.findUnique({ where: { id: reviewId } });
    if (!rev) throw Object.assign(new Error("REVIEW_NOT_FOUND"), { statusCode: 404 });
    if (rev.userId !== userId)
      throw Object.assign(new Error("FORBIDDEN"), { statusCode: 403 });

    const placeId = rev.placeId;
    await prisma.$transaction(async (tx) => {
      if (data.imageUrls !== undefined) {
        await tx.reviewImage.deleteMany({ where: { reviewId } });
        if (data.imageUrls.length > 0) {
          await tx.reviewImage.createMany({
            data: data.imageUrls.map((url) => ({ reviewId, url })),
          });
        }
      }
      await tx.review.update({
        where: { id: reviewId },
        data: {
          ...(data.rating !== undefined ? { rating: data.rating } : {}),
          ...(data.content !== undefined ? { content: data.content } : {}),
        },
      });
    });
    await recalcPlaceStats(placeId);

    const updatedRev = await prisma.review.findUnique({
      where: { id: reviewId },
      include: {
        user: { select: { fullName: true, username: true, avatarUrl: true } },
        images: true,
        _count: { select: { likes: true } },
      },
    });
    if (!updatedRev) throw Object.assign(new Error("REVIEW_NOT_FOUND"), { statusCode: 404 });
    return mapReviewListItem(updatedRev);
  },

  async remove(reviewId: string, userId: number) {
    const rev = await prisma.review.findUnique({ where: { id: reviewId } });
    if (!rev) throw Object.assign(new Error("REVIEW_NOT_FOUND"), { statusCode: 404 });
    if (rev.userId !== userId)
      throw Object.assign(new Error("FORBIDDEN"), { statusCode: 403 });

    const placeId = rev.placeId;
    await prisma.review.delete({ where: { id: reviewId } });
    await recalcPlaceStats(placeId);
  },
};

async function createNotificationSideEffect<T>(factory: () => Promise<T>) {
  try {
    return await factory();
  } catch {
    return null;
  }
}
