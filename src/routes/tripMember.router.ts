import { Router } from "express";
import { wrapAsync } from "../http/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { tripMembersService } from "../services/tripMembers.services.js";

export const tripMemberRouter = Router();

tripMemberRouter.get(
  "/:tripId/members/recommendations/:userId",
  requireAuth,
  wrapAsync(async (req, res) => {
    const tripId = Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId;
    const rawUserId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
    const rawSearchTerm = Array.isArray(req.query.searchTerm) ? req.query.searchTerm[0] : req.query.searchTerm;
    const data = await tripMembersService.listMemberRecommendations({
      userId: rawUserId,
      tripId,
      searchTerm: typeof rawSearchTerm === "string" ? rawSearchTerm : "",
    });
    res.json({ ok: true, data });
  })
);

tripMemberRouter.post(
  "/:tripId/members/invite",
  requireAuth,
  wrapAsync(async (req, res) => {
    const tripId = Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId;
    const data = await tripMembersService.inviteMember(req.user!.sub, tripId, req.body);
    res.status(201).json({ ok: true, data });
  })
);

// tripMemberRouter.post(
//   "/:tripId/invitations/accept", 
//   requireAuth,
//   wrapAsync(async (req, res) => {
//     const tripId = Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId;
//     const data = await tripMembersService.acceptInvitation(req.user!.sub, tripId);
//     res.json({ ok: true, data });
//   })
// );

// tripMemberRouter.post(
//   "/:tripId/invitations/reject",
//   requireAuth,
//   wrapAsync(async (req, res) => {
//     const tripId = Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId;
//     const data = await tripMembersService.rejectInvitation(req.user!.sub, tripId);
//     res.json({ ok: true, data });
//   })
// );

tripMemberRouter.delete(
  "/:tripId/invitations/:userId",
  requireAuth,
  wrapAsync(async (req, res) => {
    const tripId = Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId;
    const rawUserId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
    await tripMembersService.uninviteMember(req.user!.sub, tripId, Number(rawUserId));
    res.json({ ok: true });
  })
);

tripMemberRouter.patch(
  "/:tripId/members/leave",
  requireAuth,
  wrapAsync(async (req, res) => {
    const tripId = Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId;
    const data = await tripMembersService.leaveTrip(req.user!.sub, tripId);
    res.json({ ok: true, data });
  })
);

tripMemberRouter.patch(
  "/:tripId/members/:userId/leave",
  requireAuth,
  wrapAsync(async (req, res) => {
    const tripId = Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId;
    const rawUserId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
    const data = await tripMembersService.leaveTripByUserId(req.user!.sub, tripId, Number(rawUserId));
    res.json({ ok: true, data });
  })
);

tripMemberRouter.delete(
  "/:tripId/members/:userId",
  requireAuth,
  wrapAsync(async (req, res) => {
    const tripId = Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId;
    const rawUserId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
    const data = await tripMembersService.removeMember(req.user!.sub, tripId, String(rawUserId));
    res.json({ ok: true, data });
  })
);
