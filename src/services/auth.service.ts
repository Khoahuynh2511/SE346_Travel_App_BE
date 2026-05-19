import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config/env.js";
import type { AppJwtPayload } from "../middleware/auth.js";
import { prisma } from "../database/client.js";
import { toAuthUserDto } from "./userDto.js";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const authService = {
  async register(body: unknown) {
    const data = registerSchema.parse(body);
    const exists = await prisma.user.findUnique({ where: { email: data.email } });
    if (exists) throw Object.assign(new Error("EMAIL_TAKEN"), { statusCode: 409 });
    const passwordHash = await bcrypt.hash(data.password, 10);
    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        fullName: data.fullName ?? null,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        username: true,
        avatarUrl: true,
        location: true,
        role: true,
      },
    });
    const token = this.signToken(user.id, user.email);
    return { accessToken: token, user: toAuthUserDto(user) };
  },

  async login(body: unknown) {
    const data = loginSchema.parse(body);
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user) throw Object.assign(new Error("INVALID_CREDENTIALS"), { statusCode: 401 });
    const ok = await bcrypt.compare(data.password, user.passwordHash);
    if (!ok) throw Object.assign(new Error("INVALID_CREDENTIALS"), { statusCode: 401 });
    const token = this.signToken(user.id, user.email);
    return {
      accessToken: token,
      user: toAuthUserDto(user),
    };
  },

  async forgotPassword(body: unknown) {
    const data = forgotPasswordSchema.parse(body);
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user) {
      return { message: "If the email exists, reset instructions will be sent." };
    }
    return {
      message: "If the email exists, reset instructions will be sent.",
      previewToken: "reset-not-configured",
    };
  },

  oauthNotImplemented(provider: string) {
    throw Object.assign(new Error(`OAUTH_${provider.toUpperCase()}_NOT_CONFIGURED`), {
      statusCode: 501,
    });
  },

  signToken(userId: number, email: string): string {
    const payload: AppJwtPayload = { sub: userId, email };
    return jwt.sign(payload, env.jwtSecret, { expiresIn: "7d" });
  },
};
