/** Boots the real Nest app on a random port against a throwaway store, with helpers for authenticated calls. */
import "reflect-metadata";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { INestApplication } from "@nestjs/common";

export type TestApp = {
  app: INestApplication;
  base: string;
  dir: string;
  store: import("../src/store/in-memory.store").InMemoryStore;
  auth: import("../src/auth/auth.service").AuthService;
  /** Emails/SMS the server "sent" (dev outbox). */
  notify: import("../src/notifications/notification.service").NotificationService;
  /** Latest 6-digit code sent to an email address or phone number. */
  lastCode(to: string): string | undefined;
  createUser(name: string, phone: string, password?: string): string;
  tokenFor(userId: string): string;
  close(): Promise<void>;
};

export async function bootApp(prefix: string, env: Record<string, string> = {}): Promise<TestApp> {
  const dir = mkdtempSync(join(tmpdir(), `signconnect-${prefix}-`));
  process.env.STORE_FILE = join(dir, "store.json");
  process.env.SIGN_VIDEO_DIR = join(dir, "videos");
  process.env.DATASET_DIR = join(dir, "dataset");
  process.env.UPLOADS_DIR = join(dir, "uploads");
  process.env.OUTBOX_DIR = join(dir, "outbox");
  process.env.EMAIL_MX_CHECK = "off"; // no DNS lookups in tests (checkEmail is unit-tested with a fake resolver)
  Object.assign(process.env, env);
  const { NestFactory } = await import("@nestjs/core");
  const { AppModule } = await import("../src/app.module");
  const { configureApp } = await import("../src/app-setup");
  const { InMemoryStore } = await import("../src/store/in-memory.store");
  const { AuthService } = await import("../src/auth/auth.service");
  const { NotificationService } = await import("../src/notifications/notification.service");
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  await app.listen(0);
  const base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  const store = app.get(InMemoryStore);
  const auth = app.get(AuthService);
  const notify = app.get(NotificationService);
  return {
    app,
    base,
    dir,
    store,
    auth,
    notify,
    lastCode: (to) => [...notify.sent].reverse().find((m) => m.to === to)?.text.match(/\b\d{6}\b/)?.[0],
    createUser: (name, phone, password = "password-123") => store.createUser({ name, phone, passwordHash: store.hashPassword(password) }).id,
    tokenFor: (userId) => auth.issue(store.users.find((u) => u.id === userId)!, "test").accessToken,
    close: async () => {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** fetch + JSON with an optional bearer token. */
export async function call(base: string, method: string, path: string, opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(base + path, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json, headers: res.headers };
}
