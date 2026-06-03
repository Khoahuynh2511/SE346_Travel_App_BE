import { z } from "zod";
import { prisma } from "../database/client.js";
import { toAuthUserDto } from "./userDto.js";

const userSelect = {
  id: true,
  email: true,
  fullName: true,
  username: true,
  location: true,
  avatarUrl: true,
  role: true,
} as const;

const patchSchema = z
  .object({
    fullName: z.string().optional(),
    email: z.string().email().optional(),
    username: z.string().min(2).optional(),
    location: z.string().optional(),
    avatarUrl: z.union([z.string().url(), z.literal("")]).optional(),
  })
  .strict();

export const usersService = {
  async me(userId: number) {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: userSelect,
    });
    if (!u) throw Object.assign(new Error("NOT_FOUND"), { statusCode: 404 });
    return toAuthUserDto(u);
  },

  async updateMe(userId: number, body: unknown) {
    const data = patchSchema.parse(body);
    const update: Record<string, string | null> = {};
    if (data.fullName !== undefined) update.fullName = data.fullName;
    if (data.email !== undefined) update.email = data.email;
    if (data.username !== undefined) update.username = data.username || null;
    if (data.location !== undefined) update.location = data.location || null;
    if (data.avatarUrl !== undefined)
      update.avatarUrl = data.avatarUrl === "" ? null : data.avatarUrl;
    if (Object.keys(update).length === 0) return this.me(userId);
    try {
      const updated = await prisma.user.update({
        where: { id: userId },
        data: update,
        select: userSelect,
      });
      return toAuthUserDto(updated);
    } catch (e: unknown) {
      const code =
        typeof e === "object" &&
        e &&
        "code" in e &&
        (e as { code: string }).code === "P2002";
      if (code) {
        const target =
          "meta" in e &&
          e.meta &&
          typeof e.meta === "object" &&
          "target" in e.meta &&
          Array.isArray((e.meta as { target?: unknown }).target)
            ? (e.meta as { target: string[] }).target
            : [];
        const message = target.includes("email") ? "EMAIL_TAKEN" : "USERNAME_TAKEN";
        throw Object.assign(new Error(message), { statusCode: 409 });
      }
      throw e;
    }
  },
};
