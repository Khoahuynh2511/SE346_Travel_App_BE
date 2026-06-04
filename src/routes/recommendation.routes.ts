import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { recommendationService } from "../services/recommendation.service.js";
import { wrapAsync } from "../http/errors.js";
import { prisma } from "../database/client.js";
import { notDeleted } from "../utils/softDelete.js";

export const recommendationRouter = Router();

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "object" && value !== null && "toNumber" in value) {
    try {
      const parsed = (value as { toNumber: () => number }).toNumber();
      return Number.isFinite(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

const transformItem = (item: any) => ({
  placeId: item.place.id,
  name: item.place.name,
  region: item.place.region,
  category: item.place.category,
  coverImageUrl: item.place.coverImageUrl,
  featureLabel: item.place.featureLabel,
  averageRating: toNumberOrNull(item.place.averageRating) ?? 0,
  ratingCount: item.place.ratingCount,
  priceLevel: toNumberOrNull(item.place.priceLevel),
  score: item.score,
  explanation: item.explanation,
  matchPercentage: Math.round(item.score * 100),
});

recommendationRouter.get(
  "/",
  requireAuth,
  wrapAsync(async (req, res) => {
    const userId = req.user!.sub;
    const limit = Math.min(Number(req.query.limit) || 10, 20);

    const result = await recommendationService.getRecommendations(userId, { limit });

    res.json({
      ok: true,
      data: {
        contentBased: result.contentBased.map(transformItem),
        serendipity: result.serendipity.map(transformItem),
        collaborative: result.collaborative.map(transformItem),
        tfidfSimilar: result.tfidfSimilar.map(transformItem),
        trending: result.trending.map(transformItem),
      },
    });
  })
);

recommendationRouter.get(
  "/similar/:placeId",
  wrapAsync(async (req, res) => {
    const placeId = String(req.params.placeId);
    const limit = Math.min(Number(req.query.limit) || 10, 20);

    const result = await recommendationService.findSimilarPlaces(placeId, limit);

    res.json({ ok: true, data: result.map(transformItem) });
  })
);

recommendationRouter.get(
  "/trending",
  wrapAsync(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 10, 50);

    const places = await prisma.place.findMany({
      where: { status: "APPROVED", ...notDeleted },
      orderBy: { ratingCount: "desc" },
      take: limit,
      select: {
        id: true,
        name: true,
        region: true,
        category: true,
        coverImageUrl: true,
        featureLabel: true,
        averageRating: true,
        ratingCount: true,
        priceLevel: true,
      },
    });

    const data = places.map((place) => {
      const score = Math.log1p(place.ratingCount) / Math.log1p(5000);
      return {
        placeId: place.id,
        name: place.name,
        region: place.region,
        category: place.category,
        coverImageUrl: place.coverImageUrl,
        featureLabel: place.featureLabel,
        averageRating: toNumberOrNull(place.averageRating) ?? 0,
        ratingCount: place.ratingCount,
        priceLevel: toNumberOrNull(place.priceLevel),
        score,
        explanation: "Đang thịnh hành",
        matchPercentage: Math.round(score * 100),
      };
    });

    res.json({ ok: true, data });
  })
);
