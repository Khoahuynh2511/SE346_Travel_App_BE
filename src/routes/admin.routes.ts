import { Router } from "express";
import { wrapAsync } from "../http/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { adminService } from "../services/admin.service.js";
import { parsePagination } from "../http/pagination.js";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

// Health-check
adminRouter.get(
  "/",
  wrapAsync(async (_req, res) => {
    res.json({ ok: true, data: { role: "ADMIN" } });
  })
);

// List places (with optional ?status=PENDING|APPROVED|REJECTED filter)
adminRouter.get(
  "/places",
  wrapAsync(async (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    const paging = parsePagination(q);
    const result = await adminService.listPlaces(q, req.user!.sub, paging);
    res.json({
      ok: true,
      data: result.items,
      meta: { total: result.total, limit: result.limit, offset: result.offset },
    });
  })
);

// Approve a pending place
adminRouter.post(
  "/places/:placeId/approve",
  wrapAsync(async (req, res) => {
    const data = await adminService.approvePlace(
      req.user!.sub,
      String(req.params.placeId)
    );
    res.json({ ok: true, data });
  })
);

// Reject a pending place
adminRouter.post(
  "/places/:placeId/reject",
  wrapAsync(async (req, res) => {
    const data = await adminService.rejectPlace(
      req.user!.sub,
      String(req.params.placeId),
      req.body
    );
    res.json({ ok: true, data });
  })
);

// Delete any place
adminRouter.delete(
  "/places/:placeId",
  wrapAsync(async (req, res) => {
    const data = await adminService.deletePlace(
      req.user!.sub,
      String(req.params.placeId)
    );
    res.json({ ok: true, data });
  })
);

// List users (with optional ?search=query&role=TRAVELER|OWNER|ADMIN filter)
adminRouter.get(
  "/users",
  wrapAsync(async (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    const paging = parsePagination(q);
    const result = await adminService.listUsers(q, req.user!.sub, paging);
    res.json({
      ok: true,
      data: result.items,
      meta: { total: result.total, limit: result.limit, offset: result.offset },
    });
  })
);

// Ban/unban a user
adminRouter.post(
  "/users/:userId/ban",
  wrapAsync(async (req, res) => {
    const data = await adminService.banUser(
      req.user!.sub,
      String(req.params.userId),
      req.body
    );
    res.json({ ok: true, data });
  })
);

// Change user role
adminRouter.patch(
  "/users/:userId/role",
  wrapAsync(async (req, res) => {
    const data = await adminService.changeUserRole(
      req.user!.sub,
      String(req.params.userId),
      req.body
    );
    res.json({ ok: true, data });
  })
);
