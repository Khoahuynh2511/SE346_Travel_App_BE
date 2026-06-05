import rateLimit from "express-rate-limit";

// Rate limiter for authentication endpoints (login, register, password reset)
// 1000 requests per 15 minutes (Relaxed for testing)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "TOO_MANY_REQUESTS" },
});

// Rate limiter for POST write operations (reviews, uploads)
// 1000 requests per minute (Relaxed for testing)
export const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "TOO_MANY_REQUESTS" },
});

// General rate limiter for all other routes
// 5000 requests per 15 minutes (Relaxed for testing)
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "TOO_MANY_REQUESTS" },
});
