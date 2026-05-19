import { z } from "zod";
import { prisma } from "../database/client.js";
import { toAuthUserDto } from "./userDto.js";

const patchSchema = z.object({
  fullName: z.string().optional(),
  username: z.string().min(2).optional(),
  location: z.string().optional(),
  avatarUrl: z.string().url().optional().or(z.literal("")),
});

export const usersService = {
  async me(userId: number) {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        username: true,
        location: true,
        avatarUrl: true,
        role: true,
      },
    });
    if (!u) throw Object.assign(new Error("NOT_FOUND"), { statusCode: 404 });
    return toAuthUserDto(u);
  },

  async updateMe(userId: number, body: unknown) {
    const data = patchSchema.parse(body);
    const update: Record<string, string | null> = {};
    if (data.fullName !== undefined) update.fullName = data.fullName;
    if (data.username !== undefined) update.username = data.username || null;
    if (data.location !== undefined) update.location = data.location || null;
    if (data.avatarUrl !== undefined)
      update.avatarUrl = data.avatarUrl === "" ? null : data.avatarUrl;
    try {
      const updated = await prisma.user.update({
        where: { id: userId },
        data: update,
        select: {
          id: true,
          email: true,
          fullName: true,
          username: true,
          location: true,
          avatarUrl: true,
          role: true,
        },
      });
      return toAuthUserDto(updated);
    } catch (e: unknown) {
      const code =
        typeof e === "object" &&
        e &&
        "code" in e &&
        (e as { code: string }).code === "P2002";
      if (code) throw Object.assign(new Error("USERNAME_TAKEN"), { statusCode: 409 });
      throw e;
    }
  },
};
