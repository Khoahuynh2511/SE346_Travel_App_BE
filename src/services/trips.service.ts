import { Prisma, TripMemberStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../database/client.js";
import { tripDiaryService } from "./tripDiary.service.js";

const tripActivityPeriods = ["MORNING", "AFTERNOON", "EVENING", "NIGHT"] as const;
const activeMemberStatus = "ACTIVE" as const;
const viewableMemberStatuses: TripMemberStatus[] = ["ACTIVE", "PENDING"];

const tripMemberSchema = z
  .object({
    userId: z.coerce.number().int().positive().optional(),
    name: z.string().trim().min(1).optional(),
    avatarUrl: z.string().url().optional().nullable(),
  })
  .strict()
  .refine((member) => member.userId !== undefined || Boolean(member.name), {
    message: "MEMBER_NAME_REQUIRED",
  });

const tripLocationSchema = z
  .object({
    id: z.string().optional(),
    placeId: z.string().optional().nullable(),
    title: z.string().trim().min(1),
    description: z.string().optional().nullable(),
    imageUrl: z.string().url().optional().nullable(),
    period: z.enum(tripActivityPeriods).optional(),
    scheduledTime: z.string().optional().nullable(),
    estimatedCost: z.coerce.number().nonnegative().optional(),
    rating: z.coerce.number().min(0).max(5).optional().nullable(),
    sortOrder: z.coerce.number().int().optional(),
  })
  .strict();

const tripPlaceWriteSchema = z
  .object({
    placeId: z.string().trim().min(1),
    title: z.string().trim().min(1).optional(),
    description: z.string().optional().nullable(),
    imageUrl: z.string().url().optional().nullable(),
    period: z.enum(tripActivityPeriods).default("MORNING"),
    scheduledTime: z.string().optional().nullable(),
    estimatedCost: z.coerce.number().nonnegative().default(0),
    rating: z.coerce.number().min(0).max(5).optional().nullable(),
    sortOrder: z.coerce.number().int().positive().optional(),
  })
  .strict();

const tripDaySchema = z
  .object({
    dayId: z.string().optional().nullable(),
    title: z.string().trim().optional(),
    date: z.coerce.date(),
    locations: z.array(tripLocationSchema).default([]),
  })
  .strict();

const tripWriteSchema = z
  .object({
    title: z.string().trim().min(1),
    destination: z.string().trim().optional().nullable(),
    hotel: z.string().trim().optional().nullable(),
    hotelPlaceId: z.string().trim().optional().nullable(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    image: z.string().url().optional().nullable(),
    budget: z.coerce.number().nonnegative().optional(),
    currency: z.string().trim().min(1).default("VND"),
    members: z.array(tripMemberSchema).default([]),
    itineraryData: z.array(tripDaySchema).default([]),
  })
  .strict();

const tripInclude = Prisma.validator<Prisma.TripInclude>()({
  currentHotelPlace: {
    select: {
      id: true,
      name: true,
      region: true,
      coverImageUrl: true,
    },
  },
  members: {
    where: { status: activeMemberStatus },
    orderBy: { createdAt: "asc" },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          fullName: true,
          username: true,
          avatarUrl: true,
        },
      },
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
});

export const tripsService = {
  async listForUser(userId: number) {
    const trips = await prisma.trip.findMany({
      where: {
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
      orderBy: { startDate: "asc" },
      include: tripInclude,
    });

    return trips.map(mapTrip);
  },

  async getForUserById(userId: number, tripId: string) {
    const trip = await prisma.trip.findFirst({
      where: {
        id: tripId,
        OR: [
          { userId },
          {
            members: {
              some: {
                userId,
                status: { in: viewableMemberStatuses },
              },
            },
          },
        ],
      },
      include: tripInclude,
    });

    return trip ? mapTrip(trip) : null;
  },

  async createForUser(userId: number, body: unknown) {
    const input = parseTripInput(body);
    return this.writeTrip(userId, null, input);
  },

  async updateForUser(userId: number, tripId: string, body: unknown) {
    const input = parseTripInput(body);
    return this.writeTrip(userId, tripId, input);
  },

  async deleteForUser(userId: number, tripId: string) {
    const result = await prisma.trip.deleteMany({
      where: {
        id: tripId,
        userId,
      },
    });

    if (result.count === 0) {
      throw Object.assign(new Error("TRIP_NOT_FOUND"), { statusCode: 404 });
    }

    return { id: tripId };
  },

  async listDiaryForUser(userId: number, tripId: string) {
    return tripDiaryService.listForTrip(userId, tripId);
  },

  async createDiaryForUser(userId: number, tripId: string, body: unknown) {
    return tripDiaryService.createForTrip(userId, tripId, body);
  },

  async addPlaceToDayForUser(userId: number, tripId: string, dayId: string, body: unknown) {
    const input = tripPlaceWriteSchema.parse(body);
    const day = await findOwnedTripDay(userId, tripId, dayId);
    const place = await prisma.place.findUnique({
      where: { id: input.placeId },
      select: {
        id: true,
        name: true,
        coverImageUrl: true,
        averageRating: true,
      },
    });

    if (!place) {
      throw Object.assign(new Error("PLACE_NOT_FOUND"), { statusCode: 404 });
    }

    const sortOrder =
      input.sortOrder ??
      ((await prisma.tripActivity.aggregate({
        where: { tripDayId: day.id },
        _max: { sortOrder: true },
      }))._max.sortOrder ?? 0) + 1;

    await prisma.tripActivity.create({
      data: {
        tripDayId: day.id,
        placeId: place.id,
        title: input.title ?? place.name,
        description: input.description ?? null,
        imageUrl: input.imageUrl ?? place.coverImageUrl ?? null,
        period: input.period,
        scheduledTime: input.scheduledTime ?? null,
        estimatedCost: input.estimatedCost,
        rating: input.rating ?? place.averageRating ?? null,
        sortOrder,
      },
    });

    await refreshDayBudget(day.id);
    return getRequiredTripForUser(userId, tripId);
  },

  async removePlaceFromDayForUser(userId: number, tripId: string, dayId: string, placeId: string) {
    const day = await findOwnedTripDay(userId, tripId, dayId);
    const result = await prisma.tripActivity.deleteMany({
      where: {
        tripDayId: day.id,
        placeId,
      },
    });

    if (result.count === 0) {
      throw Object.assign(new Error("TRIP_PLACE_NOT_FOUND"), { statusCode: 404 });
    }

    await refreshDayBudget(day.id);
    return getRequiredTripForUser(userId, tripId);
  },

  async removeActivityFromDayForUser(userId: number, tripId: string, dayId: string, activityId: string) {
    const day = await findOwnedTripDay(userId, tripId, dayId);
    const result = await prisma.tripActivity.deleteMany({
      where: {
        id: activityId,
        tripDayId: day.id,
      },
    });

    if (result.count === 0) {
      throw Object.assign(new Error("TRIP_ACTIVITY_NOT_FOUND"), { statusCode: 404 });
    }

    await refreshDayBudget(day.id);
    return getRequiredTripForUser(userId, tripId);
  },

  async writeTrip(userId: number, tripId: string | null, input: TripInput) {
    if (input.startDate > input.endDate) {
      throw Object.assign(new Error("INVALID_DATE_RANGE"), { statusCode: 400 });
    }

    const existingTrip = tripId
      ? await prisma.trip.findUnique({
          where: { id: tripId },
          include: tripInclude,
        })
      : null;

    if (tripId && !existingTrip) {
      throw Object.assign(new Error("TRIP_NOT_FOUND"), { statusCode: 404 });
    }
    if (tripId) {
      await assertCanEditTrip(userId, tripId);
    }

    const hotelPlace = input.hotelPlaceId
      ? await prisma.place.findUnique({
          where: { id: input.hotelPlaceId },
          select: {
            id: true,
            name: true,
            coverImageUrl: true,
          },
        })
      : null;

    if (input.hotelPlaceId && !hotelPlace) {
      throw Object.assign(new Error("HOTEL_PLACE_NOT_FOUND"), { statusCode: 404 });
    }

    const normalizedMembers = dedupeMembers(input.members);
    const memberUserIds = normalizedMembers
      .map((member) => member.userId)
      .filter((userId): userId is number => userId !== undefined);

    const existingUsers = memberUserIds.length
      ? await prisma.user.findMany({
          where: { id: { in: memberUserIds } },
          select: {
            id: true,
            email: true,
            fullName: true,
            username: true,
            avatarUrl: true,
          },
        })
      : [];

    if (existingUsers.length !== new Set(memberUserIds).size) {
      throw Object.assign(new Error("MEMBER_NOT_FOUND"), { statusCode: 404 });
    }

    const userById = new Map(existingUsers.map((user) => [user.id, user]));
    const dayInputs = buildDayInputs(input, existingTrip);
    const activityPlaceIds = Array.from(
      new Set(
        dayInputs.flatMap((day) =>
          day.locations
            .map((location) => location.placeId)
            .filter((placeId): placeId is string => Boolean(placeId))
        )
      )
    );
    if (activityPlaceIds.length > 0) {
      const activityPlaces = await prisma.place.findMany({
        where: { id: { in: activityPlaceIds } },
        select: { id: true },
      });
      if (activityPlaces.length !== activityPlaceIds.length) {
        throw Object.assign(new Error("ACTIVITY_PLACE_NOT_FOUND"), { statusCode: 404 });
      }
    }
    const budgetValue =
      input.budget ??
      sum(dayInputs.map((day) => sum(day.locations.map((location) => location.estimatedCost ?? 0))));
    const existingTripFields = getTripPersistedFields(existingTrip);
    const coverImageUrl =
      input.image ?? existingTripFields.coverImageUrl ?? hotelPlace?.coverImageUrl ?? null;
    const currentHotelName = input.hotel ?? existingTrip?.currentHotelName ?? hotelPlace?.name ?? null;
    const currentHotelPlaceId = input.hotelPlaceId ?? existingTrip?.currentHotelPlaceId ?? null;
    const destination = input.destination ?? existingTrip?.destination ?? null;
    const tripStartDate = input.startDate;
    const tripEndDate = input.endDate;
    const currency = input.currency ?? existingTripFields.currency ?? "VND";

    const savedTrip = tripId
      ? await prisma.trip.update({
          where: { id: tripId },
          data: {
            title: input.title,
            destination,
            currentHotelName,
            currentHotelPlaceId,
            startDate: tripStartDate,
            endDate: tripEndDate,
            budget: budgetValue,
            totalBudgetPerPerson: budgetValue,
            coverImageUrl,
            currency,
          },
        })
      : await prisma.trip.create({
          data: {
            userId,
            title: input.title,
            destination,
            currentHotelName,
            currentHotelPlaceId,
            startDate: tripStartDate,
            endDate: tripEndDate,
            budget: budgetValue,
            totalBudgetPerPerson: budgetValue,
            coverImageUrl,
            currency,
          },
        });

    await syncTripMembers(savedTrip.id, normalizedMembers, userById);

    const existingDays = existingTrip?.days ?? [];
    const existingDaysById = new Map(existingDays.map((day) => [day.id, day]));
    const existingDaysByDate = new Map(existingDays.map((day) => [dateKey(day.date), day]));
    const keptDayIds = new Set<string>();

    for (const [index, dayInput] of dayInputs.entries()) {
      const existingDay = findReusableTripDay(
        dayInput,
        index,
        existingDays,
        existingDaysById,
        existingDaysByDate,
        keptDayIds
      );
      const dayBudget = sum(dayInput.locations.map((location) => location.estimatedCost ?? 0));
      const dayTitle = dayInput.title ?? existingDay?.title ?? `Day ${index + 1}`;

      const savedDay = existingDay
        ? await prisma.tripDay.update({
            where: { id: existingDay.id },
            data: {
              dayNumber: index + 1,
              title: dayTitle,
              date: dayInput.date,
              estimatedBudget: dayBudget,
              isExpanded: existingDay.isExpanded,
            },
          })
        : await prisma.tripDay.create({
            data: {
              tripId: savedTrip.id,
              dayNumber: index + 1,
              title: dayTitle,
              date: dayInput.date,
              estimatedBudget: dayBudget,
              isExpanded: true,
            },
          });

      keptDayIds.add(savedDay.id);

      await prisma.tripActivity.deleteMany({
        where: { tripDayId: savedDay.id },
      });

      if (dayInput.locations.length > 0) {
        await prisma.tripActivity.createMany({
          data: dayInput.locations.map((locationInput, locationIndex) => {
            const imageUrl = locationInput.imageUrl ?? null;
            const period = locationInput.period ?? "MORNING";
            const estimatedCost = locationInput.estimatedCost ?? 0;
            const rating = locationInput.rating ?? null;
            const sortOrder = locationInput.sortOrder ?? locationIndex + 1;

            return {
              tripDayId: savedDay.id,
              placeId: locationInput.placeId ?? null,
              title: locationInput.title,
              description: locationInput.description ?? null,
              imageUrl,
              period,
              scheduledTime: locationInput.scheduledTime ?? null,
              estimatedCost,
              rating,
              sortOrder,
            };
          }),
        });
      }
    }

    if (existingTrip?.days.length) {
      const deleteDayIds = existingTrip.days
        .map((day) => day.id)
        .filter((dayId) => !keptDayIds.has(dayId));
      if (deleteDayIds.length > 0) {
        await prisma.tripDay.deleteMany({
          where: {
            tripId: savedTrip.id,
            id: { in: deleteDayIds },
          },
        });
      }
    }

    const trip = await prisma.trip.findUnique({
      where: { id: savedTrip.id },
      include: tripInclude,
    });

    if (!trip) {
      throw Object.assign(new Error("TRIP_NOT_FOUND"), { statusCode: 404 });
    }

    return mapTrip(trip);
  },
};

export type TripWithDetails = Prisma.TripGetPayload<{ include: typeof tripInclude }>;
type TripDayWithActivities = TripWithDetails["days"][number];
type TripActivityWithPlace = TripDayWithActivities["activities"][number];
type TripPersistedFields = {
  coverImageUrl?: string | null;
  budget?: number | null;
  totalBudgetPerPerson?: number | null;
  currency?: string | null;
};
type TripInput = z.infer<typeof tripWriteSchema>;
type TripMemberInput = {
  userId?: number;
  name?: string;
  avatarUrl?: string | null;
};

type TripLocationInput = {
  id?: string;
  placeId?: string | null;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  period?: (typeof tripActivityPeriods)[number];
  scheduledTime?: string | null;
  estimatedCost?: number;
  rating?: number | null;
  sortOrder?: number;
};

type TripDayInput = {
  dayId?: string | null;
  title?: string;
  date: Date;
  locations: TripLocationInput[];
};

type TripWriteBody = {
  title?: unknown;
  destination?: unknown;
  hotel?: unknown;
  hotelPlaceId?: unknown;
  currentHotelName?: unknown;
  currentHotelPlaceId?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  image?: unknown;
  coverImageUrl?: unknown;
  budget?: unknown;
  totalBudgetPerPerson?: unknown;
  currency?: unknown;
  members?: unknown;
  itineraryData?: unknown;
  days?: unknown;
};

function parseTripInput(body: unknown): TripInput {
  return tripWriteSchema.parse(normalizeTripBody(body));
}

function normalizeTripBody(body: unknown): TripWriteBody {
  const raw = isRecord(body) ? body : {};
  const itineraryRaw = Array.isArray(raw.itineraryData)
    ? raw.itineraryData
    : Array.isArray(raw.days)
      ? raw.days
      : [];

  return {
    title: raw.title,
    destination: optionalString(raw.destination),
    hotel: optionalString(raw.hotel ?? raw.currentHotelName),
    hotelPlaceId: optionalString(raw.hotelPlaceId ?? raw.currentHotelPlaceId),
    startDate: raw.startDate,
    endDate: raw.endDate,
    image: optionalString(raw.image ?? raw.coverImageUrl),
    budget: raw.budget ?? raw.totalBudgetPerPerson,
    currency: optionalString(raw.currency),
    members: Array.isArray(raw.members) ? raw.members.map(normalizeMemberInput) : [],
    itineraryData: itineraryRaw.map(normalizeDayInput),
  };
}

function normalizeMemberInput(value: unknown): TripMemberInput {
  const raw = isRecord(value) ? value : {};
  return {
    userId: (raw.userId ?? raw.id) as number | undefined,
    name: optionalString(raw.name ?? raw.fullName ?? raw.username),
    avatarUrl: optionalString(raw.avatarUrl ?? raw.avatar ?? raw.imageUrl),
  };
}

function normalizeDayInput(value: unknown): TripDayInput {
  const raw = isRecord(value) ? value : {};
  const locationsRaw = Array.isArray(raw.locations)
    ? raw.locations
    : Array.isArray(raw.activities)
      ? raw.activities
      : [];

  return {
    dayId: optionalString(raw.dayId ?? raw.id),
    title: optionalString(raw.title),
    date: raw.date as Date,
    locations: locationsRaw.map(normalizeLocationInput),
  };
}

function normalizeLocationInput(value: unknown): TripLocationInput {
  const raw = isRecord(value) ? value : {};
  const place = isRecord(raw.place) ? raw.place : {};
  return {
    id: optionalString(raw.id ?? raw.locationId),
    placeId: optionalString(raw.placeId ?? place.id),
    title: optionalString(raw.title ?? raw.name) ?? "",
    description: optionalString(raw.description),
    imageUrl: optionalString(raw.imageUrl ?? raw.image),
    period: raw.period as TripLocationInput["period"],
    scheduledTime: optionalString(raw.scheduledTime ?? raw.time),
    estimatedCost: (raw.estimatedCost ?? raw.cost) as number | undefined,
    rating: raw.rating as number | null | undefined,
    sortOrder: raw.sortOrder as number | undefined,
  };
}

function buildDayInputs(input: TripInput, existingTrip: TripWithDetails | null) {
  const dayCount = daysBetweenInclusive(input.startDate, input.endDate);
  const existingDays = existingTrip?.days ?? [];
  const result: TripDayInput[] = [];

  for (let index = 0; index < dayCount; index += 1) {
    const provided = input.itineraryData[index];
    const existing = existingDays[index];
    const dayId = provided?.dayId ?? existing?.id ?? undefined;
    const date = provided?.date ?? addDays(input.startDate, index);
    const title = provided?.title ?? existing?.title ?? `Day ${index + 1}`;
    const locations = provided?.locations.length
      ? provided.locations
      : existing?.activities.map(mapExistingActivityToInput) ?? [];

    result.push({
      dayId,
      title,
      date,
      locations,
    });
  }

  return result;
}

function findReusableTripDay(
  dayInput: TripDayInput,
  index: number,
  existingDays: TripDayWithActivities[],
  existingDaysById: Map<string, TripDayWithActivities>,
  existingDaysByDate: Map<string, TripDayWithActivities>,
  usedDayIds: Set<string>
) {
  const byId = dayInput.dayId ? existingDaysById.get(dayInput.dayId) : undefined;
  if (byId && !usedDayIds.has(byId.id)) return byId;

  const byDate = existingDaysByDate.get(dateKey(dayInput.date));
  if (byDate && !usedDayIds.has(byDate.id)) return byDate;

  const byIndex = existingDays[index];
  if (byIndex && !usedDayIds.has(byIndex.id)) return byIndex;

  return null;
}

function mapExistingActivityToInput(activity: TripActivityWithPlace): TripLocationInput {
  return {
    id: activity.id,
    placeId: activity.placeId ?? undefined,
    title: activity.title,
    description: activity.description ?? undefined,
    imageUrl: activity.imageUrl ?? activity.place?.coverImageUrl ?? undefined,
    period: activity.period,
    scheduledTime: activity.scheduledTime ?? undefined,
    estimatedCost: activity.estimatedCost,
    rating: activity.rating ?? activity.place?.averageRating ?? undefined,
    sortOrder: activity.sortOrder,
  };
}

function dedupeMembers(members: TripInput["members"]) {
  const seen = new Set<string>();
  const result: TripInput["members"] = [];

  for (const member of members) {
    const key = member.userId !== undefined ? `user:${member.userId}` : `guest:${member.name ?? ""}:${member.avatarUrl ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(member);
  }

  return result;
}

async function syncTripMembers(
  tripId: string,
  members: TripInput["members"],
  userById: Map<number, { id: number; fullName: string | null; username: string | null; avatarUrl: string | null }>
) {
  const now = new Date();
  const registeredUserIds = members
    .map((member) => member.userId)
    .filter((memberUserId): memberUserId is number => memberUserId !== undefined);
  const guestMembers = members.filter((member) => member.userId === undefined);
  const desiredGuestKeys = new Set(
    guestMembers.map((member) => `guest:${member.name ?? ""}:${member.avatarUrl ?? ""}`)
  );

  await prisma.tripMember.updateMany({
    where: {
      tripId,
      status: activeMemberStatus,
      userId:
        registeredUserIds.length > 0
          ? { notIn: registeredUserIds }
          : { not: null },
    },
    data: {
      status: "REMOVED",
      removedAt: now,
    },
  });

  const activeGuests = await prisma.tripMember.findMany({
    where: {
      tripId,
      userId: null,
      status: activeMemberStatus,
    },
  });
  const activeGuestByKey = new Map(
    activeGuests.map((member) => [`guest:${member.name ?? ""}:${member.avatarUrl ?? ""}`, member])
  );
  const staleGuestIds = activeGuests
    .filter((member) => !desiredGuestKeys.has(`guest:${member.name ?? ""}:${member.avatarUrl ?? ""}`))
    .map((member) => member.id);
  if (staleGuestIds.length > 0) {
    await prisma.tripMember.updateMany({
      where: { id: { in: staleGuestIds } },
      data: {
        status: "REMOVED",
        removedAt: now,
      },
    });
  }

  for (const member of members) {
    const existingUser = member.userId ? userById.get(member.userId) : null;
    const memberData = {
      name: member.name ?? existingUser?.fullName ?? existingUser?.username ?? null,
      avatarUrl: member.avatarUrl ?? existingUser?.avatarUrl ?? null,
      status: activeMemberStatus,
      joinedAt: now,
      leftAt: null,
      inviteAcceptedAt: now,
      inviteRejectedAt: null,
      removedAt: null,
    };

    if (member.userId) {
      await prisma.tripMember.upsert({
        where: { tripId_userId: { tripId, userId: member.userId } },
        create: {
          tripId,
          userId: member.userId,
          ...memberData,
        },
        update: memberData,
      });
      continue;
    }

    const guestKey = `guest:${member.name ?? ""}:${member.avatarUrl ?? ""}`;
    const existingGuest = activeGuestByKey.get(guestKey);
    if (existingGuest) {
      await prisma.tripMember.update({
        where: { id: existingGuest.id },
        data: memberData,
      });
      continue;
    }

    await prisma.tripMember.create({
      data: {
        tripId,
        userId: null,
        ...memberData,
      },
    });
  }
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

export function mapTrip(trip: TripWithDetails) {
  const collaborators = trip.members.map((member) => ({
    id: member.id,
    userId: member.userId,
    email: member.user?.email ?? null,
    name: member.user?.fullName ?? member.user?.username ?? member.name ?? null,
    avatarUrl: member.user?.avatarUrl ?? member.avatarUrl ?? null,
    status: member.status,
    isRegisteredUser: Boolean(member.userId),
  }));
  const itineraryData = trip.days.map((day) => mapDay(day, trip.title));
  const persistedFields = getTripPersistedFields(trip);
  const budget = persistedFields.budget ?? persistedFields.totalBudgetPerPerson ?? 0;
  const totalBudgetPerPerson = persistedFields.totalBudgetPerPerson ?? budget;

  return {
    id: trip.id,
    title: trip.title,
    date: formatTripDateRange(trip.startDate, trip.endDate),
    startDate: trip.startDate,
    endDate: trip.endDate,
    image:
      persistedFields.coverImageUrl ??
      trip.currentHotelPlace?.coverImageUrl ??
      itineraryData[0]?.locations[0]?.image ??
      null,
    coverImageUrl: persistedFields.coverImageUrl,
    hotel: trip.currentHotelName ?? trip.currentHotelPlace?.name ?? null,
    currentHotel: {
      name: trip.currentHotelName ?? trip.currentHotelPlace?.name ?? null,
      place: trip.currentHotelPlace,
    },
    destination: trip.destination,
    duration: daysBetweenInclusive(trip.startDate, trip.endDate),
    durationDays: daysBetweenInclusive(trip.startDate, trip.endDate),
    budget,
    totalBudgetPerPerson,
    currency: persistedFields.currency ?? "VND",
    members: collaborators,
    collaborators,
    itineraryData,
    days: trip.days.map((day) => ({
      ...mapDay(day, trip.title),
      locationCount: day.activities.length,
      isExpanded: day.isExpanded,
      activities: day.activities.map(mapActivity),
    })),
    createdAt: trip.createdAt,
    updatedAt: trip.updatedAt,
  };
}

function getTripPersistedFields(trip: TripWithDetails | null): Required<TripPersistedFields> {
  const fields = trip as TripPersistedFields | null;

  return {
    coverImageUrl: fields?.coverImageUrl ?? null,
    budget: fields?.budget ?? null,
    totalBudgetPerPerson: fields?.totalBudgetPerPerson ?? null,
    currency: fields?.currency ?? null,
  };
}

function mapDay(day: TripDayWithActivities, tripTitle: string) {
  return {
    id: day.id,
    dayId: day.id,
    dayNumber: day.dayNumber,
    title: day.title ?? `Day ${day.dayNumber}: ${tripTitle}`,
    date: day.date,
    estimatedBudget: day.estimatedBudget,
    locations: day.activities.map(mapActivity),
  };
}

function mapActivity(activity: TripActivityWithPlace) {
  const image = activity.place?.coverImageUrl ?? activity.imageUrl ?? null;
  return {
    id: activity.id,
    placeId: activity.placeId,
    name: activity.title,
    title: activity.title,
    description: activity.description,
    image,
    imageUrl: image,
    time: activity.scheduledTime ?? null,
    scheduledTime: activity.scheduledTime ?? null,
    period: activity.period,
    cost: activity.estimatedCost,
    estimatedCost: activity.estimatedCost,
    rating: activity.rating ?? activity.place?.averageRating ?? null,
    sortOrder: activity.sortOrder,
    place: activity.place,
  };
}

async function findOwnedTripDay(userId: number, tripId: string, dayIdOrNumber: string) {
  const dayNumber = Number(dayIdOrNumber);
  const day = await prisma.tripDay.findFirst({
    where: {
      tripId,
      ...(Number.isInteger(dayNumber) && dayNumber > 0
        ? { OR: [{ id: dayIdOrNumber }, { dayNumber }] }
        : { id: dayIdOrNumber }),
      trip: {
        userId,
      },
    },
    select: {
      id: true,
    },
  });

  if (!day) {
    throw Object.assign(new Error("TRIP_DAY_NOT_FOUND"), { statusCode: 404 });
  }

  return day;
}

async function refreshDayBudget(dayId: string) {
  const totals = await prisma.tripActivity.aggregate({
    where: { tripDayId: dayId },
    _sum: { estimatedCost: true },
  });

  await prisma.tripDay.update({
    where: { id: dayId },
    data: { estimatedBudget: totals._sum.estimatedCost ?? 0 },
  });
}

async function getRequiredTripForUser(userId: number, tripId: string) {
  const trip = await prisma.trip.findFirst({
    where: { id: tripId, userId },
    include: tripInclude,
  });

  if (!trip) {
    throw Object.assign(new Error("TRIP_NOT_FOUND"), { statusCode: 404 });
  }

  return mapTrip(trip);
}

function formatTripDateRange(startDate: Date, endDate: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${formatter.format(startDate)} - ${formatter.format(endDate)}`;
}

function daysBetweenInclusive(start: Date, end: Date) {
  const startUtc = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.max(1, Math.floor((endUtc - startUtc) / 86_400_000) + 1);
}

function addDays(date: Date, daysToAdd: number) {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + daysToAdd);
  return nextDate;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value.trim() || undefined : undefined;
}
