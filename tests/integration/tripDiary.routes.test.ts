import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import app from "../../src/app.js";
import { prisma } from "../../src/database/client.js";
import { authService } from "../../src/services/auth.service.js";

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe("Trip diary integration", () => {
  const email = `trip-diary-${Date.now()}@example.com`;
  const password = "Password123!";

  let token = "";
  let userId = 0;
  let tripId = "";
  let entryId = "";

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName: "Diary Tester",
      },
    });
    userId = user.id;
    token = authService.signToken(user.id, user.email);

    const trip = await prisma.trip.create({
      data: {
        userId,
        title: "Tokyo Memory Trip",
        destination: "Tokyo",
        startDate: new Date("2026-08-01T00:00:00.000Z"),
        endDate: new Date("2026-08-03T00:00:00.000Z"),
        coverImageUrl: "https://example.com/tokyo.jpg",
        currency: "VND",
      },
    });
    tripId = trip.id;
  });

  afterAll(async () => {
    if (tripId) {
      await prisma.trip.deleteMany({ where: { id: tripId } });
    }
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
  });

  it("should create, list, update, and delete diary entries for a trip", async () => {
    const createResponse = await request(app)
      .post(`/api/v1/trips/${tripId}/diary`)
      .set(authHeader(token))
      .send({
        title: "Shinjuku night walk",
        content: "Lights everywhere and a quiet ramen stop after the crowd.",
        locationName: "Shinjuku",
        occurredAt: "2026-08-01T20:30:00.000Z",
        imageUrls: [
          "https://example.com/diary-1.jpg",
          "https://example.com/diary-2.jpg",
        ],
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.ok).toBe(true);
    expect(createResponse.body.data).toMatchObject({
      tripId,
      title: "Shinjuku night walk",
      content: "Lights everywhere and a quiet ramen stop after the crowd.",
      locationName: "Shinjuku",
      imageUrls: [
        "https://example.com/diary-1.jpg",
        "https://example.com/diary-2.jpg",
      ],
    });
    entryId = createResponse.body.data.id;

    const listResponse = await request(app)
      .get(`/api/v1/trips/${tripId}/diary`)
      .set(authHeader(token));

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toHaveLength(1);
    expect(listResponse.body.data[0]).toMatchObject({
      id: entryId,
      tripId,
      title: "Shinjuku night walk",
      imageUrls: [
        "https://example.com/diary-1.jpg",
        "https://example.com/diary-2.jpg",
      ],
    });

    const updateResponse = await request(app)
      .patch(`/api/v1/trip-diaries/${entryId}`)
      .set(authHeader(token))
      .send({
        title: "Shinjuku lights",
        content: "Updated note with the best photo first.",
        imageUrls: ["https://example.com/diary-updated.jpg"],
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.data).toMatchObject({
      id: entryId,
      title: "Shinjuku lights",
      content: "Updated note with the best photo first.",
      imageUrls: ["https://example.com/diary-updated.jpg"],
    });

    const dbEntry = await prisma.tripDiaryEntry.findUnique({
      where: { id: entryId },
      include: { images: true },
    });
    expect(dbEntry).toMatchObject({
      tripId,
      userId,
      title: "Shinjuku lights",
      content: "Updated note with the best photo first.",
    });
    expect(dbEntry?.images).toHaveLength(1);
    expect(dbEntry?.images[0]).toMatchObject({
      url: "https://example.com/diary-updated.jpg",
      sortOrder: 1,
    });

    const deleteResponse = await request(app)
      .delete(`/api/v1/trip-diaries/${entryId}`)
      .set(authHeader(token));

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body).toEqual({ ok: true });

    const deletedEntry = await prisma.tripDiaryEntry.findUnique({ where: { id: entryId } });
    expect(deletedEntry).toBeNull();
    entryId = "";
  }, 120000);
});
