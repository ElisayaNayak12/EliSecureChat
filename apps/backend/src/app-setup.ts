import { ValidationPipe, type INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { NextFunction, Request, Response } from "express";
import { RateLimiter } from "./security/rate-limit";
import { stripApiPrefix } from "./serve-frontends";

/** Comma-separated list; defaults to the local dev web + admin apps. */
export function allowedOrigins() {
  return (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173,http://localhost:5174").split(",").map((o) => o.trim()).filter(Boolean);
}

/** Paths that are attractive for guessing/abuse get a much smaller budget than normal traffic. */
const SENSITIVE = /^\/(api\/)?auth\/(sign-in|sign-up(\/(start|resend|verify))?|refresh|password-reset\/(request|confirm)|admin\/sign-in)$/;

/** Shared by main.ts and the tests so both run with identical settings. */
export function configureApp(app: INestApplication) {
  const express = app as NestExpressApplication;
  // Behind a reverse proxy (production), trust X-Forwarded-For for client IPs.
  if (process.env.TRUST_PROXY) express.set("trust proxy", process.env.TRUST_PROXY);

  const origins = allowedOrigins();
  app.enableCors({
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => cb(null, !origin || origins.includes(origin)), // no Origin = same-origin/non-browser
    credentials: true,
  });

  // Same-origin hosting: the browser apps call /api/...; routes have no prefix (the dev proxy strips it the same way).
  express.use(stripApiPrefix);

  // Security headers for every API response.
  express.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cross-Origin-Resource-Policy", "same-site");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (process.env.NODE_ENV === "production") res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    res.removeHeader("X-Powered-By");
    next();
  });

  // Rate limits (per client IP): general traffic, and a strict budget for authentication endpoints.
  const general = new RateLimiter(Number(process.env.RATE_LIMIT_PER_MIN ?? 600), 60_000);
  const sensitive = new RateLimiter(Number(process.env.AUTH_RATE_LIMIT_PER_MIN ?? 20), 60_000);
  express.use((req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const wait = SENSITIVE.test(req.path) ? sensitive.check(`${ip}:${req.path}`) : general.check(ip);
    if (wait > 0) {
      res.setHeader("Retry-After", String(Math.ceil(wait / 1000)));
      res.status(429).json({ statusCode: 429, message: "TOO_MANY_REQUESTS" });
      return;
    }
    next();
  });

  // Recorded signs are landmark arrays (~200 KB); the Express default of 100 KB is too small.
  express.useBodyParser("json", { limit: "2mb" });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
}
