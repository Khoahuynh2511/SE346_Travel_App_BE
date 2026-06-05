import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import { prisma } from "../../src/database/client.js";
import bcrypt from "bcryptjs";

describe("Auth Routes", () => {
  const testEmail = `test-${Date.now()}@example.com`;
  const testPassword = "ValidPassword123";

  beforeEach(async () => {
    // Clean up test user if exists
    await prisma.user.deleteMany({ where: { email: testEmail } });
  });

  afterEach(async () => {
    // Clean up after tests
    await prisma.user.deleteMany({ where: { email: testEmail } });
  });

  describe("POST /api/v1/auth/register", () => {
    it("should register a new user with valid credentials", async () => {
      const response = await request(app)
        .post("/api/v1/auth/register")
        .send({
          email: testEmail,
          password: testPassword,
          fullName: "Test User",
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("ok", true);
      expect(response.body).toHaveProperty("data");
      expect(response.body.data).toHaveProperty("accessToken");
      expect(response.body.data).toHaveProperty("userId");
      expect(response.body.data.user).toHaveProperty("email", testEmail);
      expect(response.body.data.user).toHaveProperty("role", "TRAVELER");

      const user = await prisma.user.findUnique({ where: { email: testEmail } });
      expect(user?.role).toBe("TRAVELER");
    });

    it("should register an owner when role OWNER is requested", async () => {
      const ownerEmail = `owner-${Date.now()}@example.com`;

      const response = await request(app)
        .post("/api/v1/auth/register")
        .send({
          email: ownerEmail,
          password: testPassword,
          fullName: "Owner User",
          role: "OWNER",
        });

      expect(response.status).toBe(201);
      expect(response.body.data.user).toHaveProperty("role", "OWNER");

      const user = await prisma.user.findUnique({ where: { email: ownerEmail } });
      expect(user?.role).toBe("OWNER");
      await prisma.user.deleteMany({ where: { email: ownerEmail } });
    });

    it("should not allow public admin registration", async () => {
      const response = await request(app)
        .post("/api/v1/auth/register")
        .send({
          email: testEmail,
          password: testPassword,
          role: "ADMIN",
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("ok", false);
      expect(response.body).toHaveProperty("error", "VALIDATION");
    });

    it("should return 409 if email already registered", async () => {
      // First registration
      await request(app)
        .post("/api/v1/auth/register")
        .send({
          email: testEmail,
          password: testPassword,
        });

      // Second registration with same email
      const response = await request(app)
        .post("/api/v1/auth/register")
        .send({
          email: testEmail,
          password: testPassword,
        });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty("ok", false);
      expect(response.body).toHaveProperty("error", "EMAIL_TAKEN");
    });

    it("should return 400 if email is invalid", async () => {
      const response = await request(app)
        .post("/api/v1/auth/register")
        .send({
          email: "invalid-email",
          password: testPassword,
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("ok", false);
      expect(response.body).toHaveProperty("error", "VALIDATION");
    });

    it("should return 400 if password is too short", async () => {
      const response = await request(app)
        .post("/api/v1/auth/register")
        .send({
          email: testEmail,
          password: "short",
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("ok", false);
      expect(response.body).toHaveProperty("error", "VALIDATION");
    });
  });

  describe("POST /api/v1/auth/login", () => {
    beforeEach(async () => {
      await prisma.user.deleteMany({ where: { email: testEmail } });
      await prisma.user.create({
        data: {
          email: testEmail,
          passwordHash: await bcrypt.hash(testPassword, 10),
          fullName: "Test User",
          emailVerified: true,
        },
      });
    });

    it("should login with valid credentials", async () => {
      const response = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: testEmail,
          password: testPassword,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("ok", true);
      expect(response.body).toHaveProperty("data");
      expect(response.body.data).toHaveProperty("accessToken");
      expect(response.body.data).toHaveProperty("userId");
      expect(response.body.data.user).toHaveProperty("email", testEmail);
      expect(response.body.data.user).toHaveProperty("role", "TRAVELER");
    });

    it("should return ADMIN role for admin login", async () => {
      const adminEmail = `admin-${Date.now()}@example.com`;
      await prisma.user.create({
        data: {
          email: adminEmail,
          passwordHash: await bcrypt.hash(testPassword, 10),
          role: "ADMIN",
          fullName: "Admin User",
          emailVerified: true,
        },
      });

      const response = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: adminEmail,
          password: testPassword,
        });

      expect(response.status).toBe(200);
      expect(response.body.data.user).toHaveProperty("role", "ADMIN");
      await prisma.user.deleteMany({ where: { email: adminEmail } });
    });

    it("should return 403 when a traveler calls admin API", async () => {
      const loginResponse = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: testEmail,
          password: testPassword,
        });

      const response = await request(app)
        .get("/api/v1/admin")
        .set("Authorization", `Bearer ${loginResponse.body.data.accessToken}`);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty("ok", false);
      expect(response.body).toHaveProperty("error", "FORBIDDEN");
    });

    it("should return 401 if email not found", async () => {
      const response = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: "nonexistent@example.com",
          password: testPassword,
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty("ok", false);
      expect(response.body).toHaveProperty("error", "INVALID_CREDENTIALS");
    });

    it("should return 401 if password is wrong", async () => {
      const response = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: testEmail,
          password: "WrongPassword123",
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty("ok", false);
      expect(response.body).toHaveProperty("error", "INVALID_CREDENTIALS");
    });

    it("should return 400 if email is invalid", async () => {
      const response = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: "invalid-email",
          password: testPassword,
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("ok", false);
      expect(response.body).toHaveProperty("error", "VALIDATION");
    });

    it("should return 400 if password is empty", async () => {
      const response = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: testEmail,
          password: "",
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("ok", false);
      expect(response.body).toHaveProperty("error", "VALIDATION");
    });
  });

  describe("POST /api/v1/auth/forgot-password", () => {
    beforeEach(async () => {
      await prisma.user.deleteMany({ where: { email: testEmail } });
      await prisma.user.create({
        data: {
          email: testEmail,
          passwordHash: await bcrypt.hash(testPassword, 10),
          fullName: "Test User",
        },
      });
    });

    it("should return success message when email exists", async () => {
      const response = await request(app)
        .post("/api/v1/auth/forgot-password")
        .send({
          email: testEmail,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("ok", true);
      expect(response.body.data).toHaveProperty("message");
      expect(response.body.data).toHaveProperty("previewToken");
    });

    it("should return generic message when email does not exist", async () => {
      const response = await request(app)
        .post("/api/v1/auth/forgot-password")
        .send({
          email: "nonexistent@example.com",
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("ok", true);
      expect(response.body.data).toHaveProperty("message");
      // Should NOT have previewToken when email doesn't exist
      expect(response.body.data).not.toHaveProperty("previewToken");
    });
  });
});
