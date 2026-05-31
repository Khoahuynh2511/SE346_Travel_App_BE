import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../database/client.js";

const diaryEntryInclude = Prisma.validator<Prisma.TripDiaryEntryInclude>()({
  images: { orderBy: { sortOrder: "asc" } },
  trip: {
    select: {
      id: true,
      title: true,
      startDate: true,
      endDate: true,
      coverImageUrl: true,
    },
  },
});

const diaryEntrySchema = z.object({
  title: z.string().trim().min(1).max(160),
  content: z.string().trim().min(1).max(12000),
  locationName: z.string().trim().max(160).optional().nullable(),
  occurredAt: z.coerce.date(),
  imageUrls: z.array(z.string().url()).max(12).default([]),
});

const diaryEntryUpdateSchema = diaryEntrySchema.partial().refine(
  (value) =>
    value.title !== undefined ||
    value.content !== undefined ||
    value.locationName !== undefined ||
    value.occurredAt !== undefined ||
    value.imageUrls !== undefined,
  { message: "EMPTY_UPDATE" }
);

type DiaryEntryWithDetails = Prisma.TripDiaryEntryGetPayload<{
  include: typeof diaryEntryInclude;
}>;

export const tripDiaryService = {
  async listForTrip(userId: number, tripId: string) {
    await assertTripOwner(userId, tripId);

    const entries = await prisma.tripDiaryEntry.findMany({
      where: { tripId, userId },
      include: diaryEntryInclude,
      orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
    });

    return entries.map(mapDiaryEntry);
  },

  async createForTrip(userId: number, tripId: string, body: unknown) {
    await assertTripOwner(userId, tripId);
    const input = diaryEntrySchema.parse(body);

    const entry = await prisma.tripDiaryEntry.create({
      data: {
        tripId,
        userId,
        title: input.title,
        content: input.content,
        locationName: input.locationName ?? null,
        occurredAt: input.occurredAt,
        images: input.imageUrls.length
          ? {
              create: input.imageUrls.map((url, index) => ({
                url,
                sortOrder: index + 1,
              })),
            }
          : undefined,
      },
      include: diaryEntryInclude,
    });

    return mapDiaryEntry(entry);
  },

  async update(userId: number, entryId: string, body: unknown) {
    const existing = await prisma.tripDiaryEntry.findUnique({
      where: { id: entryId },
      select: { id: true, userId: true },
    });
    if (!existing) {
      throw Object.assign(new Error("DIARY_ENTRY_NOT_FOUND"), { statusCode: 404 });
    }
    if (existing.userId !== userId) {
      throw Object.assign(new Error("FORBIDDEN"), { statusCode: 403 });
    }

    const input = diaryEntryUpdateSchema.parse(body);

    await prisma.$transaction(async (tx) => {
      if (input.imageUrls !== undefined) {
        await tx.tripDiaryImage.deleteMany({ where: { entryId } });
        if (input.imageUrls.length > 0) {
          await tx.tripDiaryImage.createMany({
            data: input.imageUrls.map((url, index) => ({
              entryId,
              url,
              sortOrder: index + 1,
            })),
          });
        }
      }

      await tx.tripDiaryEntry.update({
        where: { id: entryId },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.content !== undefined ? { content: input.content } : {}),
          ...(input.locationName !== undefined ? { locationName: input.locationName ?? null } : {}),
          ...(input.occurredAt !== undefined ? { occurredAt: input.occurredAt } : {}),
        },
      });
    });

    const entry = await prisma.tripDiaryEntry.findUnique({
      where: { id: entryId },
      include: diaryEntryInclude,
    });
    if (!entry) {
      throw Object.assign(new Error("DIARY_ENTRY_NOT_FOUND"), { statusCode: 404 });
    }

    return mapDiaryEntry(entry);
  },

  async remove(userId: number, entryId: string) {
    const result = await prisma.tripDiaryEntry.deleteMany({
      where: {
        id: entryId,
        userId,
      },
    });

    if (result.count === 0) {
      throw Object.assign(new Error("DIARY_ENTRY_NOT_FOUND"), { statusCode: 404 });
    }
  },
};

async function assertTripOwner(userId: number, tripId: string) {
  const trip = await prisma.trip.findFirst({
    where: { id: tripId, userId },
    select: { id: true },
  });

  if (!trip) {
    throw Object.assign(new Error("TRIP_NOT_FOUND"), { statusCode: 404 });
  }
}

function mapDiaryEntry(entry: DiaryEntryWithDetails) {
  return {
    id: entry.id,
    tripId: entry.tripId,
    title: entry.title,
    content: entry.content,
    locationName: entry.locationName,
    occurredAt: entry.occurredAt,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    imageUrls: entry.images.map((image) => image.url),
    images: entry.images.map((image) => ({
      id: image.id,
      url: image.url,
      sortOrder: image.sortOrder,
    })),
    trip: entry.trip,
  };
}
