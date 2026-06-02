import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../database/client.js";
import { notificationService } from "./notification.service.js";
import { mapTrip, type TripWithDetails } from "./trips.service.js";

const activeMemberStatus = "ACTIVE" as const;
const pendingMemberStatus = "PENDING" as const;

const tripInviteSchema = z
  .object({
    userId: z.coerce.number().int().positive(),
  })
  .strict();

const memberRecommendationSearchSchema = z
  .object({
    userId: z.coerce.number().int().positive(),
    tripId: z.string().min(1),
    searchTerm: z.string().trim().default(""),
  })
  .strict();

const tripInvitationInclude = Prisma.validator<Prisma.TripMemberInclude>()({
  trip: {
    include: {
      currentHotelPlace: {
        select: {
          id: true,
          name: true,
          region: true,
          coverImageUrl: true,
        },
      },
      days: {
        orderBy: { dayNumber: "asc" },
        include: {
          activities: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            include: {
              place: {
                select: {
                  id: true,
                  name: true,
                  region: true,
                  coverImageUrl: true,
                  averageRating: true,
                },
              },
            },
          },
        },
      },
    },
  },
  invitedBy: {
    select: {
      id: true,
      email: true,
      fullName: true,
      username: true,
      avatarUrl: true,
    },
  },
});

