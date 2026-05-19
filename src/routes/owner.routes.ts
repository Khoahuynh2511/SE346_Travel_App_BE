import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireOwner } from "../middleware/requireOwner.js";
import { ownerService } from "../services/owner.service.js";
import { wrapAsync } from "../http/errors.js";

export const ownerRouter = Router();

ownerRouter.use(requireAuth, requireOwner);

ownerRouter.get(
  "/places",
  wrapAsync(async (req, res) => {
    const data = await ownerService.listPlaces(req.user!.sub);
    res.json({ ok: true, data });
  })
);

ownerRouter.post(
  "/places",
  wrapAsync(async (req, res) => {
    const data = await ownerService.createPlace(req.user!.sub, req.body);
    res.status(201).json({ ok: true, data });
  })
);

ownerRouter.get(
  "/places/:placeId",
  wrapAsync(async (req, res) => {
    const data = await ownerService.getPlace(req.user!.sub, String(req.params.placeId));
    res.json({ ok: true, data });
  })
);

ownerRouter.patch(
  "/places/:placeId",
  wrapAsync(async (req, res) => {
    const data = await ownerService.updatePlace(
      req.user!.sub,
      String(req.params.placeId),
      req.body
    );
    res.json({ ok: true, data });
  })
);

ownerRouter.delete(
  "/places/:placeId",
  wrapAsync(async (req, res) => {
    await ownerService.deletePlace(req.user!.sub, String(req.params.placeId));
    res.json({ ok: true });
  })
);

ownerRouter.get(
  "/places/:placeId/promotions",
  wrapAsync(async (req, res) => {
    const data = await ownerService.listPromotions(
      req.user!.sub,
      String(req.params.placeId)
    );
    res.json({ ok: true, data });
  })
);

ownerRouter.post(
  "/places/:placeId/promotions",
  wrapAsync(async (req, res) => {
    const data = await ownerService.createPromotion(
      req.user!.sub,
      String(req.params.placeId),
      req.body
    );
    res.status(201).json({ ok: true, data });
  })
);

ownerRouter.patch(
  "/promotions/:promotionId",
  wrapAsync(async (req, res) => {
    const data = await ownerService.updatePromotion(
      req.user!.sub,
      String(req.params.promotionId),
      req.body
    );
    res.json({ ok: true, data });
  })
);

ownerRouter.post(
  "/promotions/:promotionId/toggle",
  wrapAsync(async (req, res) => {
    const data = await ownerService.togglePromotion(
      req.user!.sub,
      String(req.params.promotionId)
    );
    res.json({ ok: true, data });
  })
);

ownerRouter.delete(
  "/promotions/:promotionId",
  wrapAsync(async (req, res) => {
    await ownerService.deletePromotion(req.user!.sub, String(req.params.promotionId));
    res.json({ ok: true });
  })
);
