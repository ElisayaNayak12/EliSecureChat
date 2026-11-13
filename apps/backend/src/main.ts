import "reflect-metadata";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { configureApp } from "./app-setup";
import { serveFrontends } from "./serve-frontends";

/** Local settings (SMTP, admin password, ...) from apps/backend/.env if present. Real env variables win. */
function loadLocalEnv() {
  for (const file of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "apps/backend/.env")]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      if (line.trimStart().startsWith("#")) continue;
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      const value = m[2].replace(/^(["'])(.*)\1$/, "$2");
      if (process.env[m[1]] === undefined) process.env[m[1]] = value;
    }
    console.log(`Loaded settings from ${file}`);
    return;
  }
}

async function bootstrap() {
  loadLocalEnv();
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  serveFrontends(app);
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`Secure chat backend running on http://localhost:${port}`);
}

bootstrap();
