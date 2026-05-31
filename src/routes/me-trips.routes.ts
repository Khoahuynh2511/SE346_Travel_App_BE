import { Router } from "express";
import { wrapAsync } from "../http/errors.js";
import { tripsService } from "../services/trips.service.js";

/**
 * Mounted at /users/me/trips alongside users router handlers.
 */
export const meTripsRouter = Router();

meTripsRouter.get(
  "/",
  wrapAsync(async (req, res) => {
    const data = await tripsService.listForUser(req.user!.sub);
    res.json({ ok: true, data });
  })
);
