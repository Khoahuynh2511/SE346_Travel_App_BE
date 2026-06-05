import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  favorite: {
    count: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
  place: {
    findFirst: vi.fn(),
  },
  promotion: {
    findMany: vi.fn(),
  },
  review: {
    count: vi.fn(),
    create: vi.fn(),
    findMany: vi.fn(),
  },
}));

vi.mock("../../../src/database/client.js", () => ({
  prisma: prismaMock,
}));

vi.mock("../../../src/services/notification.service.js", () => ({
  notificationService: {
    createReviewLikeNotification: vi.fn(),
  },
}));

vi.mock("../../../src/services/realtime.service.js", () => ({
  realtimeService: {
    publishReviewCreated: vi.fn().mockResolvedValue(null),
  },
}));

const publicPlaceWhere = { status: "APPROVED", deletedAt: null };

describe("public place visibility guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filters favorite list to approved and non-deleted places", async () => {
    const { favoritesService } = await import("../../../src/services/favorites.service.js");

    prismaMock.favorite.count.mockResolvedValue(0);
    prismaMock.favorite.findMany.mockResolvedValue([]);

    await favoritesService.list(123);

    const expectedWhere = { userId: 123, place: publicPlaceWhere };
    expect(prismaMock.favorite.count).toHaveBeenCalledWith({ where: expectedWhere });
    expect(prismaMock.favorite.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere })
    );
  });

  it("does not add favorites for pending, rejected, or deleted places", async () => {
    const { favoritesService } = await import("../../../src/services/favorites.service.js");

    prismaMock.place.findFirst.mockResolvedValue(null);

    await expect(favoritesService.add(123, "place-1")).rejects.toMatchObject({
      message: "PLACE_NOT_FOUND",
      statusCode: 404,
    });
    expect(prismaMock.place.findFirst).toHaveBeenCalledWith({
      where: { id: "place-1", ...publicPlaceWhere },
      select: { id: true },
    });
    expect(prismaMock.favorite.upsert).not.toHaveBeenCalled();
  });

  it("does not list reviews for pending, rejected, or deleted places", async () => {
    const { reviewsService } = await import("../../../src/services/reviews.service.js");

    prismaMock.place.findFirst.mockResolvedValue(null);

    await expect(
      reviewsService.listForPlace("place-1", { limit: 20, offset: 0 })
    ).rejects.toMatchObject({
      message: "PLACE_NOT_FOUND",
      statusCode: 404,
    });
    expect(prismaMock.place.findFirst).toHaveBeenCalledWith({
      where: { id: "place-1", ...publicPlaceWhere },
      select: { id: true },
    });
    expect(prismaMock.review.count).not.toHaveBeenCalled();
    expect(prismaMock.review.findMany).not.toHaveBeenCalled();
  });

  it("does not create reviews for pending, rejected, or deleted places", async () => {
    const { reviewsService } = await import("../../../src/services/reviews.service.js");

    prismaMock.place.findFirst.mockResolvedValue(null);

    await expect(
      reviewsService.create("place-1", 123, { rating: 5, content: "Great place" })
    ).rejects.toMatchObject({
      message: "PLACE_NOT_FOUND",
      statusCode: 404,
    });
    expect(prismaMock.place.findFirst).toHaveBeenCalledWith({
      where: { id: "place-1", ...publicPlaceWhere },
      select: { id: true },
    });
    expect(prismaMock.review.create).not.toHaveBeenCalled();
  });

  it("does not list public promotions for pending, rejected, or deleted places", async () => {
    const { placesService } = await import("../../../src/services/places.service.js");

    prismaMock.place.findFirst.mockResolvedValue(null);

    const result = await placesService.listPromotions("place-1");

    expect(result).toBeNull();
    expect(prismaMock.place.findFirst).toHaveBeenCalledWith({
      where: { id: "place-1", ...publicPlaceWhere },
      select: { id: true },
    });
    expect(prismaMock.promotion.findMany).not.toHaveBeenCalled();
  });
});
