import { Router } from "express";
import { wrapAsync } from "../http/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { notificationService } from "../services/notification.service.js";

export const notificationRouter = Router();

notificationRouter.get(
  "/",
  requireAuth,
  wrapAsync(async (req, res) => {
    const data = await notificationService.getUserNotifications(req.user!.sub, req.query);
    res.json({ ok: true, data });
  })
);

notificationRouter.get(
  "/unread-count",
  requireAuth,
  wrapAsync(async (req, res) => {
    const count = await notificationService.unreadCount(req.user!.sub);
    res.json({ ok: true, data: { count } });
  })
);

notificationRouter.patch(
  "/read-all",
  requireAuth,
  wrapAsync(async (req, res) => {
    const data = await notificationService.markAllRead(req.user!.sub);
    res.json({ ok: true, data });
  })
);

notificationRouter.patch(
  "/:id/read",
  requireAuth,
  wrapAsync(async (req, res) => {
    const data = await notificationService.markRead(req.user!.sub, String(req.params.id));
    res.json({ ok: true, data });
  })
);

notificationRouter.delete(
  "/:id",
  requireAuth,
  wrapAsync(async (req, res) => {
    const data = await notificationService.deleteUserNotification(req.user!.sub, String(req.params.id));
    res.json({ ok: true, data });
  })
);

notificationRouter.post(
  "/:id/accept",
  requireAuth,
  wrapAsync(async (req, res) => {
    const data = await notificationService.acceptInvite(req.user!.sub, String(req.params.id));
    res.json(data);
  })
);

notificationRouter.post(
  "/:id/decline",
  requireAuth,
  wrapAsync(async (req, res) => {
    const data = await notificationService.declineInvite(req.user!.sub, String(req.params.id));
    res.json(data);
  })
);
