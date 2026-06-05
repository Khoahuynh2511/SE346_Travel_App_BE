import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
  },
}));

vi.mock("../../../src/database/client.js", () => ({
  prisma: prismaMock,
}));

vi.mock("groq-sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  })),
}));

describe("groqService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("only exposes a safe user profile to the LLM", async () => {
    const { groqService } = await import("../../../src/services/groq.service.js");

    prismaMock.user.findUnique.mockResolvedValue({
      fullName: "Nguyen Van A",
      username: "vana",
      location: "Da Nang",
      role: "TRAVELER",
    });

    const profile = await groqService.getUserProfile(123);

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: 123 },
      select: {
        fullName: true,
        username: true,
        location: true,
        role: true,
      },
    });
    expect(profile).toEqual({
      displayName: "Nguyen Van A",
      username: "vana",
      location: "Da Nang",
      role: "TRAVELER",
    });
    expect(profile).not.toHaveProperty("passwordHash");
    expect(profile).not.toHaveProperty("fcmToken");
    expect(profile).not.toHaveProperty("isBanned");
    expect(profile).not.toHaveProperty("banReason");
    expect(profile).not.toHaveProperty("bannedAt");
  });
});
