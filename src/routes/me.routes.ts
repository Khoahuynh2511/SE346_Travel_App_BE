import { Router } from "express";
import { wrapAsync } from "../http/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { tripMembersService } from "../services/tripMembers.services.js";

export const meRouter = Router();

meRouter.get(
  "/trip-invitations",
  requireAuth,
  wrapAsync(async (req, res) => {
    const data = await tripMembersService.listInvitationsForUser(req.user!.sub);
    res.json({ ok: true, data });
  })
);
