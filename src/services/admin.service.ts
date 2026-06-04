import { PlaceCategory, PlaceStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../database/client.js";
import { notificationService } from "./notification.service.js";
import type { Pagination } from "../http/pagination.js";

const statusFilterSchema = z.enum(["PENDING", "APPROVED", "REJECTED"]).optional();

const rejectPlaceBodySchema = z.object({
  rejectionReason: z.string().max(500).optional(),
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
};
