import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { wrapAsync } from "../http/errors.js";
import { tripDiaryService } from "../services/tripDiary.service.js";

export const tripDiaryRouter = Router();

tripDiaryRouter.patch(
  "/:entryId",
  requireAuth,
  wrapAsync(async (req, res) => {
    const data = await tripDiaryService.update(req.user!.sub, String(req.params.entryId), req.body);
    res.json({ ok: true, data });
  })
);

tripDiaryRouter.delete(
  "/:entryId",
  requireAuth,
  wrapAsync(async (req, res) => {
    await tripDiaryService.remove(req.user!.sub, String(req.params.entryId));
    res.json({ ok: true });
  })
);
