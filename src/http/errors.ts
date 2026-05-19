export function jsonError(status: number, code: string) {
  return { ok: false, error: code } as const;
}

export function wrapAsync(
  handler: (
    req: import("express").Request,
    res: import("express").Response,
    next: import("express").NextFunction
  ) => Promise<void>
) {
  return (
    req: import("express").Request,
    res: import("express").Response,
    next: import("express").NextFunction
  ) => {
    void handler(req, res, next).catch(next);
  };
}

export function httpErrorMiddleware(
  err: unknown,
  _req: import("express").Request,
  res: import("express").Response,
  _next: import("express").NextFunction
) {
  const status =
    err &&
    typeof err === "object" &&
    "statusCode" in err &&
    typeof (err as { statusCode: unknown }).statusCode === "number"
      ? (err as { statusCode: number }).statusCode
      : 500;
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "INTERNAL";
  if (!res.headersSent) {
    res.status(status >= 400 && status < 600 ? status : 500).json(jsonError(status, message));
  }
}
