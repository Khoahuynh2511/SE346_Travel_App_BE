import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { prisma } from "../database/client.js";

export type AppJwtPayload = { sub: number; email: string };

function isAppJwtPayload(payload: unknown): payload is AppJwtPayload {
  return (
    !!payload &&
    typeof payload === "object" &&
    typeof (payload as { sub?: unknown }).sub === "number" &&
    typeof (payload as { email?: unknown }).email === "string" &&
    (payload as { purpose?: unknown }).purpose === undefined
  );
}

declare global {
  namespace Express {
    interface Request {
      user?: AppJwtPayload;
    }
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  const token = h?.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return next();
  try {
    const payload = jwt.verify(token, env.jwtSecret) as unknown;
    if (isAppJwtPayload(payload)) {
      req.user = payload;
    }
  } catch {
    /* ignore */
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  void (async () => {
    const h = req.headers.authorization;
    const token = h?.startsWith("Bearer ") ? h.slice(7) : null;
    if (!token) {
      res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
      return;
    }

    let payload: unknown;
    try {
      payload = jwt.verify(token, env.jwtSecret) as unknown;
    } catch {
      res.status(401).json({ ok: false, error: "INVALID_TOKEN" });
      return;
    }

    if (!isAppJwtPayload(payload)) {
      res.status(401).json({ ok: false, error: "INVALID_TOKEN" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, isBanned: true },
    });

    if (!user) {
      res.status(401).json({ ok: false, error: "INVALID_TOKEN" });
      return;
    }

    if (user.isBanned) {
      res.status(403).json({ ok: false, error: "USER_BANNED" });
      return;
    }

    req.user = { sub: user.id, email: user.email };
    next();
  })().catch(next);
}
