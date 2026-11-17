import { Controller, Get, Res } from "@nestjs/common";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Response } from "express";
import { Public } from "./auth/decorators";

/** Latest Android build, published by the "Flutter Android" GitHub workflow. */
export const DEFAULT_ANDROID_APK_URL =
  "https://github.com/ElisayaNayak12/EliSecureChat/releases/download/android-latest/EliSecureChat.apk";

/**
 * Phones must use the installed app (it blocks screenshots and screen recording; browsers cannot), so the web app
 * sends phone users here. Serves ANDROID_APK_FILE when the server has a copy, otherwise redirects to the latest build.
 */
@Public()
@Controller("app")
export class AppDownloadController {
  @Get("android")
  android(@Res() res: Response) {
    const file = process.env.ANDROID_APK_FILE ? resolve(process.cwd(), process.env.ANDROID_APK_FILE) : "";
    if (file && existsSync(file)) {
      res.setHeader("Content-Type", "application/vnd.android.package-archive");
      return res.download(file, "EliSecureChat.apk");
    }
    return res.redirect(302, process.env.ANDROID_APK_URL || DEFAULT_ANDROID_APK_URL);
  }
}
