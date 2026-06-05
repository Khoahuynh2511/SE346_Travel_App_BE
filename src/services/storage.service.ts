import { randomBytes } from "node:crypto";
import type { Express } from "express";
import { env } from "../config/env.js";
import { getSupabaseAdmin } from "../integrations/supabaseAdmin.js";
import { validateImageFile } from "../utils/fileValidation.js";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function getFileExtension(mimetype: string) {
  return mimetype === "image/jpeg" ? "jpg" : (mimetype.split("/")[1] ?? "bin");
}

async function uploadFileToBucket(
  bucket: string,
  objectPath: string,
  file: Express.Multer.File
) {
  const client = getSupabaseAdmin();
  if (!client) {
    throw Object.assign(new Error("STORAGE_UNAVAILABLE"), { statusCode: 503 });
  }

  if (file.size > MAX_BYTES) {
    throw Object.assign(new Error("FILE_TOO_LARGE"), { statusCode: 413 });
  }

  // Validate file using magic bytes (file signature)
  const validation = validateImageFile(file.buffer);
  if (!validation.valid) {
    throw Object.assign(new Error("UNSUPPORTED_MEDIA_TYPE"), { statusCode: 415 });
  }

  // Use the detected MIME type from magic bytes
  const detectedMime = validation.mime!;

  // Ensure the detected type is allowed
  if (!ALLOWED.has(detectedMime)) {
    throw Object.assign(new Error("UNSUPPORTED_MEDIA_TYPE"), { statusCode: 415 });
  }

  const { error: upErr } = await client.storage
    .from(bucket)
    .upload(objectPath, file.buffer, { contentType: detectedMime, upsert: false });

  if (upErr) {
    const mapped = Object.assign(new Error(upErr.message), { statusCode: 502 as const });
    throw mapped;
  }

  const { data: pub } = client.storage.from(bucket).getPublicUrl(objectPath);
  return { path: objectPath, publicUrl: pub.publicUrl };
}

export const storageService = {
  async uploadAvatar(userId: number, file: Express.Multer.File): Promise<{ path: string; publicUrl: string }> {
    const bucket = env.supabaseStorageBucket;
    // Validate magic bytes first to get correct MIME type
    const validation = validateImageFile(file.buffer);
    if (!validation.valid) {
      throw Object.assign(new Error("UNSUPPORTED_MEDIA_TYPE"), { statusCode: 415 });
    }
    const objectPath = `avatars/${userId}/${randomBytes(16).toString("hex")}.${getFileExtension(validation.mime!)}`;
    return uploadFileToBucket(bucket, objectPath, file);
  },

  async uploadReviewImage(userId: number, file: Express.Multer.File): Promise<{ path: string; publicUrl: string }> {
    const bucket = env.supabaseStorageBucket;
    // Validate magic bytes first to get correct MIME type
    const validation = validateImageFile(file.buffer);
    if (!validation.valid) {
      throw Object.assign(new Error("UNSUPPORTED_MEDIA_TYPE"), { statusCode: 415 });
    }
    const objectPath = `reviews/${userId}/${randomBytes(16).toString("hex")}.${getFileExtension(validation.mime!)}`;
    return uploadFileToBucket(bucket, objectPath, file);
  },

  async uploadReviewImages(
    userId: number,
    files: Express.Multer.File[]
  ): Promise<{ items: { path: string; publicUrl: string }[] }> {
    const items = await Promise.all(
      files.map((file) => storageService.uploadReviewImage(userId, file))
    );
    return { items };
  },

  async uploadDiaryImage(userId: number, file: Express.Multer.File): Promise<{ path: string; publicUrl: string }> {
    const bucket = env.supabaseStorageBucket;
    // Validate magic bytes first to get correct MIME type
    const validation = validateImageFile(file.buffer);
    if (!validation.valid) {
      throw Object.assign(new Error("UNSUPPORTED_MEDIA_TYPE"), { statusCode: 415 });
    }
    const objectPath = `diaries/${userId}/${randomBytes(16).toString("hex")}.${getFileExtension(validation.mime!)}`;
    return uploadFileToBucket(bucket, objectPath, file);
  },

  async uploadTripCover(userId: number, file: Express.Multer.File): Promise<{ path: string; publicUrl: string }> {
    const bucket = env.supabaseStorageBucket;
    const validation = validateImageFile(file.buffer);
    if (!validation.valid) {
      throw Object.assign(new Error("UNSUPPORTED_MEDIA_TYPE"), { statusCode: 415 });
    }
    const objectPath = `trips/${userId}/${randomBytes(16).toString("hex")}.${getFileExtension(validation.mime!)}`;
    return uploadFileToBucket(bucket, objectPath, file);
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
    // Validate magic bytes first to get correct MIME type
    const validation = validateImageFile(file.buffer);
    if (!validation.valid) {
      throw Object.assign(new Error("UNSUPPORTED_MEDIA_TYPE"), { statusCode: 415 });
    }
    const detectedMime = validation.mime!;
    if (!ALLOWED.has(detectedMime)) {
      throw Object.assign(new Error("UNSUPPORTED_MEDIA_TYPE"), { statusCode: 415 });
    }
    const ext = getFileExtension(detectedMime);
    const objectPath = `places/${userId}/${randomBytes(16).toString("hex")}.${ext}`;
    const bucket = env.supabaseStorageBucket;
    return uploadFileToBucket(bucket, objectPath, file);
  },
};
