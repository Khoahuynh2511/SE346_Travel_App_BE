import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomBytes, randomInt } from "crypto";
import { z } from "zod";
import { OAuth2Client } from "google-auth-library";
import { env } from "../config/env.js";
import { getSupabaseAdmin } from "../integrations/supabaseAdmin.js";
import type { AppJwtPayload } from "../middleware/auth.js";
import { prisma } from "../database/client.js";
import { toAuthUserDto } from "./userDto.js";
import { emailService } from "./email.service.js";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
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

const changePasswordOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6).optional(),
  code: z.string().length(6).optional(), // Support both 'otp' and 'code'
  newPassword: z.string().min(8).optional(),
  password: z.string().min(8).optional(),
}).refine(data => (data.otp || data.code) && (data.newPassword || data.password), {
  message: "OTP/Code and new password must be provided",
  path: ["otp"]
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

    // Check if user already exists in permanent table
    const exists = await prisma.user.findUnique({ where: { email: data.email } });
    if (exists) throw Object.assign(new Error("EMAIL_TAKEN"), { statusCode: 409 });

    const passwordHash = await bcrypt.hash(data.password, 10);
    const verificationToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Upsert into PendingUser (allow retry if previous attempt failed/expired)
    await prisma.pendingUser.upsert({
      where: { email: data.email },
      update: {
        passwordHash,
        fullName: data.fullName ?? null,
        role: data.role ?? "TRAVELER",
        verificationToken,
        expiresAt,
      },
      create: {
        email: data.email,
        passwordHash,
        fullName: data.fullName ?? null,
        role: data.role ?? "TRAVELER",
        verificationToken,
        expiresAt,
      },
    });

    try {
      await emailService.sendVerificationEmail(data.email, verificationToken);
    } catch (error) {
      console.error("Failed to send verification email:", error);
      throw Object.assign(new Error("EMAIL_SEND_FAILED"), { statusCode: 500 });
    }

    return {
      message: "Please check your email to verify your account.",
      email: data.email
    };
  },

  async verifyEmail(token: string) {
    const pending = await prisma.pendingUser.findUnique({
      where: { verificationToken: token },
    });

    if (!pending) {
      throw Object.assign(new Error("INVALID_TOKEN"), { statusCode: 400 });
    }

    if (pending.expiresAt < new Date()) {
      await prisma.pendingUser.delete({ where: { id: pending.id } });
      throw Object.assign(new Error("TOKEN_EXPIRED"), { statusCode: 400 });
    }

    // Hash a random password for Supabase since we don't have the original plain text password
    const tempPasswordForSupabase = `Verify!${Math.random().toString(36).slice(-8)}123`;

    // Move from PendingUser to User
    const user = await prisma.user.create({
      data: {
        email: pending.email,
        passwordHash: pending.passwordHash, // Keep the original local bcrypt hash
        fullName: pending.fullName,
        role: pending.role,
        emailVerified: true,
      },
    });

    // Cleanup pending record
    await prisma.pendingUser.delete({ where: { id: pending.id } });

    // Sync with Supabase Auth
    try {
      await createSupabaseAuthUser(user.email, tempPasswordForSupabase);
    } catch (err) {
      console.error("Supabase sync failed (non-critical):", err);
    }

    return { message: "Email verified successfully. You can now login." };
  },

  async resendVerification(email: string) {
    const pending = await prisma.pendingUser.findUnique({ where: { email } });

    if (!pending) {
      // Check if already verified
      const verified = await prisma.user.findUnique({ where: { email } });
      if (verified) throw Object.assign(new Error("ALREADY_VERIFIED"), { statusCode: 400 });

      throw Object.assign(new Error("USER_NOT_FOUND"), { statusCode: 404 });
    }

    const verificationToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.pendingUser.update({
      where: { id: pending.id },
      data: {
        verificationToken,
        expiresAt,
      },
    });

    await emailService.sendVerificationEmail(email, verificationToken);

    return { message: "Verification email resent successfully." };
  },

  async requestPasswordOtp(email: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return { message: "If the email exists, an OTP has been sent." };
    }

    if (user.otpLastSentAt && user.otpLastSentAt.getTime() + 2 * 60 * 1000 > Date.now()) {
      throw Object.assign(new Error("OTP_TOO_FREQUENT"), { statusCode: 429 });
    }

    const otp = randomInt(100000, 999999).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await prisma.user.update({
      where: { id: user.id },
      data: {
        otpCode: otp,
        otpExpiresAt: expires,
        otpLastSentAt: new Date(),
      },
    });

    await emailService.sendOtpEmail(email, otp);
    console.log(`OTP generated for ${email}: ${otp}`);

    return { message: "OTP sent successfully." };
  },

  async changePasswordWithOtp(body: unknown) {
    const data = changePasswordOtpSchema.parse(body);
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    const otp = data.otp || data.code;

    if (!user || user.otpCode !== otp) {
      console.log(`Password reset failed for ${data.email}: OTP mismatch. Provided: ${otp}, Actual: ${user?.otpCode}`);
      throw Object.assign(new Error("INVALID_OTP"), { statusCode: 400 });
    }

    if (user.otpExpiresAt && user.otpExpiresAt < new Date()) {
      console.log(`Password reset failed for ${data.email}: OTP expired`);
      throw Object.assign(new Error("OTP_EXPIRED"), { statusCode: 400 });
    }

    const newPassword = data.newPassword || data.password;
    if (!newPassword) throw Object.assign(new Error("PASSWORD_REQUIRED"), { statusCode: 400 });

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        otpCode: null,
        otpExpiresAt: null,
      },
    });

    const admin = getSupabaseAdmin();
    if (admin) {
      const { data: suData } = await admin.auth.admin.listUsers();
      const suUser = suData.users.find(u => u.email === data.email);
      if (suUser) {
        await admin.auth.admin.updateUserById(suUser.id, { password: newPassword });
      }
    }

    return { message: "Password updated successfully." };
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

    // Check if email is verified
    if (!user.emailVerified) {
      throw Object.assign(new Error("EMAIL_NOT_VERIFIED"), { statusCode: 403 });
    }

    try {
      const ok = await bcrypt.compare(data.password, user.passwordHash);
      if (!ok) {
        console.log(`Login failed for ${data.email}: Password mismatch`);
        throw Object.assign(new Error("INVALID_CREDENTIALS"), { statusCode: 401 });
      }
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_CREDENTIALS") throw error;
      console.error(`Login bcrypt error for ${data.email}:`, error);
      throw Object.assign(new Error("INVALID_CREDENTIALS"), { statusCode: 401 });
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
    return await this.requestPasswordOtp(data.email);
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
    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      if (existingUser.isBanned) {
        throw Object.assign(new Error("USER_BANNED"), { statusCode: 403 });
      }
      const accessToken = this.signToken(existingUser.id, existingUser.email);
      const refreshToken = await this.generateRefreshToken(existingUser.id);
      return {
        accessToken, refreshToken, userId: existingUser.id,
        user: toAuthUserDto(existingUser), isNewUser: false,
      };
    }

    const randomPassword = randomBytes(32).toString('hex');
    const passwordHash = await bcrypt.hash(randomPassword, 10);
    const userRole = role === "OWNER" ? "OWNER" : "TRAVELER";
    const fullName = name || email.split('@')[0];

    const user = await prisma.user.create({
      data: { email, passwordHash, role: userRole, fullName, avatarUrl: picture || null },
      select: { id: true, email: true, fullName: true, username: true, avatarUrl: true, location: true, role: true },
    });

    const accessToken = this.signToken(user.id, user.email);
    const refreshToken = await this.generateRefreshToken(user.id);
    return {
      accessToken, refreshToken, userId: user.id,
      user: toAuthUserDto(user), isNewUser: true,
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
