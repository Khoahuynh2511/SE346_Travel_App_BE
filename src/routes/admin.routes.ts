import { Router } from "express";
import { wrapAsync } from "../http/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

adminRouter.get(
  "/",
  wrapAsync(async (_req, res) => {
    res.json({ ok: true, data: { role: "ADMIN" } });
  })
);
