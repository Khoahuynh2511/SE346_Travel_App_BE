import type { Request, Response, NextFunction } from "express";
import { prisma } from "../database/client.js";

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  void (async () => {
    if (!req.user?.sub) {
      res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { role: true, isBanned: true },
    });
    if (user?.isBanned) {
      res.status(403).json({ ok: false, error: "USER_BANNED" });
      return;
    }
    if (!user || user.role !== "ADMIN") {
      res.status(403).json({ ok: false, error: "FORBIDDEN" });
      return;
    }
    next();
  })().catch(next);
}
