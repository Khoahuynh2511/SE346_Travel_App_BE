import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import { z } from "zod";
import { OAuth2Client } from "google-auth-library";
import { env } from "../config/env.js";
import { getSupabaseAdmin } from "../integrations/supabaseAdmin.js";
import type { AppJwtPayload } from "../middleware/auth.js";
import { prisma } from "../database/client.js";
import { toAuthUserDto } from "./userDto.js";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).regex(/[A-Z]/, 'Must contain uppercase').regex(/[a-z]/, 'Must contain lowercase').regex(/[0-9]/, 'Must contain number'),
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

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
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
      const accessToken = this.signToken(user.id, user.email);
      const refreshToken = await this.generateRefreshToken(user.id);
      return { accessToken, refreshToken, userId: user.id, user: toAuthUserDto(user) };
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
    if (!user) {
      await bcrypt.compare("dummy", "$2a$10$dummydummydummydummydummydummydummydummydummydummydummy"); // constant-time dummy
      throw Object.assign(new Error("INVALID_CREDENTIALS"), { statusCode: 401 });
    }

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

    const accessToken = this.signToken(user.id, user.email);
    const refreshToken = await this.generateRefreshToken(user.id);

    return {
      accessToken,
      refreshToken,
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
    return { message: "If the email exists, reset instructions will be sent." };
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

  async oauthGoogle(idToken: string, role?: string) {
    if (!env.googleClientId) {
      throw Object.assign(new Error("OAUTH_GOOGLE_NOT_CONFIGURED"), { statusCode: 501 });
    }

    const client = new OAuth2Client(env.googleClientId);
    let ticket;
    try {
      ticket = await client.verifyIdToken({
        idToken,
        audience: env.googleClientId,
      });
    } catch (error) {
      throw Object.assign(new Error("INVALID_GOOGLE_TOKEN"), { statusCode: 401 });
    }

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      throw Object.assign(new Error("INVALID_GOOGLE_TOKEN"), { statusCode: 401 });
    }

    const { email, name, picture } = payload;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      // Check if user is banned
      if (existingUser.isBanned) {
        throw Object.assign(new Error("USER_BANNED"), { statusCode: 403 });
      }

      // Log in existing user
      const accessToken = this.signToken(existingUser.id, existingUser.email);
      const refreshToken = await this.generateRefreshToken(existingUser.id);

      return {
        accessToken,
        refreshToken,
        userId: existingUser.id,
        user: toAuthUserDto(existingUser),
        isNewUser: false,
      };
    }

    // Create new user from Google OAuth
    const randomPassword = randomBytes(32).toString('hex');
    const passwordHash = await bcrypt.hash(randomPassword, 10);

    const userRole = role === "OWNER" ? "OWNER" : "TRAVELER";
    const fullName = name || email.split('@')[0];

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: userRole,
        fullName,
        avatarUrl: picture || null,
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

    const accessToken = this.signToken(user.id, user.email);
    const refreshToken = await this.generateRefreshToken(user.id);

    return {
      accessToken,
      refreshToken,
      userId: user.id,
      user: toAuthUserDto(user),
      isNewUser: true,
    };
  },

  signToken(userId: number, email: string): string {
    const payload: AppJwtPayload = { sub: userId, email };
    return jwt.sign(payload, env.jwtSecret, { expiresIn: "15m" });
  },

  async generateRefreshToken(userId: number): Promise<string> {
    const token = randomBytes(64).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.refreshToken.create({
      data: {
        token,
        userId,
        expiresAt,
      },
    });

    return token;
  },

  async refreshAccessToken(refreshToken: string) {
    const data = refreshSchema.parse({ refreshToken });

    const existingToken = await prisma.refreshToken.findUnique({
      where: { token: data.refreshToken },
      include: { user: true },
    });

    if (!existingToken) {
      throw Object.assign(new Error("INVALID_REFRESH_TOKEN"), { statusCode: 401 });
    }

    if (existingToken.expiresAt < new Date()) {
      await prisma.refreshToken.delete({ where: { token: data.refreshToken } });
      throw Object.assign(new Error("REFRESH_TOKEN_EXPIRED"), { statusCode: 401 });
    }

    // Delete old refresh token (token rotation)
    await prisma.refreshToken.delete({ where: { token: data.refreshToken } });

    // Generate new tokens
    const newAccessToken = this.signToken(existingToken.user.id, existingToken.user.email);
    const newRefreshToken = await this.generateRefreshToken(existingToken.user.id);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  },

  async revokeRefreshToken(refreshToken: string): Promise<void> {
    const data = refreshSchema.parse({ refreshToken });
    await prisma.refreshToken.delete({ where: { token: data.refreshToken } }).catch(() => {
      // Ignore if token doesn't exist
    });
  },
};
