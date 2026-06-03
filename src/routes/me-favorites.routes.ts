import { Router } from "express";
import { favoritesService } from "../services/favorites.service.js";
import { wrapAsync } from "../http/errors.js";
import { parsePagination } from "../http/pagination.js";

/**
 * Mounted at /users/me/favorites alongside users router handlers.
 */
export const meFavoritesRouter = Router();

meFavoritesRouter.get(
  "/",
  wrapAsync(async (req, res) => {
    const paging = parsePagination(req.query as Record<string, string | undefined>);
    const result = await favoritesService.list(req.user!.sub, paging);
    res.json({ ok: true, data: result.items, meta: { total: result.total, limit: result.limit, offset: result.offset } });
  })
);

meFavoritesRouter.post(
  "/places/:placeId",
  wrapAsync(async (req, res) => {
    await favoritesService.add(req.user!.sub, String(req.params.placeId));
    res.status(201).json({ ok: true });
  })
);

meFavoritesRouter.delete(
  "/places/:placeId",
  wrapAsync(async (req, res) => {
    await favoritesService.remove(req.user!.sub, String(req.params.placeId));
    res.json({ ok: true });
  })
);
