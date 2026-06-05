import { PlaceCategory, PlaceStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../database/client.js";
import { notificationService } from "./notification.service.js";
import type { Pagination } from "../http/pagination.js";

const statusFilterSchema = z.enum(["PENDING", "APPROVED", "REJECTED"]).optional();
const roleFilterSchema = z.enum(["TRAVELER", "OWNER", "ADMIN"]).optional();
const bannedFilterSchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true")
  .optional();

const rejectPlaceBodySchema = z.object({
  rejectionReason: z.string().max(500).optional(),
});

const banUserBodySchema = z.object({
  reason: z.string().max(500).optional(),
  isBanned: z.boolean(),
});

const changeUserRoleBodySchema = z.object({
  role: z.enum(["TRAVELER", "OWNER", "ADMIN"]),
});

function toAdminPlaceDto(p: {
  id: string;
  name: string;
  region: string;
  category: PlaceCategory;
  status: PlaceStatus;
  rejectionReason: string | null;
  reviewedAt: Date | null;
  averageRating: number;
  ratingCount: number;
  coverImageUrl: string;
  about: string;
  featureLabel: string;
  owner: {
    id: number;
    fullName: string | null;
    username: string | null;
    email: string;
  } | null;
  images: { url: string }[];
}) {
  return {
    Id: p.id,
    Name: p.name,
    Region: p.region,
    Category: p.category,
    Status: p.status,
    RejectionReason: p.rejectionReason,
    ReviewedAt: p.reviewedAt?.toISOString() ?? null,
    AverageRating: p.averageRating,
    RatingCount: p.ratingCount,
    CoverImageUrl: p.coverImageUrl,
    About: p.about,
    FeatureLabel: p.featureLabel,
    Images: [p.coverImageUrl, ...p.images.map((img) => img.url)],
    Owner: p.owner
      ? {
          Id: p.owner.id,
          Name: p.owner.fullName || p.owner.username || p.owner.email,
          Email: p.owner.email,
        }
      : null,
  };
}

export const adminService = {
  async listPlaces(
    query: Record<string, string | undefined>,
    _adminId: number,
    paging: Pagination
  ) {
    const statusRaw = query.status;
    const status = statusRaw
      ? (statusFilterSchema.parse(statusRaw) as PlaceStatus)
      : undefined;

    const where = status ? { status } : {};

    const [total, list] = await Promise.all([
      prisma.place.count({ where }),
      prisma.place.findMany({
        where,
        orderBy: [{ status: "asc" }, { name: "asc" }],
        include: {
          owner: {
            select: { id: true, fullName: true, username: true, email: true },
          },
          images: { orderBy: { createdAt: "asc" } },
        },
        skip: paging.offset,
        take: paging.limit,
      }),
    ]);

    return {
      items: list.map(toAdminPlaceDto),
      total,
      limit: paging.limit,
      offset: paging.offset,
    };
  },

  async approvePlace(adminId: number, placeId: string) {
    const place = await prisma.place.findUnique({
      where: { id: placeId },
      select: { id: true, status: true, ownerId: true, name: true },
    });

    if (!place) {
      throw Object.assign(new Error("PLACE_NOT_FOUND"), { statusCode: 404 });
    }

    if (place.status !== "PENDING") {
      throw Object.assign(new Error("PLACE_NOT_PENDING"), { statusCode: 400 });
    }

    const updated = await prisma.place.update({
      where: { id: placeId },
      data: {
        status: "APPROVED",
        reviewedAt: new Date(),
        reviewedBy: adminId,
        rejectionReason: null,
      },
    });

    // Notify owner
    if (place.ownerId) {
      try {
        await notificationService.createNotification({
          type: "place_approved",
          actorId: adminId,
          targetId: placeId,
          title: "Place Approved",
          body: `Your place "${place.name}" has been approved and is now visible to travelers.`,
          data: { placeName: place.name, placeId },
          recipientUserIds: [place.ownerId],
        });
      } catch {
        /* notification failure is non-critical */
      }
    }

    return { ok: true, placeId: updated.id };
  },

  async rejectPlace(adminId: number, placeId: string, body: unknown) {
    const data = rejectPlaceBodySchema.parse(body);

    const place = await prisma.place.findUnique({
      where: { id: placeId },
      select: { id: true, status: true, ownerId: true, name: true },
    });

    if (!place) {
      throw Object.assign(new Error("PLACE_NOT_FOUND"), { statusCode: 404 });
    }

    if (place.status !== "PENDING") {
      throw Object.assign(new Error("PLACE_NOT_PENDING"), { statusCode: 400 });
    }

    const reason =
      data.rejectionReason?.trim() || "Does not meet our quality standards.";

    const updated = await prisma.place.update({
      where: { id: placeId },
      data: {
        status: "REJECTED",
        reviewedAt: new Date(),
        reviewedBy: adminId,
        rejectionReason: reason,
      },
    });

    // Notify owner
    if (place.ownerId) {
      try {
        await notificationService.createNotification({
          type: "place_rejected",
          actorId: adminId,
          targetId: placeId,
          title: "Place Rejected",
          body: `Your place "${place.name}" was not approved. Reason: ${reason}`,
          data: { placeName: place.name, placeId, rejectionReason: reason },
          recipientUserIds: [place.ownerId],
        });
      } catch {
        /* notification failure is non-critical */
      }
    }

    return { ok: true, placeId: updated.id };
  },

  async deletePlace(_adminId: number, placeId: string) {
    const place = await prisma.place.findUnique({
      where: { id: placeId },
      select: { id: true },
    });

    if (!place) {
      throw Object.assign(new Error("PLACE_NOT_FOUND"), { statusCode: 404 });
    }

    await prisma.place.delete({ where: { id: placeId } });
    return { ok: true };
  },

  async listUsers(
    query: Record<string, string | undefined>,
    _adminId: number,
    paging: Pagination
  ) {
    const searchRaw = query.search;
    const roleRaw = query.role;
    const isBannedRaw = query.isBanned;
    const role = roleRaw
      ? (roleFilterSchema.parse(roleRaw) as UserRole)
      : undefined;
    const isBanned = isBannedRaw
      ? bannedFilterSchema.parse(isBannedRaw)
      : undefined;

    const where: {
      role?: UserRole;
      isBanned?: boolean;
      OR?: Array<{
        username?: { contains: string; mode: "insensitive" };
        email?: { contains: string; mode: "insensitive" };
        fullName?: { contains: string; mode: "insensitive" };
      }>;
    } = {};

    if (role) {
      where.role = role;
    }

    if (isBanned !== undefined) {
      where.isBanned = isBanned;
    }

    if (searchRaw) {
      where.OR = [
        { username: { contains: searchRaw, mode: "insensitive" } },
        { email: { contains: searchRaw, mode: "insensitive" } },
        { fullName: { contains: searchRaw, mode: "insensitive" } },
      ];
    }

    const [total, list] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          username: true,
          email: true,
          fullName: true,
          role: true,
          isBanned: true,
          createdAt: true,
          _count: {
            select: {
              ownedPlaces: true,
              reviews: true,
            },
          },
        },
        skip: paging.offset,
        take: paging.limit,
      }),
    ]);

    return {
      items: list.map((u) => ({
        id: u.id,
        username: u.username,
        email: u.email,
        fullName: u.fullName,
        role: u.role,
        isBanned: u.isBanned,
        createdAt: u.createdAt.toISOString(),
        ownedPlacesCount: u._count.ownedPlaces,
        reviewsCount: u._count.reviews,
      })),
      total,
      limit: paging.limit,
      offset: paging.offset,
    };
  },

  async banUser(adminId: number, userId: string, body: unknown) {
    const data = banUserBodySchema.parse(body);
    const targetUserId = parseInt(userId, 10);

    if (isNaN(targetUserId)) {
      throw Object.assign(new Error("INVALID_USER_ID"), { statusCode: 400 });
    }

    // Cannot ban self
    if (targetUserId === adminId) {
      throw Object.assign(new Error("CANNOT_BAN_SELF"), { statusCode: 400 });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, role: true },
    });

    if (!targetUser) {
      throw Object.assign(new Error("USER_NOT_FOUND"), { statusCode: 404 });
    }

    // Cannot ban other admins
    if (targetUser.role === "ADMIN") {
      throw Object.assign(new Error("CANNOT_BAN_ADMIN"), { statusCode: 400 });
    }

    const updateData: {
      isBanned: boolean;
      banReason?: string | null;
      bannedAt?: Date | null;
    } = {
      isBanned: data.isBanned,
    };

    if (data.isBanned) {
      updateData.banReason = data.reason || "Violation of community guidelines.";
      updateData.bannedAt = new Date();
    } else {
      updateData.banReason = null;
      updateData.bannedAt = null;
    }

    await prisma.user.update({
      where: { id: targetUserId },
      data: updateData,
    });

    if (data.isBanned) {
      await prisma.refreshToken.deleteMany({ where: { userId: targetUserId } });
    }

    return { ok: true, userId: targetUserId };
  },

  async changeUserRole(adminId: number, userId: string, body: unknown) {
    const data = changeUserRoleBodySchema.parse(body);
    const targetUserId = parseInt(userId, 10);

    if (isNaN(targetUserId)) {
      throw Object.assign(new Error("INVALID_USER_ID"), { statusCode: 400 });
    }

    // Cannot change own role
    if (targetUserId === adminId) {
      throw Object.assign(new Error("CANNOT_CHANGE_OWN_ROLE"), { statusCode: 400 });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, role: true },
    });

    if (!targetUser) {
      throw Object.assign(new Error("USER_NOT_FOUND"), { statusCode: 404 });
    }

    await prisma.user.update({
      where: { id: targetUserId },
      data: { role: data.role as UserRole },
    });

    return { ok: true, userId: targetUserId };
  },
};
