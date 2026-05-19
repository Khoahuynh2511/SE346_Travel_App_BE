import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { loadOpenApiDocument } from "./openapi/loadOpenApiDocument.js";
import { authRouter } from "./routes/auth.routes.js";
import { usersRouter } from "./routes/users.routes.js";
import { placesRouter } from "./routes/places.routes.js";
import { reviewsRouter } from "./routes/reviews.routes.js";
import { uploadsRouter } from "./routes/uploads.routes.js";
import { ownerRouter } from "./routes/owner.routes.js";
import { aiRouter } from "./routes/ai.routes.js";
import { supabaseConfigured } from "./integrations/supabaseAdmin.js";
import { httpErrorMiddleware } from "./http/errors.js";
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

const app = express();
app.use(cors());
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
api.use("/auth", authRouter);
api.use("/users", usersRouter);
api.use("/places", placesRouter);
api.use("/reviews", reviewsRouter);
api.use("/uploads", uploadsRouter);
api.use("/owner", ownerRouter);
api.use("/ai", aiRouter);
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
