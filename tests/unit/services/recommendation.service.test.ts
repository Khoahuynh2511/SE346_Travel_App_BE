import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  favorite: {
    findMany: vi.fn(),
  },
  review: {
    findMany: vi.fn(),
  },
  tripActivity: {
    findMany: vi.fn(),
  },
  place: {
    findMany: vi.fn(),
  },
}));

vi.mock("../../../src/database/client.js", () => ({
  prisma: prismaMock,
}));

const basePlace = {
  region: "Ha Noi",
  category: "ATTRACTIONS",
  coverImageUrl: "https://example.com/cover.jpg",
  featureLabel: "Historic view",
  averageRating: 4.5,
  ratingCount: 100,
  about: "historic lakeside walking",
  priceLevel: 100000,
  latitude: null,
  longitude: null,
};

function place(overrides: Record<string, unknown>) {
  return {
    ...basePlace,
    ...overrides,
  };
}

describe("recommendationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.favorite.findMany.mockResolvedValue([]);
    prismaMock.review.findMany.mockResolvedValue([]);
    prismaMock.tripActivity.findMany.mockResolvedValue([]);
  });

  it("reads current place fields on the next recommendation request", async () => {
    const { recommendationService } = await import("../../../src/services/recommendation.service.js");

    prismaMock.place.findMany
      .mockResolvedValueOnce([
        place({
          id: "place-1",
          name: "Original Place",
          averageRating: "4.1",
          ratingCount: "120",
          coverImageUrl: "https://example.com/original.jpg",
          featureLabel: "Original label",
          about: "original about text",
        }),
      ])
      .mockResolvedValueOnce([
        place({
          id: "place-1",
          name: "Original Place",
          averageRating: "4.9",
          ratingCount: "321",
          coverImageUrl: "https://example.com/updated.jpg",
          featureLabel: "Updated label",
          about: "updated about text",
        }),
      ]);

    const first = await recommendationService.getRecommendations(1, { limit: 1 });
    const second = await recommendationService.getRecommendations(1, { limit: 1 });

    expect(first.trending[0].place).toMatchObject({
      averageRating: 4.1,
      ratingCount: 120,
      coverImageUrl: "https://example.com/original.jpg",
      featureLabel: "Original label",
      about: "original about text",
    });
    expect(second.trending[0].place).toMatchObject({
      averageRating: 4.9,
      ratingCount: 321,
      coverImageUrl: "https://example.com/updated.jpg",
      featureLabel: "Updated label",
      about: "updated about text",
    });
    expect(prismaMock.place.findMany).toHaveBeenCalledTimes(2);
  });

  it("refreshes TF-IDF similar places when feature text changes", async () => {
    const { recommendationService } = await import("../../../src/services/recommendation.service.js");

    prismaMock.place.findMany
      .mockResolvedValueOnce([
        place({ id: "target", name: "Target", featureLabel: "oldword target", about: "heritage stone" }),
        place({ id: "old-match", name: "Old Match", featureLabel: "oldword nearby", about: "quiet museum" }),
        place({ id: "new-match", name: "New Match", featureLabel: "freshword nearby", about: "bright market" }),
        place({ id: "other", name: "Other", featureLabel: "coastal route", about: "river garden" }),
      ])
      .mockResolvedValueOnce([
        place({ id: "target", name: "Target", featureLabel: "freshword target", about: "heritage stone" }),
        place({ id: "old-match", name: "Old Match", featureLabel: "oldword nearby", about: "quiet museum" }),
        place({ id: "new-match", name: "New Match", featureLabel: "freshword nearby", about: "bright market" }),
        place({ id: "other", name: "Other", featureLabel: "coastal route", about: "river garden" }),
      ]);

    const first = await recommendationService.findSimilarPlaces("target", 1);
    const second = await recommendationService.findSimilarPlaces("target", 1);

    expect(first[0].place.id).toBe("old-match");
    expect(second[0].place.id).toBe("new-match");
    expect(prismaMock.place.findMany).toHaveBeenCalledTimes(2);
  });
});