export const tripMembersService = {
  async listMemberRecommendations(params: unknown) {
    const input = memberRecommendationSearchSchema.parse(params);

    const [user, trip] = await Promise.all([
      prisma.user.findUnique({
        where: { id: input.userId },
        select: { id: true },
      }),
      prisma.trip.findUnique({
        where: { id: input.tripId },
        select: { id: true },
      }),
    ]);

    if (!user) {
      throw Object.assign(new Error("USER_NOT_FOUND"), { statusCode: 404 });
    }
    if (!trip) {
      throw Object.assign(new Error("TRIP_NOT_FOUND"), { statusCode: 404 });
    }

    const searchFilter = input.searchTerm
      ? Prisma.sql`AND (
          u."fullName" ILIKE ${`%${input.searchTerm}%`}
          OR u."username" ILIKE ${`%${input.searchTerm}%`}
          OR u."email" ILIKE ${`%${input.searchTerm}%`}
        )`
      : Prisma.empty;

    const recommendations = await prisma.$queryRaw<
      Array<{
        userId: number;
        name: string;
        avatarUrl: string | null;
        commonTripCount: number;
        isInvitedByUser: boolean;
      }>
    >`
      WITH "targetTrips" AS (
        SELECT t."id" AS "tripId"
        FROM "Trip" t
        WHERE t."userId" = ${input.userId}

        UNION

        SELECT tm."tripId"
        FROM "TripMember" tm
        WHERE tm."userId" = ${input.userId}
          AND tm."status" = ${activeMemberStatus}::"TripMemberStatus"
      ),
      "candidateTripUsers" AS (
        SELECT t."id" AS "tripId", t."userId" AS "userId"
        FROM "Trip" t
        INNER JOIN "targetTrips" tt ON tt."tripId" = t."id"
        WHERE t."userId" <> ${input.userId}

        UNION

        SELECT tm."tripId", tm."userId"
        FROM "TripMember" tm
        INNER JOIN "targetTrips" tt ON tt."tripId" = tm."tripId"
        WHERE tm."userId" IS NOT NULL
          AND tm."userId" <> ${input.userId}
          AND tm."status" = ${activeMemberStatus}::"TripMemberStatus"
      ),
      "currentTripUsers" AS (
        SELECT t."userId" AS "userId"
        FROM "Trip" t
        WHERE t."id" = ${input.tripId}

        UNION

        SELECT tm."userId"
        FROM "TripMember" tm
        WHERE tm."tripId" = ${input.tripId}
          AND tm."userId" IS NOT NULL
          AND tm."status" = ${activeMemberStatus}::"TripMemberStatus"
      ),
      "commonCounts" AS (
        SELECT ctu."userId", COUNT(DISTINCT ctu."tripId")::int AS "commonTripCount"
        FROM "candidateTripUsers" ctu
        LEFT JOIN "currentTripUsers" current_users ON current_users."userId" = ctu."userId"
        WHERE current_users."userId" IS NULL
        GROUP BY ctu."userId"
      ),
      "candidateUsers" AS (
        SELECT u."id" AS "userId"
        FROM "User" u
        LEFT JOIN "currentTripUsers" current_users ON current_users."userId" = u."id"
        WHERE u."id" <> ${input.userId}
          AND current_users."userId" IS NULL
      )
      SELECT
        u."id" AS "userId",
        COALESCE(u."fullName", u."username", u."email") AS "name",
        u."avatarUrl" AS "avatarUrl",
        COALESCE(cc."commonTripCount", 0)::int AS "commonTripCount",
        COALESCE(
          current_member."status" = ${pendingMemberStatus}::"TripMemberStatus"
          AND current_member."invitedById" = ${input.userId},
          FALSE
        ) AS "isInvitedByUser"
      FROM "candidateUsers" cu
      INNER JOIN "User" u ON u."id" = cu."userId"
      LEFT JOIN "commonCounts" cc ON cc."userId" = u."id"
      LEFT JOIN "TripMember" current_member
        ON current_member."tripId" = ${input.tripId}
        AND current_member."userId" = u."id"
      WHERE TRUE
        ${searchFilter}
      ORDER BY COALESCE(cc."commonTripCount", 0) DESC, "name" ASC, u."id" ASC
      LIMIT 3
    `;

    return recommendations;
  },

  async inviteMember(userId: number, tripId: string, body: unknown) {
    const input = tripInviteSchema.parse(body);
    if (input.userId === userId) {
      throw Object.assign(new Error("CANNOT_INVITE_SELF"), { statusCode: 400 });
    }

    await assertCanEditTrip(userId, tripId);

    const invitedUser = await prisma.user.findUnique({
      where: { id: input.userId },
      select: {
        id: true,
        fullName: true,
        username: true,
        avatarUrl: true,
      },
    });
    if (!invitedUser) {
      throw Object.assign(new Error("MEMBER_NOT_FOUND"), { statusCode: 404 });
    }

    const existing = await prisma.tripMember.findUnique({
      where: { tripId_userId: { tripId, userId: input.userId } },
    });

    if (existing?.status === activeMemberStatus) {
      throw Object.assign(new Error("ALREADY_TRIP_MEMBER"), { statusCode: 409 });
    }

    const now = new Date();
    const member = existing
      ? await prisma.tripMember.update({
          where: { id: existing.id },
          data: {
            status: pendingMemberStatus,
            invitedById: userId,
            name: invitedUser.fullName ?? invitedUser.username ?? null,
            avatarUrl: invitedUser.avatarUrl ?? null,
            joinedAt: null,
            leftAt: null,
            inviteAcceptedAt: null,
            inviteRejectedAt: null,
            removedAt: null,
          },
          include: tripInvitationInclude,
        })
      : await prisma.tripMember.create({
          data: {
            tripId,
            userId: input.userId,
            invitedById: userId,
            name: invitedUser.fullName ?? invitedUser.username ?? null,
            avatarUrl: invitedUser.avatarUrl ?? null,
            status: pendingMemberStatus,
            createdAt: now,
          },
          include: tripInvitationInclude,
        });

    const notification = await createNotificationSideEffect(() => notificationService.createTripInvitationNotification({
      recipientUserId: input.userId,
      invitedByUserId: userId,
      tripId,
    })) ?? mapTripInviteNotificationFallback(member);

    return {
      ...mapTripInvitation(member),
      notification,
    };
  },

  async listInvitationsForUser(userId: number) {
    const invitations = await prisma.tripMember.findMany({
      where: {
        userId,
        status: pendingMemberStatus,
      },
      include: tripInvitationInclude,
      orderBy: { createdAt: "desc" },
    });

    return invitations.map(mapTripInvitation);
  },

  async acceptInvitation(userId: number, tripId: string) {
    const member = await getUserTripMember(userId, tripId);
    if (!member) {
      throw Object.assign(new Error("INVITATION_NOT_FOUND"), { statusCode: 404 });
    }
    if (member.status !== pendingMemberStatus) {
      throw Object.assign(new Error("INVITATION_NOT_PENDING"), { statusCode: 400 });
    }

    const now = new Date();
    const updated = await prisma.tripMember.update({
      where: { id: member.id },
      data: {
        status: activeMemberStatus,
        joinedAt: now,
        inviteAcceptedAt: now,
        inviteRejectedAt: null,
        leftAt: null,
        removedAt: null,
      },
      include: tripInvitationInclude,
    });

    return mapTripInvitation(updated);
  },

  async rejectInvitation(userId: number, tripId: string) {
    const member = await getUserTripMember(userId, tripId);
    if (!member) {
      throw Object.assign(new Error("INVITATION_NOT_FOUND"), { statusCode: 404 });
    }
    if (member.status !== pendingMemberStatus) {
      throw Object.assign(new Error("INVITATION_NOT_PENDING"), { statusCode: 400 });
    }

    const updated = await prisma.tripMember.update({
      where: { id: member.id },
      data: {
        status: "REJECTED",
        inviteRejectedAt: new Date(),
      },
      include: tripInvitationInclude,
    });

    return mapTripInvitation(updated);
  },

  async uninviteMember(userId: number, tripId: string, memberUserId: number) {
    if (memberUserId === userId) {
      throw Object.assign(new Error("CANNOT_UNINVITE_SELF"), { statusCode: 400 });
    }

    await assertCanEditTrip(userId, tripId);

    const member = await prisma.tripMember.findUnique({
      where: { tripId_userId: { tripId, userId: memberUserId } },
      select: { id: true, status: true },
    });
    if (!member) {
      throw Object.assign(new Error("INVITATION_NOT_FOUND"), { statusCode: 404 });
    }
    if (member.status !== pendingMemberStatus) {
      throw Object.assign(new Error("INVITATION_NOT_PENDING"), { statusCode: 400 });
    }

    await prisma.tripMember.update({
      where: { id: member.id },
      data: {
        status: "REMOVED",
        removedAt: new Date(),
      },
    });
  },

  async removeMember(userId: number, tripId: string, memberUserId: number) {
    const trip = await assertTripOwner(userId, tripId);
    if (memberUserId === trip.userId) {
      throw Object.assign(new Error("CANNOT_REMOVE_OWNER"), { statusCode: 400 });
    }

    const member = await prisma.tripMember.findUnique({
      where: { tripId_userId: { tripId, userId: memberUserId } },
      select: { id: true, status: true },
    });
    if (!member) {
      throw Object.assign(new Error("TRIP_MEMBER_NOT_FOUND"), { statusCode: 404 });
    }
    if (member.status !== activeMemberStatus) {
      throw Object.assign(new Error("TRIP_MEMBER_NOT_ACTIVE"), { statusCode: 400 });
    }

    const updated = await prisma.tripMember.update({
      where: { id: member.id },
      data: {
        status: "REMOVED",
        removedAt: new Date(),
      },
      include: tripInvitationInclude,
    });

    return mapTripInvitation(updated);
  },

  async leaveTrip(userId: number, tripId: string) {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      select: { id: true, userId: true },
    });
    if (!trip) {
      throw Object.assign(new Error("TRIP_NOT_FOUND"), { statusCode: 404 });
    }
    if (trip.userId === userId) {
      throw Object.assign(new Error("OWNER_CANNOT_LEAVE_TRIP"), { statusCode: 400 });
    }

    const member = await getUserTripMember(userId, tripId);
    if (!member || member.status !== activeMemberStatus) {
      throw Object.assign(new Error("TRIP_MEMBER_NOT_FOUND"), { statusCode: 404 });
    }

    const updated = await prisma.tripMember.update({
      where: { id: member.id },
      data: {
        status: "LEFT",
        leftAt: new Date(),
      },
      include: tripInvitationInclude,
    });

    return mapTripInvitation(updated);
  },
};

