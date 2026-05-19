import { Router } from "express";
import { favoritesService } from "../services/favorites.service.js";
import { wrapAsync } from "../http/errors.js";

/**
 * Mounted at /users/me/favorites alongside users router handlers.
 */
export const meFavoritesRouter = Router();

meFavoritesRouter.get(
  "/",
  wrapAsync(async (req, res) => {
    const data = await favoritesService.list(req.user!.sub);
    res.json({ ok: true, data });
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
