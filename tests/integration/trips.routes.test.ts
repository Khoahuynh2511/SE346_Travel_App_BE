import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import app from "../../src/app.js";
import { prisma } from "../../src/database/client.js";
import { authService } from "../../src/services/auth.service.js";

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe("Trips integration", () => {
  const email = `trip-test-${Date.now()}@example.com`;
  const password = "Password123!";

  let token = "";
  let userId = 0;
  let collaboratorId = 0;
  let hotelPlaceId = "";
  let activityPlaceId = "";
  let tripId = "";

  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.user.deleteMany({ where: { email: `trip-collab-${Date.now()}@example.com` } });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName: "Trip Tester",
      },
    });
    userId = user.id;
    token = authService.signToken(user.id, user.email);

    const collaborator = await prisma.user.create({
      data: {
        email: `trip-collab-${Date.now()}@example.com`,
        passwordHash: await bcrypt.hash(password, 10),
        fullName: "Trip Collaborator",
        avatarUrl: "https://example.com/avatar.jpg",
      },
    });
    collaboratorId = collaborator.id;

    const hotelPlace = await prisma.place.create({
      data: {
        name: "Trip Hotel",
        region: "Test Region",
        category: "ATTRACTIONS",
        coverImageUrl: "https://example.com/hotel-cover.jpg",
        featureLabel: "Test Hotel",
      },
    });
    hotelPlaceId = hotelPlace.id;

    const activityPlace = await prisma.place.create({
      data: {
        name: "Trip Activity Place",
        region: "Test Region",
        category: "ATTRACTIONS",
        coverImageUrl: "https://example.com/activity-cover.jpg",
        featureLabel: "Test Activity",
      },
    });
    activityPlaceId = activityPlace.id;
  });

  afterAll(async () => {
    if (tripId) {
      await prisma.trip.deleteMany({ where: { id: tripId } });
    }
    if (activityPlaceId) {
      await prisma.place.deleteMany({ where: { id: activityPlaceId } });
    }
    if (hotelPlaceId) {
      await prisma.place.deleteMany({ where: { id: hotelPlaceId } });
    }
    if (collaboratorId > 0) {
      await prisma.user.deleteMany({ where: { id: collaboratorId } });
    }
    if (userId > 0) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
  });

  it("should create, update, and list a trip", async () => {
    const createPayload = {
      title: "Da Lat Summer Trip",
      hotel: "Trip Hotel",
      hotelPlaceId,
      destination: "Da Lat",
      startDate: "2026-06-10T00:00:00.000Z",
      endDate: "2026-06-12T00:00:00.000Z",
      image: "https://example.com/custom-trip-cover.jpg",
      budget: 5000000,
      currency: "VND",
      members: [
        { userId: collaboratorId },
        { name: "Guest Friend", avatarUrl: "https://example.com/guest.jpg" },
      ],
      itineraryData: [
        {
          title: "Day 1",
          date: "2026-06-10T00:00:00.000Z",
          locations: [
            {
              title: "Trip Activity Place",
              placeId: activityPlaceId,
              imageUrl: "https://example.com/activity-cover.jpg",
              period: "MORNING",
              scheduledTime: "08:00",
              estimatedCost: 1000000,
              rating: 4.8,
            },
          ],
        },
        {
          title: "Day 2",
          date: "2026-06-11T00:00:00.000Z",
          locations: [],
        },
        {
          title: "Day 3",
          date: "2026-06-12T00:00:00.000Z",
          locations: [],
        },
      ],
    };

    const createResponse = await request(app)
      .post("/api/v1/trips")
      .set(authHeader(token))
      .send(createPayload);

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.ok).toBe(true);
    expect(createResponse.body.data).toMatchObject({
      title: "Da Lat Summer Trip",
      hotel: "Trip Hotel",
      budget: 5000000,
      currency: "VND",
      duration: 3,
      image: "https://example.com/custom-trip-cover.jpg",
    });
    expect(createResponse.body.data.itineraryData).toHaveLength(3);
    expect(createResponse.body.data.itineraryData[0].locations).toHaveLength(1);
    expect(createResponse.body.data.members).toHaveLength(2);

    tripId = createResponse.body.data.id;
    const firstDayId = createResponse.body.data.itineraryData[0].dayId;

    const updatePayload = {
      ...createPayload,
      title: "Da Lat Autumn Trip",
      endDate: "2026-06-13T00:00:00.000Z",
      budget: 6200000,
      itineraryData: [
        {
          dayId: createResponse.body.data.itineraryData[0].dayId,
          title: "Day 1 - Updated",
          date: "2026-06-10T00:00:00.000Z",
          locations: [
            {
              id: createResponse.body.data.itineraryData[0].locations[0].id,
              title: "Trip Activity Place",
              placeId: activityPlaceId,
              imageUrl: "https://example.com/activity-cover.jpg",
              period: "AFTERNOON",
              scheduledTime: "09:30",
              estimatedCost: 1200000,
              rating: 4.9,
            },
          ],
        },
        {
          dayId: createResponse.body.data.itineraryData[1].dayId,
          title: "Day 2",
          date: "2026-06-11T00:00:00.000Z",
          locations: [],
        },
        {
          dayId: createResponse.body.data.itineraryData[2].dayId,
          title: "Day 3",
          date: "2026-06-12T00:00:00.000Z",
          locations: [],
        },
        {
          title: "Day 4",
          date: "2026-06-13T00:00:00.000Z",
          locations: [],
        },
      ],
    };

    const updateResponse = await request(app)
      .put(`/api/v1/trips/${tripId}`)
      .set(authHeader(token))
      .send(updatePayload);

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.ok).toBe(true);
    expect(updateResponse.body.data).toMatchObject({
      title: "Da Lat Autumn Trip",
      budget: 6200000,
      duration: 4,
      hotel: "Trip Hotel",
      destination: "Da Lat",
      currency: "VND",
      image: "https://example.com/custom-trip-cover.jpg",
    });
    expect(updateResponse.body.data.itineraryData).toHaveLength(4);
    expect(updateResponse.body.data.itineraryData[0].dayId).toBe(firstDayId);
    expect(updateResponse.body.data.itineraryData[0].locations[0]).toMatchObject({
      name: "Trip Activity Place",
      title: "Trip Activity Place",
      placeId: activityPlaceId,
      image: "https://example.com/activity-cover.jpg",
      imageUrl: "https://example.com/activity-cover.jpg",
      period: "AFTERNOON",
      time: "09:30",
      scheduledTime: "09:30",
      cost: 1200000,
      estimatedCost: 1200000,
      rating: 4.9,
      sortOrder: 1,
    });
    expect(updateResponse.body.data.members).toHaveLength(2);
    expect(updateResponse.body.data.members[0]).toMatchObject({
      userId: collaboratorId,
      name: "Trip Collaborator",
      avatarUrl: "https://example.com/avatar.jpg",
      isRegisteredUser: true,
    });
    expect(updateResponse.body.data.members[1]).toMatchObject({
      name: "Guest Friend",
      avatarUrl: "https://example.com/guest.jpg",
      isRegisteredUser: false,
    });

    const getResponse = await request(app)
      .get(`/api/v1/trips/${tripId}`)
      .set(authHeader(token));

    expect(getResponse.status).toBe(200);
    expect(getResponse.body.ok).toBe(true);
    expect(getResponse.body.data.title).toBe("Da Lat Autumn Trip");
    expect(getResponse.body.data.duration).toBe(4);
    expect(getResponse.body.data.itineraryData).toHaveLength(4);
    expect(getResponse.body.data.itineraryData[0].locations[0]).toMatchObject({
      placeId: activityPlaceId,
      period: "AFTERNOON",
      scheduledTime: "09:30",
      estimatedCost: 1200000,
      rating: 4.9,
    });

    const listResponse = await request(app)
      .get("/api/v1/users/me/trips")
      .set(authHeader(token));

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.ok).toBe(true);
    const listedTrip = listResponse.body.data.find((trip: { id: string }) => trip.id === tripId);
    expect(listedTrip).toBeTruthy();
    expect(listedTrip).toMatchObject({
      id: tripId,
      title: "Da Lat Autumn Trip",
      budget: 6200000,
      duration: 4,
      hotel: "Trip Hotel",
    });
    expect(listedTrip.itineraryData[0].locations[0]).toMatchObject({
      placeId: activityPlaceId,
      period: "AFTERNOON",
      scheduledTime: "09:30",
      estimatedCost: 1200000,
    });

    const dbTrip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        members: true,
        days: {
          orderBy: { dayNumber: "asc" },
          include: { activities: { orderBy: { sortOrder: "asc" } } },
        },
      },
    });
    expect(dbTrip).toMatchObject({
      title: "Da Lat Autumn Trip",
      destination: "Da Lat",
      currentHotelName: "Trip Hotel",
      currentHotelPlaceId: hotelPlaceId,
      budget: 6200000,
      totalBudgetPerPerson: 6200000,
      coverImageUrl: "https://example.com/custom-trip-cover.jpg",
      currency: "VND",
    });
    expect(dbTrip?.members).toHaveLength(2);
    expect(dbTrip?.days).toHaveLength(4);
    expect(dbTrip?.days[0].activities).toHaveLength(1);
    expect(dbTrip?.days[0].activities[0]).toMatchObject({
      placeId: activityPlaceId,
      title: "Trip Activity Place",
      imageUrl: "https://example.com/activity-cover.jpg",
      period: "AFTERNOON",
      scheduledTime: "09:30",
      estimatedCost: 1200000,
      rating: 4.9,
      sortOrder: 1,
    });

    const deleteResponse = await request(app)
      .delete(`/api/v1/trips/${tripId}`)
      .set(authHeader(token));

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body).toEqual({ ok: true });

    const deletedTrip = await prisma.trip.findUnique({ where: { id: tripId } });
    expect(deletedTrip).toBeNull();

    const getDeletedResponse = await request(app)
      .get(`/api/v1/trips/${tripId}`)
      .set(authHeader(token));

    expect(getDeletedResponse.status).toBe(404);
    tripId = "";
  }, 120000);
});