type TripInvitationWithDetails = Prisma.TripMemberGetPayload<{ include: typeof tripInvitationInclude }>;

async function assertTripOwner(userId: number, tripId: string) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { id: true, userId: true },
  });

  if (!trip) {
    throw Object.assign(new Error("TRIP_NOT_FOUND"), { statusCode: 404 });
  }
  if (trip.userId !== userId) {
    throw Object.assign(new Error("FORBIDDEN"), { statusCode: 403 });
  }

  return trip;
}

async function assertCanEditTrip(userId: number, tripId: string) {
  const trip = await prisma.trip.findFirst({
    where: {
      id: tripId,
      OR: [
        { userId },
        {
          members: {
            some: {
              userId,
              status: activeMemberStatus,
            },
          },
        },
      ],
    },
    select: { id: true },
  });

  if (!trip) {
    const exists = await prisma.trip.findUnique({ where: { id: tripId }, select: { id: true } });
    throw Object.assign(new Error(exists ? "FORBIDDEN" : "TRIP_NOT_FOUND"), {
      statusCode: exists ? 403 : 404,
    });
  }
}

async function getUserTripMember(userId: number, tripId: string) {
  return prisma.tripMember.findUnique({
    where: { tripId_userId: { tripId, userId } },
  });
}

function mapTripInvitation(member: TripInvitationWithDetails) {
  return {
    id: member.id,
    tripId: member.tripId,
    userId: member.userId,
    invitedById: member.invitedById,
    status: member.status,
    name: member.name,
    avatarUrl: member.avatarUrl,
    joinedAt: member.joinedAt,
    leftAt: member.leftAt,
    inviteAcceptedAt: member.inviteAcceptedAt,
    inviteRejectedAt: member.inviteRejectedAt,
    removedAt: member.removedAt,
    createdAt: member.createdAt,
    trip: mapTrip({
      ...member.trip,
      members: [],
      diaryEntries: [],
    } as TripWithDetails),
    invitedBy: member.invitedBy
      ? {
          id: member.invitedBy.id,
          email: member.invitedBy.email,
          fullName: member.invitedBy.fullName,
          username: member.invitedBy.username,
          avatarUrl: member.invitedBy.avatarUrl,
        }
      : null,
  };
}

function mapTripInviteNotificationFallback(member: TripInvitationWithDetails) {
  return {
    id: member.id,
    type: "invited",
    targetId: member.tripId,
    time: member.createdAt,
    unread: true,
    username:
      member.invitedBy?.fullName ??
      member.invitedBy?.username ??
      member.invitedBy?.email ??
      "Traveler",
    itineraryName: member.trip.title,
    days: daysBetweenInclusive(member.trip.startDate, member.trip.endDate),
  };
}

async function createNotificationSideEffect<T>(factory: () => Promise<T>) {
  try {
    return await factory();
  } catch {
    return null;
  }
}

function daysBetweenInclusive(start: Date, end: Date) {
  const startUtc = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.max(1, Math.floor((endUtc - startUtc) / 86_400_000) + 1);
}
