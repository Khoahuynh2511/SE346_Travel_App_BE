import { Router } from "express";
import { optionalAuth, requireAuth } from "../middleware/auth.js";
import { placesService } from "../services/places.service.js";
import { favoritesService } from "../services/favorites.service.js";
import { reviewsService } from "../services/reviews.service.js";
import { wrapAsync } from "../http/errors.js";
import { parsePagination } from "../http/pagination.js";

export const placesRouter = Router();

placesRouter.get(
  "/",
  wrapAsync(async (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    const paging = parsePagination(q);
    const result = await placesService.list(q, paging);
    res.json({
      ok: true,
      data: result.items,
      meta: { total: result.total, limit: result.limit, offset: result.offset },
    });
  })
);

placesRouter.get(
  "/:placeId",
  optionalAuth,
  wrapAsync(async (req, res) => {
    const placeId = String(req.params.placeId);
    const dto = await placesService.getById(placeId);
    if (!dto) {
      res.status(404).json({ ok: false, error: "NOT_FOUND" });
      return;
    }
    const isFavorite = await favoritesService.isFavorite(req.user?.sub, placeId);
    res.json({
      ok: true,
      data: { ...dto, isFavorite },
    });
  })
);

placesRouter.get(
  "/:placeId/reviews",
  wrapAsync(async (req, res) => {
    const paging = parsePagination(req.query as Record<string, string | undefined>);
    const result = await reviewsService.listForPlace(String(req.params.placeId), paging);
    res.json({
      ok: true,
      data: result.items,
      meta: { total: result.total, limit: result.limit, offset: result.offset },
    });
  })
);

placesRouter.get(
  "/:placeId/promotions",
  wrapAsync(async (req, res) => {
    const data = await placesService.listPromotions(String(req.params.placeId));
    if (!data) {
      res.status(404).json({ ok: false, error: "NOT_FOUND" });
      return;
    }
    res.json({ ok: true, data });
  })
);

placesRouter.post(
  "/:placeId/reviews",
  requireAuth,
  wrapAsync(async (req, res) => {
    const created = await reviewsService.create(
      String(req.params.placeId),
      req.user!.sub,
      req.body
    );
    res.status(201).json({ ok: true, data: { id: created.id } });
  })
);
