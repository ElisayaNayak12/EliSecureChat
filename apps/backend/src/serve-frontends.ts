import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import express from "express";
import type { INestApplication } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

/**
 * Production hosting on ONE server/domain: the backend also serves the built web app (at /) and the admin
 * console (at /admin/), so the secure refresh cookie works and only one thing needs hosting.
 *
 *   WEB_DIST_DIR=apps/web/dist      (npm run web:build)
 *   ADMIN_DIST_DIR=apps/admin/dist  (ADMIN_BASE=/admin/ npm run admin:build)
 *
 * Unset (local development) = nothing is served; Vite dev servers are used instead.
 */
export function serveFrontends(app: INestApplication) {
  const server = app.getHttpAdapter().getInstance() as express.Express;
  // Pages may use the camera/microphone (calls, voice messages, sign detection) - API responses still may not.
  const pageHeaders = (res: Response) => {
    res.setHeader("Permissions-Policy", "camera=(self), microphone=(self), display-capture=(self), geolocation=()");
  };
  const mount = (urlBase: string, dirEnv: string | undefined, label: string) => {
    if (!dirEnv) return;
    const dir = resolve(dirEnv);
    const indexFile = join(dir, "index.html");
    if (!existsSync(indexFile)) {
      console.warn(`[frontends] ${label}: ${indexFile} not found - build it first. Not serving ${urlBase}.`);
      return;
    }
    const index = readFileSync(indexFile);
    const assets = express.static(dir, {
      index: false,
      redirect: false,
      fallthrough: true,
      setHeaders: (res, path) => {
        pageHeaders(res);
        // Hashed build assets never change; HTML must always be revalidated.
        res.setHeader("Cache-Control", /[\\/]assets[\\/]/.test(path) ? "public, max-age=31536000, immutable" : "no-cache");
      },
    });
    const sendIndex = (_req: Request, res: Response) => {
      pageHeaders(res);
      res.setHeader("Cache-Control", "no-cache");
      res.type("html").send(index);
    };
    if (urlBase === "/") {
      server.use(assets);
      // Browser navigations (Accept: text/html) to unknown paths get the app; API calls (fetch/XHR) never do.
      server.get("/", sendIndex);
    } else {
      // Express routing is not strict: "/admin" also matches "/admin/", so check the real URL.
      server.get(urlBase, (req, res) => (req.originalUrl.split("?")[0].endsWith("/") ? sendIndex(req, res) : res.redirect(301, `${urlBase}/`)));
      server.use(urlBase, assets);
    }
    console.log(`[frontends] serving ${label} from ${dir} at ${urlBase}`);
  };
  // Admin first so /admin/ is not swallowed by the web app's static handler.
  mount("/admin", process.env.ADMIN_DIST_DIR, "admin console");
  mount("/", process.env.WEB_DIST_DIR, "web app");
}

/** The web/admin apps call the API under /api (same origin). The routes themselves have no prefix. */
export function stripApiPrefix(req: Request, _res: Response, next: NextFunction) {
  if (req.url === "/api" || req.url.startsWith("/api/") || req.url.startsWith("/api?")) req.url = req.url.slice(4) || "/";
  next();
}
