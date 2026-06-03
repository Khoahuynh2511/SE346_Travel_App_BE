import { Router, type RequestHandler } from "express";
import { jsonError, wrapAsync } from "../http/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { tripMemberRouter } from "./tripMember.router.js";
import { tripsService } from "../services/trips.service.js";

type TripsRouterOptions = {
  requireAuthentication?: boolean;
  includeTripCrud?: boolean;
};

function paramValue(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function createTripsRouter(options: TripsRouterOptions = {}) {
  const router = Router();
  const authHandlers: RequestHandler[] = options.requireAuthentication === false ? [] : [requireAuth];
  const includeTripCrud = options.includeTripCrud !== false;

  router.get(
    "/",
    ...authHandlers,
    wrapAsync(async (req, res) => {
      const data = await tripsService.listForUser(req.user!.sub);
      res.json({ ok: true, data });
    })
  );

  if (includeTripCrud) {
    router.post(
      "/",
      ...authHandlers,
      wrapAsync(async (req, res) => {
        const data = await tripsService.createForUser(req.user!.sub, req.body);
        res.status(201).json({ ok: true, data });
      })
    );
  }

  router.post(
    "/:tripId/days/:dayId/places",
    ...authHandlers,
    wrapAsync(async (req, res) => {
      const tripId = paramValue(req.params.tripId);
      const dayId = paramValue(req.params.dayId);
      const data = await tripsService.addPlaceToDayForUser(req.user!.sub, tripId, dayId, req.body);
      res.status(201).json({ ok: true, data });
    })
  );

  router.delete(
    "/:tripId/days/:dayId/places/:placeId",
    ...authHandlers,
    wrapAsync(async (req, res) => {
      const tripId = paramValue(req.params.tripId);
      const dayId = paramValue(req.params.dayId);
      const placeId = paramValue(req.params.placeId);
      const data = await tripsService.removePlaceFromDayForUser(req.user!.sub, tripId, dayId, placeId);
      res.json({ ok: true, data });
    })
  );

  router.delete(
    "/:tripId/days/:dayId/activities/:activityId",
    ...authHandlers,
    wrapAsync(async (req, res) => {
      const tripId = paramValue(req.params.tripId);
      const dayId = paramValue(req.params.dayId);
      const activityId = paramValue(req.params.activityId);
      const data = await tripsService.removeActivityFromDayForUser(req.user!.sub, tripId, dayId, activityId);
      res.json({ ok: true, data });
    })
  );

  if (!includeTripCrud) {
    return router;
  }

  router.get(
    "/:tripId",
    ...authHandlers,
    wrapAsync(async (req, res) => {
      const tripId = paramValue(req.params.tripId);
      const trip = await tripsService.getForUserById(req.user!.sub, tripId);

      if (!trip) {
        res.status(404).json(jsonError(404, "TRIP_NOT_FOUND"));
        return;
      }

      res.json({ ok: true, data: trip });
    })
  );

  router.get(
    "/:tripId/diary",
    ...authHandlers,
    wrapAsync(async (req, res) => {
      const tripId = paramValue(req.params.tripId);
      const data = await tripsService.listDiaryForUser(req.user!.sub, tripId);
      res.json({ ok: true, data });
    })
  );

  router.post(
    "/:tripId/diary",
    ...authHandlers,
    wrapAsync(async (req, res) => {
      const tripId = paramValue(req.params.tripId);
      const data = await tripsService.createDiaryForUser(req.user!.sub, tripId, req.body);
      res.status(201).json({ ok: true, data });
    })
  );

  router.put(
    "/:tripId",
    ...authHandlers,
    wrapAsync(async (req, res) => {
      const tripId = paramValue(req.params.tripId);
      const data = await tripsService.updateForUser(req.user!.sub, tripId, req.body);
      res.json({ ok: true, data });
    })
  );

  router.patch(
    "/:tripId",
    ...authHandlers,
    wrapAsync(async (req, res) => {
      const tripId = paramValue(req.params.tripId);
      const data = await tripsService.updateForUser(req.user!.sub, tripId, req.body);
      res.json({ ok: true, data });
    })
  );

  router.delete(
    "/:tripId",
    ...authHandlers,
    wrapAsync(async (req, res) => {
      const tripId = paramValue(req.params.tripId);
      await tripsService.deleteForUser(req.user!.sub, tripId);
      res.json({ ok: true });
    })
  );

  router.use(tripMemberRouter);

  return router;
}

export const tripsRouter = createTripsRouter();
export const meTripsRouter = createTripsRouter({
  requireAuthentication: false,
  includeTripCrud: false,
});
