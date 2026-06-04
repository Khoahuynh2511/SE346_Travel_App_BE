import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import pinoHttp from "pino-http";
import { loadOpenApiDocument } from "./openapi/loadOpenApiDocument.js";
import { logger } from "./utils/logger.js";
import { authRouter } from "./routes/auth.routes.js";
import { usersRouter } from "./routes/users.routes.js";
import { placesRouter } from "./routes/places.routes.js";
import { reviewsRouter } from "./routes/reviews.routes.js";
import { uploadsRouter } from "./routes/uploads.routes.js";
import { ownerRouter } from "./routes/owner.routes.js";
import { adminRouter } from "./routes/admin.routes.js";
import { aiRouter } from "./routes/ai.routes.js";
import { tripsRouter } from "./routes/trips.routes.js";
import { tripDiaryRouter } from "./routes/tripDiary.routes.js";
import { meRouter } from "./routes/me.routes.js";
import { notificationRouter } from "./routes/notification.routes.js";
import { itineraryOptimizerRouter } from "./routes/itineraryOptimizer.routes.js";
import { recommendationRouter } from "./routes/recommendation.routes.js";
import { supabaseConfigured } from "./integrations/supabaseAdmin.js";
import { httpErrorMiddleware } from "./http/errors.js";
import { authLimiter, generalLimiter, strictLimiter } from "./middleware/rateLimit.js";
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { Router } from "express";

const app = express();
app.use(cors());
app.use(pinoHttp({ logger }));
app.use(express.json());

const openApiDoc = loadOpenApiDocument();

app.get("/openapi.json", (_req, res) => {
  res.json(openApiDoc);
});
app.use(
  "/docs",
  swaggerUi.serve,
  swaggerUi.setup(openApiDoc, {
    swaggerOptions: { persistAuthorization: true },
    customSiteTitle: "Travel App API",
  })
);

const api = express.Router();

// Apply general rate limiter to all API routes
api.use(generalLimiter);

// Apply auth rate limiter to authentication routes
api.use("/auth", authLimiter, authRouter);

// Apply strict rate limiter to upload routes (POST write operations)
api.use("/uploads", strictLimiter, uploadsRouter);

// Apply strict rate limiter to review write operations
api.use("/reviews", strictLimiter, reviewsRouter);

// Mount remaining routes with general rate limiter
api.use("/users", usersRouter);
api.use("/places", placesRouter);
api.use("/owner", ownerRouter);
api.use("/admin", adminRouter);
api.use("/ai", aiRouter);
api.use("/trips", tripsRouter);
api.use("/me", meRouter);
api.use("/notifications", notificationRouter);
api.use("/trip-diaries", tripDiaryRouter);
api.use("/itinerary", itineraryOptimizerRouter);
api.use("/recommendations", recommendationRouter);

app.use("/api/v1", api);

app.get("/health", (_req, res) =>
  res.json({
    ok: true,
    supabase: supabaseConfigured(),
  })
);

app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      ok: false,
      error: "VALIDATION",
      issues: err.flatten(),
    });
    return;
  }
  httpErrorMiddleware(err, _req, res, next);
});

export default app;
