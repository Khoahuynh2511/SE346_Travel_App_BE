import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config/env.js";
import { getSupabaseAdmin } from "../integrations/supabaseAdmin.js";
import type { AppJwtPayload } from "../middleware/auth.js";
import { prisma } from "../database/client.js";
import { toAuthUserDto } from "./userDto.js";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1).optional(),
  role: z.enum(["TRAVELER", "OWNER"]).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
});

type PasswordResetJwtPayload = {
  sub: number;
  email: string;
  purpose: "password-reset";
};

function signPasswordResetToken(userId: number, email: string): string {
  const payload: PasswordResetJwtPayload = {
    sub: userId,
    email,
    purpose: "password-reset",
  };
  return jwt.sign(payload, env.jwtSecret, { expiresIn: "15m" });
}

function verifyPasswordResetToken(token: string): PasswordResetJwtPayload {
  const payload = jwt.verify(token, env.jwtSecret) as unknown;
  if (
    !payload ||
    typeof payload !== "object" ||
    (payload as { purpose?: unknown }).purpose !== "password-reset" ||
    typeof (payload as { sub?: unknown }).sub !== "number" ||
    typeof (payload as { email?: unknown }).email !== "string"
  ) {
    throw Object.assign(new Error("INVALID_RESET_TOKEN"), { statusCode: 400 });
  }
  return {
    sub: (payload as { sub: number }).sub,
    email: (payload as { email: string }).email,
    purpose: "password-reset",
  };
}

async function createSupabaseAuthUser(email: string, password: string) {
  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) {
    // Map common Supabase errors to meaningful messages
    let errorCode = error.message;
    const errorMsg = error.message.toLowerCase();
    if (errorMsg.includes("already") || errorMsg.includes("duplicate") || errorMsg.includes("exist")) {
      errorCode = "EMAIL_TAKEN";
    }
    throw Object.assign(new Error(errorCode), { statusCode: 409 });
  }
  return data.user ?? null;
}

async function deleteSupabaseAuthUser(userId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  await admin.auth.admin.deleteUser(userId);
}

export const authService = {
  async register(body: unknown) {
    const data = registerSchema.parse(body);
    const exists = await prisma.user.findUnique({ where: { email: data.email } });
    if (exists) throw Object.assign(new Error("EMAIL_TAKEN"), { statusCode: 409 });
    const passwordHash = await bcrypt.hash(data.password, 10);
    const supabaseUser = await createSupabaseAuthUser(data.email, data.password);

    try {
      const user = await prisma.user.create({
        data: {
          email: data.email,
          passwordHash,
          role: data.role ?? "TRAVELER",
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
      return { accessToken: token, userId: user.id, user: toAuthUserDto(user) };
    } catch (error) {
      if (supabaseUser?.id) {
        await deleteSupabaseAuthUser(supabaseUser.id);
      }
      // Check if this is a duplicate email constraint error
      if (error instanceof Error && (error.message.includes("Unique constraint") || error.message.includes("unique"))) {
        throw Object.assign(new Error("EMAIL_TAKEN"), { statusCode: 409 });
      }
      throw error;
    }
  },

  async login(body: unknown) {
    const data = loginSchema.parse(body);
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user) throw Object.assign(new Error("INVALID_CREDENTIALS"), { statusCode: 401 });

    // Check if user is banned
    if (user.isBanned) {
      throw Object.assign(new Error("USER_BANNED"), { statusCode: 403 });
    }

    try {
      const ok = await bcrypt.compare(data.password, user.passwordHash);
      if (!ok) throw Object.assign(new Error("INVALID_CREDENTIALS"), { statusCode: 401 });
    } catch (error) {
      // If bcrypt throws an error (e.g., invalid hash format), treat as invalid credentials
      if (error instanceof Error && error.message !== "INVALID_CREDENTIALS") {
        throw Object.assign(new Error("INVALID_CREDENTIALS"), { statusCode: 401 });
      }
      throw error;
    }

    const token = this.signToken(user.id, user.email);

    return {
      accessToken: token,
      userId: user.id,
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
      previewToken: signPasswordResetToken(user.id, user.email),
    };
  },

  async resetPassword(body: unknown) {
    const data = resetPasswordSchema.parse(body);
    const payload = verifyPasswordResetToken(data.token);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.email !== payload.email) {
      throw Object.assign(new Error("INVALID_RESET_TOKEN"), { statusCode: 400 });
    }

    const passwordHash = await bcrypt.hash(data.newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
    return { message: "Password updated.", userId: user.id };
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
