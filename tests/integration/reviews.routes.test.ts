import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import { prisma } from "../../src/database/client.js";
import bcrypt from "bcryptjs";
import { authService } from "../../src/services/auth.service.js";

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe("Reviews integration", () => {
  const email = `rev-test-${Date.now()}@example.com`;
  const password = "Password123!";

  let token = "";
  let userId = 0;
  let placeId = "";

  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, passwordHash, fullName: "Review Tester" },
    });
    userId = user.id;
    token = authService.signToken(user.id, user.email);

    const place = await prisma.place.create({
      data: {
        name: "Review Place",
        region: "Test Region",
        category: "ATTRACTIONS",
        coverImageUrl: "https://example.com/place-cover.jpg",
        featureLabel: "Nice",
        status: "APPROVED",
      },
    });
    placeId = place.id;
  });

  afterAll(async () => {
    if (placeId) {
      await prisma.reviewImage.deleteMany({ where: { review: { placeId } } as any });
      await prisma.review.deleteMany({ where: { placeId } });
      await prisma.placeImage.deleteMany({ where: { placeId } });
      await prisma.place.deleteMany({ where: { id: placeId } });
    }
    if (userId > 0) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
  });

  it("should create a review with multiple images and return them in the list", async () => {
    const imageUrls = [
      "https://cdn.example.com/rev1.jpg",
      "https://cdn.example.com/rev2.png",
    ];

    const createResp = await request(app)
      .post(`/api/v1/places/${placeId}/reviews`)
      .set(authHeader(token))
      .send({ rating: 5, content: "Great place", imageUrls });

    expect(createResp.status).toBe(201);
    expect(createResp.body.ok).toBe(true);
    expect(createResp.body.data).toHaveProperty("id");
    const reviewId = createResp.body.data.id as string;

    // Check DB has review images
    const imgs = await prisma.reviewImage.findMany({ where: { reviewId } });
    expect(imgs.map((i) => i.url).sort()).toEqual(imageUrls.slice().sort());

    const listResp = await request(app)
      .get(`/api/v1/places/${placeId}/reviews`)
      .set(authHeader(token));

    expect(listResp.status).toBe(200);
    expect(listResp.body.ok).toBe(true);
    expect(listResp.body.data.length).toBeGreaterThanOrEqual(1);
    const item = listResp.body.data.find((it: any) => it.id === reviewId);
    expect(item).toBeDefined();
    expect(item.images.sort()).toEqual(imageUrls.slice().sort());
  }, 20000);
});
