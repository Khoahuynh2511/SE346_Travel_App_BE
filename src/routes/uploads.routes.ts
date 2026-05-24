import multer from "multer";
import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireOwner } from "../middleware/requireOwner.js";
import { storageService } from "../services/storage.service.js";
import { wrapAsync } from "../http/errors.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

export const uploadsRouter = Router();

uploadsRouter.post(
  "/review-image",
  requireAuth,
  (req, res, next) => {
    upload.single("file")(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(413).json({ ok: false, error: "FILE_TOO_LARGE" });
          return;
        }
        res.status(400).json({ ok: false, error: err.code });
        return;
      }
      next(err as Error | undefined);
    });
  },
  wrapAsync(async (req, res) => {
    if (!req.file) {
      res.status(400).json({ ok: false, error: "MISSING_FILE" });
      return;
    }
    try {
      const data = await storageService.uploadReviewImage(req.user!.sub, req.file);
      res.status(201).json({ ok: true, data });
    } catch (e) {
      if (e instanceof Error) {
        if (e.message === "STORAGE_UNAVAILABLE") {
          res.status(503).json({ ok: false, error: "STORAGE_UNAVAILABLE" });
          return;
        }
        if (e.message === "FILE_TOO_LARGE") {
          res.status(413).json({ ok: false, error: "FILE_TOO_LARGE" });
          return;
        }
        if (e.message === "UNSUPPORTED_MEDIA_TYPE") {
          res.status(415).json({ ok: false, error: "UNSUPPORTED_MEDIA_TYPE" });
          return;
        }
      }
      throw e;
    }
  })
);

uploadsRouter.post(
  "/review-images",
  requireAuth,
  (req, res, next) => {
    upload.array("files", 10)(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(413).json({ ok: false, error: "FILE_TOO_LARGE" });
          return;
        }
        res.status(400).json({ ok: false, error: err.code });
        return;
      }
      next(err as Error | undefined);
    });
  },
  wrapAsync(async (req, res) => {
    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length === 0) {
      res.status(400).json({ ok: false, error: "MISSING_FILE" });
      return;
    }
    try {
      const data = await storageService.uploadReviewImages(req.user!.sub, files);
      res.status(201).json({ ok: true, data });
    } catch (e) {
      if (e instanceof Error) {
        if (e.message === "STORAGE_UNAVAILABLE") {
          res.status(503).json({ ok: false, error: "STORAGE_UNAVAILABLE" });
          return;
        }
        if (e.message === "FILE_TOO_LARGE") {
          res.status(413).json({ ok: false, error: "FILE_TOO_LARGE" });
          return;
        }
        if (e.message === "UNSUPPORTED_MEDIA_TYPE") {
          res.status(415).json({ ok: false, error: "UNSUPPORTED_MEDIA_TYPE" });
          return;
        }
      }
      throw e;
    }
  })
);

uploadsRouter.post(
  "/place-cover",
  requireAuth,
  requireOwner,
  (req, res, next) => {
    upload.single("file")(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(413).json({ ok: false, error: "FILE_TOO_LARGE" });
          return;
        }
        res.status(400).json({ ok: false, error: err.code });
        return;
      }
      next(err as Error | undefined);
    });
  },
  wrapAsync(async (req, res) => {
    if (!req.file) {
      res.status(400).json({ ok: false, error: "MISSING_FILE" });
      return;
    }
    try {
      const data = await storageService.uploadPlaceCover(req.user!.sub, req.file);
      res.status(201).json({ ok: true, data: { publicUrl: data.publicUrl } });
    } catch (e) {
      if (e instanceof Error) {
        if (e.message === "STORAGE_UNAVAILABLE") {
          res.status(503).json({ ok: false, error: "STORAGE_UNAVAILABLE" });
          return;
        }
        if (e.message === "FILE_TOO_LARGE") {
          res.status(413).json({ ok: false, error: "FILE_TOO_LARGE" });
          return;
        }
        if (e.message === "UNSUPPORTED_MEDIA_TYPE") {
          res.status(415).json({ ok: false, error: "UNSUPPORTED_MEDIA_TYPE" });
          return;
        }
      }
      throw e;
    }
  })
);
