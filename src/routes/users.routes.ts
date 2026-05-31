import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { usersService } from "../services/users.service.js";
import { reviewsService } from "../services/reviews.service.js";
import { jsonError, wrapAsync } from "../http/errors.js";
import { meFavoritesRouter } from "./me-favorites.routes.js";
import { meTripsRouter } from "./me-trips.routes.js";
import { parsePagination } from "../http/pagination.js";

export const usersRouter = Router();

usersRouter.get(
  "/me",
  requireAuth,
  wrapAsync(async (req, res) => {
    const u = await usersService.me(req.user!.sub);
    res.json({ ok: true, data: u });
  })
);

usersRouter.patch(
  "/me",
  requireAuth,
  wrapAsync(async (req, res) => {
    try {
      const u = await usersService.updateMe(req.user!.sub, req.body);
      res.json({ ok: true, data: u });
    } catch (e) {
      if (e instanceof Error && e.message === "USERNAME_TAKEN") {
        res.status(409).json(jsonError(409, "USERNAME_TAKEN"));
        return;
      }
      if (e instanceof Error && e.message === "EMAIL_TAKEN") {
        res.status(409).json(jsonError(409, "EMAIL_TAKEN"));
        return;
      }
      throw e;
    }
  })
);

usersRouter.get(
  "/me/reviews",
  requireAuth,
  wrapAsync(async (req, res) => {
    const paging = parsePagination(req.query as Record<string, string | undefined>);
    const result = await reviewsService.listForUser(req.user!.sub, paging);
    res.json({
      ok: true,
      data: result.items,
      meta: { total: result.total, limit: result.limit, offset: result.offset },
    });
  })
);

usersRouter.use("/me/favorites", requireAuth, meFavoritesRouter);
usersRouter.use("/me/trips", requireAuth, meTripsRouter);
