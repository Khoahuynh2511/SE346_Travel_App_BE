import { Router } from "express";
import { jsonError, wrapAsync } from "../http/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { tripsService } from "../services/trips.service.js";

export const tripsRouter = Router();

tripsRouter.get(
  "/:tripId",
  requireAuth,
  wrapAsync(async (req, res) => {
    const tripId = Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId;
    const trip = await tripsService.getForUserById(req.user!.sub, tripId);

    if (!trip) {
      res.status(404).json(jsonError(404, "TRIP_NOT_FOUND"));
      return;
    }

    res.json({ ok: true, data: trip });
  })
);
