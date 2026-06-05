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
      if (e instanceof Error) {
        if (e.message === "EMAIL_TAKEN") {
          res.status(409).json(jsonError(409, "EMAIL_TAKEN"));
          return;
        }
        if (e.message === "EMAIL_SEND_FAILED") {
          res.status(500).json(jsonError(500, "EMAIL_SEND_FAILED"));
          return;
        }
      }
      throw e;
    }
  })
);

authRouter.get(
  "/verify-email",
  wrapAsync(async (req, res) => {
    const token = String(req.query.token);
    try {
      await authService.verifyEmail(token);

      // Instead of JSON, return a beautiful HTML page
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Account Verified - Travel App</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f9; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .card { background: white; padding: 40px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); text-align: center; max-width: 400px; width: 90%; }
            .icon { background: #4BB543; color: white; width: 64px; height: 64px; border-radius: 50%; display: flex; justify-content: center; align-items: center; font-size: 32px; margin: 0 auto 24px; }
            h1 { color: #1a202c; margin-bottom: 16px; font-size: 24px; }
            p { color: #4a5568; line-height: 1.6; margin-bottom: 32px; }
            .btn { background: #007AFF; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block; transition: background 0.2s; }
            .btn:hover { background: #0056b3; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">✓</div>
            <h1>Verified!</h1>
            <p>Your email has been successfully verified. You can now return to the app and log in to start your journey.</p>
            <a href="#" class="btn" onclick="window.close()">Close Tab</a>
          </div>
        </body>
        </html>
      `);
    } catch (e) {
      const message = e instanceof Error ? e.message : "INVALID_TOKEN";
      const isExpired = message === "TOKEN_EXPIRED";

      res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Verification Failed - Travel App</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #fff5f5; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .card { background: white; padding: 40px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); text-align: center; max-width: 400px; width: 90%; }
            .icon { background: #ff4d4d; color: white; width: 64px; height: 64px; border-radius: 50%; display: flex; justify-content: center; align-items: center; font-size: 32px; margin: 0 auto 24px; }
            h1 { color: #1a202c; margin-bottom: 16px; font-size: 24px; }
            p { color: #4a5568; line-height: 1.6; margin-bottom: 32px; }
            .btn { background: #4a5568; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">!</div>
            <h1>Verification Failed</h1>
            <p>${isExpired ? "This verification link has expired. Please request a new one from the app." : "This link is invalid or has already been used."}</p>
            <a href="#" class="btn" onclick="window.close()">Close Tab</a>
          </div>
        </body>
        </html>
      `);
    }
  })
);

authRouter.post(
  "/request-otp",
  wrapAsync(async (req, res) => {
    const { email } = req.body;
    if (!email) {
      res.status(400).json(jsonError(400, "EMAIL_REQUIRED"));
      return;
    }
    try {
      const out = await authService.requestPasswordOtp(email);
      res.json({ ok: true, data: out });
    } catch (e) {
      if (e instanceof Error && e.message === "OTP_TOO_FREQUENT") {
        res.status(429).json(jsonError(429, "OTP_TOO_FREQUENT"));
        return;
      }
      throw e;
    }
  })
);

authRouter.post(
  "/change-password-otp",
  wrapAsync(async (req, res) => {
    try {
      const out = await authService.changePasswordWithOtp(req.body);
      res.json({ ok: true, data: out });
    } catch (e) {
      if (e instanceof Error) {
        if (e.message === "INVALID_OTP") {
          res.status(400).json(jsonError(400, "INVALID_OTP"));
          return;
        }
        if (e.message === "OTP_EXPIRED") {
          res.status(400).json(jsonError(400, "OTP_EXPIRED"));
          return;
        }
      }
      throw e;
    }
  })
);

authRouter.post(
  "/resend-verification",
  wrapAsync(async (req, res) => {
    const { email } = req.body;
    if (!email) {
      res.status(400).json(jsonError(400, "EMAIL_REQUIRED"));
      return;
    }
    const out = await authService.resendVerification(email);
    res.json({ ok: true, data: out });
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
      const body = req.body as any;
      // If request has 'otp' or 'code', use OTP-based change password
      if (body && (body.otp || body.code)) {
        const out = await authService.changePasswordWithOtp(req.body);
        res.json({ ok: true, data: out });
        return;
      }

      // Otherwise fallback to old token-based logic
      const out = await authService.resetPassword(req.body);
      res.json({ ok: true, data: out });
    } catch (e) {
      if (e instanceof Error) {
        if (e.message === "INVALID_RESET_TOKEN" || e.message === "INVALID_OTP") {
          res.status(400).json(jsonError(400, e.message));
          return;
        }
        if (e.message === "OTP_EXPIRED") {
          res.status(400).json(jsonError(400, "OTP_EXPIRED"));
          return;
        }
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
      if (e instanceof Error) {
        if (e.message === "INVALID_CREDENTIALS") {
          res.status(401).json(jsonError(401, "INVALID_CREDENTIALS"));
          return;
        }
        if (e.message === "USER_BANNED") {
          res.status(403).json(jsonError(403, "USER_BANNED"));
          return;
        }
        if (e.message === "EMAIL_NOT_VERIFIED") {
          res.status(403).json(jsonError(403, "EMAIL_NOT_VERIFIED"));
          return;
        }
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
