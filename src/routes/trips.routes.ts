import { Router } from "express";
import { jsonError, wrapAsync } from "../http/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { tripsService } from "../services/trips.service.js";

export const tripsRouter = Router();

tripsRouter.get(
  "/",
  requireAuth,
  wrapAsync(async (req, res) => {
    const data = await tripsService.listForUser(req.user!.sub);
    res.json({ ok: true, data });
  })
);

tripsRouter.post(
  "/",
  requireAuth,
  wrapAsync(async (req, res) => {
    const data = await tripsService.createForUser(req.user!.sub, req.body);
    res.status(201).json({ ok: true, data });
  })
);

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

tripsRouter.put(
  "/:tripId",
  requireAuth,
  wrapAsync(async (req, res) => {
    const tripId = Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId;
    const data = await tripsService.updateForUser(req.user!.sub, tripId, req.body);
    res.json({ ok: true, data });
  })
);

tripsRouter.patch(
  "/:tripId",
  requireAuth,
  wrapAsync(async (req, res) => {
    const tripId = Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId;
    const data = await tripsService.updateForUser(req.user!.sub, tripId, req.body);
    res.json({ ok: true, data });
  })
);

tripsRouter.delete(
  "/:tripId",
  requireAuth,
  wrapAsync(async (req, res) => {
    const tripId = Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId;
    await tripsService.deleteForUser(req.user!.sub, tripId);
    res.json({ ok: true });
  })
);
