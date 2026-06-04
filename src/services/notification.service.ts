import { NotificationType, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../database/client.js";
import { logger } from "../utils/logger.js";
import { getFirebaseApp } from "../integrations/firebase.js";

const notificationQuerySchema = z.object({
  tab: z.enum(["all", "unread"]).default("all"),
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

type NotificationData = Prisma.InputJsonObject;

type RecipientWithNotification = Prisma.NotificationRecipientGetPayload<{
  include: {
    notification: true;
  };
}>;

export const notificationService = {
  async createNotification(params: {
    type: NotificationType;
    actorId?: number | null;
    targetId?: string | null;
    title?: string | null;
    body?: string | null;
    data?: NotificationData | null;
    recipientUserIds: number[];
  }) {
    const recipientUserIds = uniqueNumbers(params.recipientUserIds);
    if (recipientUserIds.length === 0) {
      return null;
    }

    const notification = await prisma.notification.create({
      data: {
        type: params.type,
        actorId: params.actorId ?? null,
        targetId: params.targetId ?? null,
        title: params.title ?? null,
        body: params.body ?? null,
        data: params.data ?? Prisma.JsonNull,
        recipients: {
          createMany: {
            data: recipientUserIds.map((userId) => ({ userId })),
            skipDuplicates: true,
          },
        },
      },
      include: { recipients: true },
    });

    // Send push notifications
    await this.sendPushNotification({
      recipientUserIds,
      title: params.title ?? "Notification",
      body: params.body ?? "",
      data: params.data ? params.data as Record<string, string> : undefined,
    });

    return notification;
  },

  async sendPushNotification(params: {
    recipientUserIds: number[];
    title: string;
    body: string;
    data?: Record<string, string>;
  }) {
    const app = getFirebaseApp();
    if (!app) return; // Firebase not configured, skip push

    const users = await prisma.user.findMany({
      where: { id: { in: params.recipientUserIds }, fcmToken: { not: null } },
      select: { fcmToken: true },
    });

    const tokens = users.map((u) => u.fcmToken!).filter(Boolean);
    if (!tokens.length) return;

    try {
      const response = await app.messaging().sendEachForMulticast({
        notification: { title: params.title, body: params.body },
        data: params.data || {},
        tokens,
      });
      logger.info({ successCount: response.successCount, failureCount: response.failureCount }, "Push notifications sent");
    } catch (error) {
      logger.error({ error }, "Failed to send push notifications");
    }
  },

  async getUserNotifications(userId: number, query: unknown) {
    const input = notificationQuerySchema.parse(query);
    try {
      const recipients = await prisma.notificationRecipient.findMany({
        where: {
          userId,
          ...(input.tab === "unread" ? { isRead: false } : {}),
        },
        include: { notification: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: input.offset,
        take: input.limit,
      });

      return recipients.map(mapUserNotification);
    } catch {
      return listPendingInviteNotificationFallback(userId, input.limit, input.offset);
    }
  },

  async unreadCount(userId: number) {
    return prisma.notificationRecipient.count({
      where: { userId, isRead: false },
    });
  },

  async markRead(userId: number, recipientId: string) {
    const recipient = await assertUserRecipient(userId, recipientId);
    if (recipient.isRead) {
      return mapUserNotification(recipient);
    }

    const updated = await prisma.notificationRecipient.update({
      where: { id: recipient.id },
      data: {
        isRead: true,
        readAt: new Date(),
      },
      include: { notification: true },
    });

    return mapUserNotification(updated);
  },

  async markAllRead(userId: number) {
    await prisma.notificationRecipient.updateMany({
      where: { userId, isRead: false },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
    return { ok: true };
  },

  async deleteUserNotification(userId: number, recipientId: string) {
    const deleted = await prisma.notificationRecipient.deleteMany({
      where: { id: recipientId, userId },
    });
    if (deleted.count === 0) {
      throw Object.assign(new Error("NOTIFICATION_NOT_FOUND"), { statusCode: 404 });
    }
    return { ok: true };
  },

  async acceptInvite(userId: number, recipientId: string) {
    const recipient = await assertUserRecipient(userId, recipientId);
    assertType(recipient, "invited");
    const tripId = getTripId(recipient);

    const { tripMembersService } = await import("./tripMembers.services.js");
    const data = await tripMembersService.acceptInvitation(userId, tripId);
    await deleteNotificationWithRecipient(recipient.notificationId);
    return { ok: true, data };
  },

  async declineInvite(userId: number, recipientId: string) {
    const recipient = await assertUserRecipient(userId, recipientId);
    assertType(recipient, "invited");
    const tripId = getTripId(recipient);

    const { tripMembersService } = await import("./tripMembers.services.js");
    const data = await tripMembersService.rejectInvitation(userId, tripId);
    await deleteNotificationWithRecipient(recipient.notificationId);
    return { ok: true, data };
  },

  async createTripInviteNotification(params: {
    recipientUserId: number;
    invitedByUserId: number;
    tripId: string;
  }) {
    const [trip, inviter] = await Promise.all([
      prisma.trip.findUnique({
        where: { id: params.tripId },
        select: {
          id: true,
          title: true,
          startDate: true,
          endDate: true,
        },
      }),
      prisma.user.findUnique({
        where: { id: params.invitedByUserId },
        select: {
          email: true,
          fullName: true,
          username: true,
        },
      }),
    ]);

    if (!trip) {
      throw Object.assign(new Error("TRIP_NOT_FOUND"), { statusCode: 404 });
    }

    const username = inviter?.fullName ?? inviter?.username ?? inviter?.email ?? "Traveler";
    const days = daysBetweenInclusive(trip.startDate, trip.endDate);

    const notification = await this.createNotification({
      type: "invited",
      actorId: params.invitedByUserId,
      targetId: trip.id,
      title: "Trip invitation",
      body: `${username} invited you to ${trip.title}`,
      data: {
        tripId: trip.id,
        username,
        itineraryName: trip.title,
        days,
      },
      recipientUserIds: [params.recipientUserId],
    });

    const recipient = notification?.recipients[0];
    return {
      id: recipient?.id ?? notification?.id,
      notificationId: notification?.id,
      type: "invited",
      targetId: trip.id,
      time: notification?.createdAt ?? new Date(),
      unread: true,
      username,
      itineraryName: trip.title,
      days,
    };
  },

  async createTripInvitationNotification(params: {
    recipientUserId: number;
    invitedByUserId: number;
    tripId: string;
  }) {
    return this.createTripInviteNotification(params);
  },

  async createPromotionNotification(params: {
    ownerId?: number | null;
    placeId: string;
    promotionId?: string | null;
    discount?: number | null;
  }) {
    const [place, favorites] = await Promise.all([
      prisma.place.findUnique({
        where: { id: params.placeId },
        select: { id: true, name: true },
      }),
      prisma.favorite.findMany({
        where: { placeId: params.placeId },
        select: { userId: true },
      }),
    ]);
    if (!place) {
      throw Object.assign(new Error("PLACE_NOT_FOUND"), { statusCode: 404 });
    }

    const recipientUserIds = uniqueNumbers(favorites.map((favorite) => favorite.userId));
    if (params.ownerId) {
      removeNumber(recipientUserIds, params.ownerId);
    }
    if (recipientUserIds.length === 0) {
      return null;
    }

    const existingRecipients = await prisma.notificationRecipient.findMany({
      where: {
        userId: { in: recipientUserIds },
        notification: {
          type: "promotion",
          targetId: place.id,
          data:
            params.promotionId !== undefined && params.promotionId !== null
              ? { path: ["promotionId"], equals: params.promotionId }
              : undefined,
        },
      },
      select: { userId: true },
    });
    const existingUserIds = new Set(existingRecipients.map((recipient) => recipient.userId));
    const newRecipientUserIds = recipientUserIds.filter((userId) => !existingUserIds.has(userId));

    return this.createNotification({
      type: "promotion",
      actorId: params.ownerId ?? null,
      targetId: place.id,
      title: "New promotion",
      body: `New promotion at ${place.name}`,
      data: {
        placeName: place.name,
        discount: params.discount ?? 0,
        ...(params.promotionId ? { promotionId: params.promotionId } : {}),
      },
      recipientUserIds: newRecipientUserIds,
    });
  },

  async createTripDiaryUpdateNotification(params: {
    actorId: number;
    tripId: string;
    diaryEntryId: string;
  }) {
    const trip = await prisma.trip.findUnique({
      where: { id: params.tripId },
      select: {
        id: true,
        title: true,
        userId: true,
        members: {
          where: { status: "ACTIVE", userId: { not: null } },
          select: { userId: true },
        },
      },
    });
    if (!trip) {
      throw Object.assign(new Error("TRIP_NOT_FOUND"), { statusCode: 404 });
    }

    const recipientUserIds = uniqueNumbers([
      trip.userId,
      ...trip.members
        .map((member) => member.userId)
        .filter((memberUserId): memberUserId is number => memberUserId !== null),
    ]).filter((recipientUserId) => recipientUserId !== params.actorId);

    return this.createNotification({
      type: "like_comment",
      actorId: params.actorId,
      targetId: params.tripId,
      title: "Trip diary updated",
      body: `${trip.title} has a new diary update`,
      data: {
        itineraryName: trip.title,
        diaryEntryId: params.diaryEntryId,
      },
      recipientUserIds,
    });
  },

  async createReviewLikeNotification(params: {
    actorId: number;
    reviewId: string;
  }) {
    const review = await prisma.review.findUnique({
      where: { id: params.reviewId },
      include: {
        place: { select: { id: true, name: true } },
      },
    });
    if (!review) {
      throw Object.assign(new Error("REVIEW_NOT_FOUND"), { statusCode: 404 });
    }
    if (review.userId === params.actorId) {
      return null;
    }

    const existing = await prisma.notificationRecipient.findFirst({
      where: {
        userId: review.userId,
        notification: {
          type: "like_comment",
          actorId: params.actorId,
          data: { path: ["reviewId"], equals: review.id },
        },
      },
      select: { id: true },
    });
    if (existing) {
      return null;
    }

    return this.createNotification({
      type: "like_comment",
      actorId: params.actorId,
      targetId: review.placeId,
      title: "Review liked",
      body: `Someone liked your review of ${review.place.name}`,
      data: {
        placeName: review.place.name,
        reviewId: review.id,
      },
      recipientUserIds: [review.userId],
    });
  },

  async createUpcomingTripNotification(params: {
    userId: number;
    tripId: string;
    days: number;
  }) {
    const trip = await prisma.trip.findFirst({
      where: {
        id: params.tripId,
        OR: [
          { userId: params.userId },
          { members: { some: { userId: params.userId, status: "ACTIVE" } } },
        ],
      },
      select: { id: true, title: true },
    });
    if (!trip) {
      throw Object.assign(new Error("TRIP_NOT_FOUND"), { statusCode: 404 });
    }

    const existing = await prisma.notificationRecipient.findFirst({
      where: {
        userId: params.userId,
        notification: {
          type: "upcoming",
          targetId: trip.id,
          data: { path: ["days"], equals: params.days },
        },
      },
      select: { id: true },
    });
    if (existing) {
      return null;
    }

    return this.createNotification({
      type: "upcoming",
      targetId: trip.id,
      title: "Upcoming trip",
      body: `${trip.title} starts in ${params.days} day(s)`,
      data: {
        itineraryName: trip.title,
        days: params.days,
      },
      recipientUserIds: [params.userId],
    });
  },

  async generateUpcomingTripNotifications(daysBefore = [1, 3]) {
    const today = startOfUtcDay(new Date());
    let created = 0;

    for (const days of daysBefore) {
      const startDate = addDays(today, days);
      const endDate = addDays(startDate, 1);
      const trips = await prisma.trip.findMany({
        where: {
          startDate: {
            gte: startDate,
            lt: endDate,
          },
        },
        select: {
          id: true,
          userId: true,
          members: {
            where: { status: "ACTIVE", userId: { not: null } },
            select: { userId: true },
          },
        },
      });

      for (const trip of trips) {
        const userIds = uniqueNumbers([
          trip.userId,
          ...trip.members
            .map((member) => member.userId)
            .filter((memberUserId): memberUserId is number => memberUserId !== null),
        ]);
        for (const userId of userIds) {
          const notification = await this.createUpcomingTripNotification({
            userId,
            tripId: trip.id,
            days,
          });
          if (notification) {
            created += 1;
          }
        }
      }
    }

    return { created };
  },
};

function mapUserNotification(recipient: RecipientWithNotification) {
  const data = normalizeData(recipient.notification.data);
  return {
    id: recipient.id,
    notificationId: recipient.notificationId,
    type: recipient.notification.type,
    targetId: recipient.notification.targetId,
    title: recipient.notification.title,
    body: recipient.notification.body,
    time: recipient.notification.createdAt,
    createdAt: recipient.notification.createdAt,
    unread: !recipient.isRead,
    ...data,
  };
}

async function listPendingInviteNotificationFallback(userId: number, limit: number, offset: number) {
  const members = await prisma.tripMember.findMany({
    where: {
      userId,
      status: "PENDING",
    },
    include: {
      trip: {
        select: {
          id: true,
          title: true,
          startDate: true,
          endDate: true,
        },
      },
      invitedBy: {
        select: {
          email: true,
          fullName: true,
          username: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    skip: offset,
    take: limit,
  });

  return members.map((member) => ({
    id: member.id,
    type: "invited",
    targetId: member.tripId,
    time: member.createdAt,
    createdAt: member.createdAt,
    unread: true,
    username:
      member.invitedBy?.fullName ??
      member.invitedBy?.username ??
      member.invitedBy?.email ??
      "Traveler",
    itineraryName: member.trip.title,
    days: daysBetweenInclusive(member.trip.startDate, member.trip.endDate),
  }));
}

async function assertUserRecipient(userId: number, recipientId: string) {
  const recipient = await prisma.notificationRecipient.findFirst({
    where: {
      userId,
      OR: [
        { id: recipientId },
        { notificationId: recipientId },
      ],
    },
    include: { notification: true },
  });
  if (!recipient) {
    throw Object.assign(new Error("NOTIFICATION_NOT_FOUND"), { statusCode: 404 });
  }
  return recipient;
}

async function deleteNotificationWithRecipient(notificationId: string) {
  await prisma.notification.delete({
    where: { id: notificationId },
  });
}

function assertType(recipient: RecipientWithNotification, type: NotificationType) {
  if (recipient.notification.type !== type) {
    throw Object.assign(new Error("INVALID_NOTIFICATION_TYPE"), { statusCode: 400 });
  }
}

function getTripId(recipient: RecipientWithNotification) {
  const data = normalizeData(recipient.notification.data);
  const tripId = recipient.notification.targetId ?? stringValue(data.tripId);
  if (!tripId) {
    throw Object.assign(new Error("TRIP_NOT_FOUND"), { statusCode: 404 });
  }
  return tripId;
}

function normalizeData(value: Prisma.JsonValue | null): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function uniqueNumbers(values: number[]) {
  return Array.from(new Set(values.filter((value) => Number.isInteger(value) && value > 0)));
}

function removeNumber(values: number[], value: number) {
  const index = values.indexOf(value);
  if (index >= 0) {
    values.splice(index, 1);
  }
}

function daysBetweenInclusive(start: Date, end: Date) {
  const startUtc = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.max(1, Math.floor((endUtc - startUtc) / 86_400_000) + 1);
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, daysToAdd: number) {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + daysToAdd);
  return nextDate;
}
