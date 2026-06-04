import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { itineraryOptimizerService } from "../services/itineraryOptimizer.service.js";
import { wrapAsync } from "../http/errors.js";

export const itineraryOptimizerRouter = Router();

itineraryOptimizerRouter.post(
  "/optimize",
  requireAuth,
  wrapAsync(async (req, res) => {
    const { placeIds, startDate, endDate, dailyStartTime, dailyEndTime, maxBudget, preferenceWeights } = req.body;

    if (!Array.isArray(placeIds) || placeIds.length === 0) {
      res.status(400).json({ ok: false, error: "placeIds must be a non-empty array" });
      return;
    }

    if (!startDate || !endDate) {
      res.status(400).json({ ok: false, error: "startDate and endDate are required" });
      return;
    }

    const result = await itineraryOptimizerService.optimizeItinerary(placeIds, {
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      dailyStartTime: dailyStartTime || "08:00",
      dailyEndTime: dailyEndTime || "22:00",
      maxBudget,
      preferenceWeights,
    });
    res.json({ ok: true, data: result });
  })
);

itineraryOptimizerRouter.get(
  "/durations/:placeId",
  wrapAsync(async (req, res) => {
    const placeId = String(req.params.placeId);
    const duration = await itineraryOptimizerService.getPlaceDuration(placeId);
    res.json({ ok: true, data: { duration } });
  })
);
