import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../../src/app.js";

describe("GET /health", () => {
  it("returns ok and supabase flag", async () => {
    const res = await request(app).get("/health").expect(200);
    expect(res.body).toMatchObject({ ok: true });
    expect(typeof res.body.supabase).toBe("boolean");
  });
});

describe("GET /openapi.json", () => {
  it("returns OpenAPI document", async () => {
    const res = await request(app).get("/openapi.json").expect(200);
    expect(res.body.openapi).toBe("3.0.3");
    expect(res.body.paths).toBeDefined();
  });
});
