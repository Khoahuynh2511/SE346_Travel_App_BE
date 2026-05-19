import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { aiService } from "../services/ai.service.js";
import { wrapAsync } from "../http/errors.js";

export const aiRouter = Router();

aiRouter.post(
  "/trip-plan",
  requireAuth,
  wrapAsync(async (req, res) => {
    const data = aiService.planTrip(req.body);
    res.json({ ok: true, data });
  })
);
