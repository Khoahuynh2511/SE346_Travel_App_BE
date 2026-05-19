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
  "/oauth/:provider",
  wrapAsync(async (req, res) => {
    const provider = String(req.params.provider);
    if (provider !== "google" && provider !== "apple") {
      res.status(400).json(jsonError(400, "INVALID_PROVIDER"));
      return;
    }
    try {
      authService.oauthNotImplemented(provider);
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("OAUTH_")) {
        res.status(501).json(jsonError(501, e.message));
        return;
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
      throw e;
    }
  })
);
