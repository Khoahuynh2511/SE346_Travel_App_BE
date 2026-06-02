import { beforeAll, afterAll, afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import { prisma } from "../../src/database/client.js";
import bcrypt from "bcryptjs";
import { authService } from "../../src/services/auth.service.js";

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe("Favorites integration", () => {
  const email = `fav-test-${Date.now()}@example.com`;
  const password = "Password123!";

  let token = "";
  let userId = 0;
  let firstPlaceId = "";
  let secondPlaceId = "";
  let firstPlaceName = "";
  let secondPlaceName = "";

  async function createTestPlace(params: {
    name: string;
    region: string;
    featureLabel: string;
    coverImageUrl: string;
    imageUrl: string;
  }) {
    const place = await prisma.place.create({
      data: {
        name: params.name,
        region: params.region,
        category: "ATTRACTIONS",
        coverImageUrl: params.coverImageUrl,
        featureLabel: params.featureLabel,
        about: `${params.name} test place`,
      },
    });

    await prisma.placeImage.create({
      data: {
        placeId: place.id,
        url: params.imageUrl,
      },
    });

    return place;
  }

  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { email } });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName: "Favorite Tester",
      },
    });
    userId = user.id;
    token = authService.signToken(user.id, user.email);

    const firstPlace = await createTestPlace({
      name: "Favorite Place One",
      region: "Test Region A",
      featureLabel: "Feature A",
      coverImageUrl: "https://example.com/place-1-cover.jpg",
      imageUrl: "https://example.com/place-1-1.jpg",
    });
    firstPlaceId = firstPlace.id;
    firstPlaceName = firstPlace.name;

    const secondPlace = await createTestPlace({
      name: "Favorite Place Two",
      region: "Test Region B",
      featureLabel: "Feature B",
      coverImageUrl: "https://example.com/place-2-cover.jpg",
      imageUrl: "https://example.com/place-2-1.jpg",
    });
    secondPlaceId = secondPlace.id;
    secondPlaceName = secondPlace.name;
  });

  afterEach(async () => {
    if (userId > 0) {
      await prisma.favorite.deleteMany({ where: { userId } });
    }
  });

  afterAll(async () => {
    if (firstPlaceId) {
      await prisma.favorite.deleteMany({ where: { placeId: firstPlaceId } });
      await prisma.placeImage.deleteMany({ where: { placeId: firstPlaceId } });
      await prisma.place.deleteMany({ where: { id: firstPlaceId } });
    }
    if (secondPlaceId) {
      await prisma.favorite.deleteMany({ where: { placeId: secondPlaceId } });
      await prisma.placeImage.deleteMany({ where: { placeId: secondPlaceId } });
      await prisma.place.deleteMany({ where: { id: secondPlaceId } });
    }
    if (userId > 0) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
  });

  it("should save a place and expose it in list and place detail", async () => {
    const addResponse = await request(app)
      .post(`/api/v1/users/me/favorites/places/${firstPlaceId}`)
      .set(authHeader(token));

    expect(addResponse.status).toBe(201);
    expect(addResponse.body).toEqual({ ok: true });

    const listResponse = await request(app)
      .get("/api/v1/users/me/favorites")
      .set(authHeader(token));

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.ok).toBe(true);
    expect(listResponse.body.meta).toMatchObject({ total: 1, limit: 50, offset: 0 });
    expect(listResponse.body.data).toHaveLength(1);

    const item = listResponse.body.data[0];
    expect(item).toMatchObject({
      id: firstPlaceId,
      name: firstPlaceName,
      region: "Test Region A",
      averageRating: 0,
      ratingCount: 0,
      featureLabel: "Feature A",
      coverImageUrl: "https://example.com/place-1-cover.jpg",
      category: "ATTRACTIONS",
      about: "Favorite Place One test place",
      priceLevel: null,
      latitude: null,
      longitude: null,
      Id: firstPlaceId,
      Name: firstPlaceName,
      Located: "Test Region A",
      Location: "Test Region A",
      Rate: 0,
      NumberOfRate: 0,
      Features: "Feature A",
      Category: "ATTRACTIONS",
      image: "https://example.com/place-1-cover.jpg",
      Image: "https://example.com/place-1-cover.jpg",
    });
    expect(item.images).toEqual([
      "https://example.com/place-1-cover.jpg",
      "https://example.com/place-1-1.jpg",
    ]);
    expect(item.Images).toEqual([
      "https://example.com/place-1-cover.jpg",
      "https://example.com/place-1-1.jpg",
    ]);

    const placeResponse = await request(app)
      .get(`/api/v1/places/${firstPlaceId}`)
      .set(authHeader(token));

    expect(placeResponse.status).toBe(200);
    expect(placeResponse.body.data).toHaveProperty("isFavorite", true);

    const removeResponse = await request(app)
      .delete(`/api/v1/users/me/favorites/places/${firstPlaceId}`)
      .set(authHeader(token));

    expect(removeResponse.status).toBe(200);
    expect(removeResponse.body).toEqual({ ok: true });

    const listAfterRemove = await request(app)
      .get("/api/v1/users/me/favorites")
      .set(authHeader(token));

    expect(listAfterRemove.status).toBe(200);
    expect(listAfterRemove.body.meta).toMatchObject({ total: 0, limit: 50, offset: 0 });
    expect(listAfterRemove.body.data).toEqual([]);
  }, 30000);

  it("should paginate saved places with a stable total", async () => {
    await prisma.favorite.createMany({
      data: [
        { userId, placeId: firstPlaceId },
        { userId, placeId: secondPlaceId },
      ],
      skipDuplicates: true,
    });

    const page1 = await request(app)
      .get("/api/v1/users/me/favorites?limit=1&offset=0")
      .set(authHeader(token));

    expect(page1.status).toBe(200);
    expect(page1.body.meta).toMatchObject({ total: 2, limit: 1, offset: 0 });
    expect(page1.body.data).toHaveLength(1);

    const page2 = await request(app)
      .get("/api/v1/users/me/favorites?limit=1&offset=1")
      .set(authHeader(token));

    expect(page2.status).toBe(200);
    expect(page2.body.meta).toMatchObject({ total: 2, limit: 1, offset: 1 });
    expect(page2.body.data).toHaveLength(1);

    const returnedIds = [page1.body.data[0].id, page2.body.data[0].id];
    expect(new Set(returnedIds).size).toBe(2);
    expect(returnedIds).toEqual(expect.arrayContaining([firstPlaceId, secondPlaceId]));

    const placeOneResponse = await request(app)
      .get(`/api/v1/places/${firstPlaceId}`)
      .set(authHeader(token));
    const placeTwoResponse = await request(app)
      .get(`/api/v1/places/${secondPlaceId}`)
      .set(authHeader(token));

    expect(placeOneResponse.body.data).toHaveProperty("isFavorite", true);
    expect(placeTwoResponse.body.data).toHaveProperty("isFavorite", true);
  }, 30000);
});
