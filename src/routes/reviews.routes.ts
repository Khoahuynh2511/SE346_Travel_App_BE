import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { reviewsService } from "../services/reviews.service.js";
import { wrapAsync } from "../http/errors.js";

export const reviewsRouter = Router();

reviewsRouter.patch(
  "/:reviewId",
  requireAuth,
  wrapAsync(async (req, res) => {
    const data = await reviewsService.update(
      String(req.params.reviewId),
      req.user!.sub,
      req.body
    );
    res.json({ ok: true, data });
  })
);

reviewsRouter.delete(
  "/:reviewId",
  requireAuth,
  wrapAsync(async (req, res) => {
    await reviewsService.remove(String(req.params.reviewId), req.user!.sub);
    res.json({ ok: true });
  })
);

reviewsRouter.post(
  "/:reviewId/likes/toggle",
  requireAuth,
  wrapAsync(async (req, res) => {
    const data = await reviewsService.toggleLike(
      String(req.params.reviewId),
      req.user!.sub
    );
    res.json({ ok: true, data });
  })
);
