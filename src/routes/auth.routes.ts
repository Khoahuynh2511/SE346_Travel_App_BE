import { Router } from "express";
import { authService } from "../services/auth.service.js";
import { jsonError, wrapAsync } from "../http/errors.js";

export const authRouter = Router();

authRouter.post(
  "/register",
  wrapAsync(async (req, res) => {
    try {
      const out = await authService.register(req.body);
      res.status(201).json({ ok: true, data: out });
    } catch (e) {
      if (e instanceof Error && e.message === "EMAIL_TAKEN") {
        res.status(409).json(jsonError(409, "EMAIL_TAKEN"));
        return;
      }
      throw e;
    }
  })
);

authRouter.post(
  "/forgot-password",
  wrapAsync(async (req, res) => {
    const out = await authService.forgotPassword(req.body);
    res.json({ ok: true, data: out });
  })
);

authRouter.post(
  "/reset-password",
  wrapAsync(async (req, res) => {
    try {
      const out = await authService.resetPassword(req.body);
      res.json({ ok: true, data: out });
    } catch (e) {
      if (e instanceof Error && e.message === "INVALID_RESET_TOKEN") {
        res.status(400).json(jsonError(400, "INVALID_RESET_TOKEN"));
        return;
      }
      throw e;
    }
  })
);

authRouter.post(
  "/oauth/:provider",
  wrapAsync(async (req, res) => {
    const provider = String(req.params.provider);
    if (provider !== "google" && provider !== "apple") {
      res.status(400).json(jsonError(400, "INVALID_PROVIDER"));
      return;
    }

    if (provider === "apple") {
      res.status(501).json(jsonError(501, "OAUTH_APPLE_NOT_CONFIGURED"));
      return;
    }

    // Google OAuth
    const { idToken, role } = req.body;
    if (!idToken || typeof idToken !== "string") {
      res.status(400).json(jsonError(400, "MISSING_ID_TOKEN"));
      return;
    }

    try {
      const out = await authService.oauthGoogle(idToken, role);
      res.status(200).json({ ok: true, data: out });
    } catch (e) {
      if (e instanceof Error) {
        if (e.message === "OAUTH_GOOGLE_NOT_CONFIGURED") {
          res.status(501).json(jsonError(501, "OAUTH_GOOGLE_NOT_CONFIGURED"));
          return;
        }
        if (e.message === "INVALID_GOOGLE_TOKEN") {
          res.status(401).json(jsonError(401, "INVALID_GOOGLE_TOKEN"));
          return;
        }
        if (e.message === "USER_BANNED") {
          res.status(403).json(jsonError(403, "USER_BANNED"));
          return;
        }
      }
      throw e;
    }
  })
);

authRouter.post(
  "/login",
  wrapAsync(async (req, res) => {
    try {
      const out = await authService.login(req.body);
      res.json({ ok: true, data: out });
    } catch (e) {
      if (e instanceof Error && e.message === "INVALID_CREDENTIALS") {
        res.status(401).json(jsonError(401, "INVALID_CREDENTIALS"));
        return;
      }
      if (e instanceof Error && e.message === "USER_BANNED") {
        res.status(403).json(jsonError(403, "USER_BANNED"));
        return;
      }
      throw e;
    }
  })
);

authRouter.post(
  "/refresh",
  wrapAsync(async (req, res) => {
    try {
      const out = await authService.refreshAccessToken(req.body);
      res.json({ ok: true, data: out });
    } catch (e) {
      if (e instanceof Error && (e.message === "INVALID_REFRESH_TOKEN" || e.message === "REFRESH_TOKEN_EXPIRED")) {
        res.status(401).json(jsonError(401, e.message));
        return;
      }
      throw e;
    }
  })
);

authRouter.post(
  "/logout",
  wrapAsync(async (req, res) => {
    await authService.revokeRefreshToken(req.body);
    res.json({ ok: true, data: { message: "Logged out successfully" } });
  })
);
