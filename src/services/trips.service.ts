import { Prisma } from "@prisma/client";
import { prisma } from "../database/client.js";

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
      where: { userId },
      orderBy: { startDate: "asc" },
      include: tripInclude,
    });

    return trips.map(mapTrip);
  },

  async getForUserById(userId: number, tripId: string) {
    const trip = await prisma.trip.findFirst({
      where: {
        id: tripId,
        userId,
      },
      include: tripInclude,
    });

    return trip ? mapTrip(trip) : null;
  },
};

type TripWithDetails = Prisma.TripGetPayload<{ include: typeof tripInclude }>;

function mapTrip(trip: TripWithDetails) {
  const collaborators = trip.members.map((member) => ({
    id: member.id,
    userId: member.userId,
    email: member.user?.email ?? null,
    name: member.user?.fullName ?? member.user?.username ?? member.name ?? null,
    avatarUrl: member.user?.avatarUrl ?? member.avatarUrl ?? null,
    isRegisteredUser: Boolean(member.userId),
  }));

  return {
    id: trip.id,
    title: trip.title,
    destination: trip.destination,
    currentHotel: {
      name: trip.currentHotelName ?? trip.currentHotelPlace?.name ?? null,
      place: trip.currentHotelPlace,
    },
    startDate: trip.startDate,
    endDate: trip.endDate,
    durationDays: daysBetweenInclusive(trip.startDate, trip.endDate),
    totalBudgetPerPerson: trip.totalBudgetPerPerson,
    currency: trip.currency,
    members: collaborators,
    collaborators,
    days: trip.days.map((day) => ({
      id: day.id,
      dayNumber: day.dayNumber,
      title: day.title ?? `Ngay ${day.dayNumber}: ${trip.title}`,
      date: day.date,
      estimatedBudget: day.estimatedBudget,
      locationCount: day.activities.length,
      isExpanded: day.isExpanded,
      activities: day.activities.map((activity) => ({
        id: activity.id,
        placeId: activity.placeId,
        title: activity.title,
        description: activity.description,
        imageUrl: activity.place?.coverImageUrl ?? activity.imageUrl ?? null,
        period: activity.period,
        scheduledTime: activity.scheduledTime,
        estimatedCost: activity.estimatedCost,
        rating: activity.rating ?? activity.place?.averageRating ?? null,
        sortOrder: activity.sortOrder,
        place: activity.place,
      })),
    })),
    createdAt: trip.createdAt,
    updatedAt: trip.updatedAt,
  };
}

function daysBetweenInclusive(start: Date, end: Date) {
  const startUtc = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.max(1, Math.floor((endUtc - startUtc) / 86_400_000) + 1);
}
