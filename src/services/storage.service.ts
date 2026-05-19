import { randomBytes } from "node:crypto";
import type { Express } from "express";
import { env } from "../config/env.js";
import { getSupabaseAdmin } from "../integrations/supabaseAdmin.js";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export const storageService = {
  async uploadReviewImage(userId: number, file: Express.Multer.File): Promise<{ path: string; publicUrl: string }> {
    const client = getSupabaseAdmin();
    if (!client) {
      throw Object.assign(new Error("STORAGE_UNAVAILABLE"), { statusCode: 503 });
    }

    if (file.size > MAX_BYTES) {
      throw Object.assign(new Error("FILE_TOO_LARGE"), { statusCode: 413 });
    }

    if (!ALLOWED.has(file.mimetype)) {
      throw Object.assign(new Error("UNSUPPORTED_MEDIA_TYPE"), { statusCode: 415 });
    }

    const ext =
      file.mimetype === "image/jpeg"
        ? "jpg"
        : (file.mimetype.split("/")[1] ?? "bin");
    const objectPath = `${userId}/${randomBytes(16).toString("hex")}.${ext}`;
    const bucket = env.supabaseStorageBucket;

    const { error: upErr } = await client.storage
      .from(bucket)
      .upload(objectPath, file.buffer, { contentType: file.mimetype, upsert: false });

    if (upErr) {
      const mapped = Object.assign(new Error(upErr.message), { statusCode: 502 as const });
      throw mapped;
    }

    const { data: pub } = client.storage.from(bucket).getPublicUrl(objectPath);
    return { path: objectPath, publicUrl: pub.publicUrl };
  },

  async uploadPlaceCover(
    userId: number,
    file: Express.Multer.File
  ): Promise<{ path: string; publicUrl: string }> {
    const client = getSupabaseAdmin();
    if (!client) {
      throw Object.assign(new Error("STORAGE_UNAVAILABLE"), { statusCode: 503 });
    }
    if (file.size > MAX_BYTES) {
      throw Object.assign(new Error("FILE_TOO_LARGE"), { statusCode: 413 });
    }
    if (!ALLOWED.has(file.mimetype)) {
      throw Object.assign(new Error("UNSUPPORTED_MEDIA_TYPE"), { statusCode: 415 });
    }
    const ext =
      file.mimetype === "image/jpeg"
        ? "jpg"
        : (file.mimetype.split("/")[1] ?? "bin");
    const objectPath = `places/${userId}/${randomBytes(16).toString("hex")}.${ext}`;
    const bucket = env.supabaseStorageBucket;
    const { error: upErr } = await client.storage
      .from(bucket)
      .upload(objectPath, file.buffer, { contentType: file.mimetype, upsert: false });
    if (upErr) {
      throw Object.assign(new Error(upErr.message), { statusCode: 502 as const });
    }
    const { data: pub } = client.storage.from(bucket).getPublicUrl(objectPath);
    return { path: objectPath, publicUrl: pub.publicUrl };
  },
};
