import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  HttpException,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { InMemoryStore } from "../store/in-memory.store";
import type { User } from "../store/models";
import { AuthService, type IssuedSession } from "./auth.service";
import { CurrentUser, Public, type AuthUser } from "./decorators";
import { AdminSignInDto } from "./dto/admin-sign-in.dto";
import { SignInDto } from "./dto/sign-in.dto";
import { SignUpDto } from "./dto/sign-up.dto";
import { REFRESH_TOKEN_TTL_S } from "./tokens";
import { DEFAULT_COUNTRY, passwordProblem } from "./contact";
import { VerificationError, VerificationService } from "./verification.service";

/** Turns verification errors into HTTP errors the apps can show (with the field to highlight). */
function fail(err: unknown): never {
  if (err instanceof VerificationError) throw new HttpException({ statusCode: err.status, message: err.message, field: err.field }, err.status);
  throw err;
}

export const REFRESH_COOKIE = "sc_refresh";

/** Very small user-agent summary for the "your devices" list. */
function deviceLabel(ua = "") {
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : /Dart|okhttp/i.test(ua) ? "Mobile app" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

function readCookie(req: Request, name: string) {
  const raw = req.headers.cookie ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

function strongEnough(password: unknown): password is string {
  return typeof password === "string" && password.length >= 8 && password.length <= 128;
}

@Controller("auth")
export class AuthController {
  constructor(
    @Inject(InMemoryStore) private readonly store: InMemoryStore,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(VerificationService) private readonly verify: VerificationService,
  ) {}

  private publicUser(user: User) {
    const { passwordHash: _p, ...rest } = user;
    return rest;
  }

  /**
   * Browsers get the refresh token as an httpOnly, SameSite=Strict cookie (unreadable by scripts).
   * Native apps (body.client === "native") get it in the response body to keep in secure storage.
   */
  private respond(req: Request, res: Response, user: User, issued: IssuedSession, native: boolean) {
    if (native) {
      return { user: this.publicUser(user), accessToken: issued.accessToken, refreshToken: issued.refreshToken, expiresIn: issued.expiresIn, sessionId: issued.sessionId, tokenType: "Bearer" };
    }
    const secure = process.env.NODE_ENV === "production" || req.headers["x-forwarded-proto"] === "https";
    res.cookie(REFRESH_COOKIE, issued.refreshToken, {
      httpOnly: true,
      sameSite: "strict",
      secure,
      path: "/",
      maxAge: REFRESH_TOKEN_TTL_S * 1000,
    });
    return { user: this.publicUser(user), accessToken: issued.accessToken, expiresIn: issued.expiresIn, sessionId: issued.sessionId, tokenType: "Bearer" };
  }

  private clearCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE, { path: "/" });
  }

  /* ---------------- verified sign-up (like WhatsApp/Telegram) ---------------- */

  /** What this server can do, for the sign-up / forgot-password screens. */
  @Public()
  @Get("options")
  options() {
    return {
      defaultCountry: DEFAULT_COUNTRY,
      verification: { email: this.verify.notify.emailAvailable, sms: this.verify.notify.smsAvailable },
      resetChannels: this.verify.resetChannels,
      passwordRules: "At least 8 characters, with letters and numbers. Not your name, phone number or email.",
    };
  }

  /** Step 1: validate everything and send the code(s). No account exists yet. */
  @Public()
  @Post("sign-up/start")
  @HttpCode(200)
  async signUpStart(@Body() body: { name?: string; phone?: string; email?: string; password?: string; country?: string }) {
    try {
      return await this.verify.startRegistration(body ?? {});
    } catch (err) {
      fail(err);
    }
  }

  @Public()
  @Post("sign-up/resend")
  @HttpCode(200)
  async signUpResend(@Body() body: { registrationId?: string; channel?: string }) {
    try {
      return await this.verify.resendRegistrationCode(body?.registrationId, body?.channel);
    } catch (err) {
      fail(err);
    }
  }

  /** Step 2: confirm the code(s): the account is created and signed in, and a welcome email/SMS is sent. */
  @Public()
  @Post("sign-up/verify")
  @HttpCode(200)
  signUpVerify(@Body() body: { registrationId?: string; emailCode?: string; smsCode?: string; client?: string }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    let user: User;
    try {
      user = this.verify.verifyRegistration(body?.registrationId, body?.emailCode, body?.smsCode);
    } catch (err) {
      fail(err);
    }
    return this.respond(req, res, user, this.auth.issue(user, deviceLabel(req.headers["user-agent"])), body?.client === "native");
  }

  /** Direct sign-up without verification: development and automated tests only (disabled in production). */
  @Public()
  @Post("sign-up")
  signUp(@Body() dto: SignUpDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (process.env.NODE_ENV === "production") throw new ForbiddenException("Use the verified sign-up (/auth/sign-up/start).");
    if (!strongEnough(dto.password)) throw new BadRequestException("Password must be 8-128 characters.");
    if (typeof dto.phone !== "string" || !/^\+?[0-9]{6,15}$/.test(dto.phone.replace(/[\s-]/g, ""))) throw new BadRequestException("Enter a valid phone number.");
    const phone = dto.phone.replace(/[\s-]/g, "");
    if (typeof dto.name !== "string" || dto.name.trim().length < 2 || dto.name.trim().length > 60) throw new BadRequestException("Name must be 2-60 characters.");
    const existing = this.store.findUserByPhone(phone);
    if (existing) throw new ConflictException("PHONE_ALREADY_REGISTERED");
    if (dto.email && this.store.findUserByEmail(dto.email)) throw new ConflictException("EMAIL_ALREADY_REGISTERED");
    const user = this.store.createUser({ name: dto.name.trim(), phone, email: dto.email, passwordHash: this.store.hashPassword(dto.password) });
    return this.respond(req, res, user, this.auth.issue(user, deviceLabel(req.headers["user-agent"])), dto.client === "native");
  }

  @Public()
  @Post("sign-in")
  @HttpCode(200)
  signIn(@Body() dto: SignInDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // Sign in with the phone number (any format) or the email address.
    const identifier = typeof dto.phone === "string" ? dto.phone.trim() : "";
    const byEmail = identifier.includes("@");
    const phone = byEmail ? identifier.toLowerCase() : identifier.replace(/[\s-]/g, "");
    const user = byEmail ? this.store.findUserByEmail(phone) : this.store.findUserByPhone(phone);
    const lockKey = `account:${user?.id ?? phone}`;
    if (this.auth.isLockedOut(lockKey)) throw new UnauthorizedException("TOO_MANY_ATTEMPTS: try again in 15 minutes.");
    // Verify a hash even for unknown users so response time does not reveal which phones are registered.
    const ok = user ? this.store.verifyPassword(String(dto.password ?? ""), user.passwordHash) : (this.store.hashPassword(String(dto.password ?? "")), false);
    if (!user || !ok) {
      this.auth.recordFailure(lockKey);
      throw new UnauthorizedException("INVALID_CREDENTIALS");
    }
    this.auth.clearFailures(lockKey);
    if ((user.status ?? "ACTIVE") === "SUSPENDED") {
      throw new ForbiddenException({ code: "ACCOUNT_SUSPENDED", userId: user.id, reason: user.suspensionReason ?? "Your account has been suspended.", message: "ACCOUNT_SUSPENDED" });
    }
    const device = deviceLabel(req.headers["user-agent"]);
    const seenBefore = this.store.sessions.some((s) => s.userId === user.id && s.device === device);
    void this.verify.newSignIn(user, device, !seenBefore);
    return this.respond(req, res, user, this.auth.issue(user, device), dto.client === "native");
  }

  /** Exchanges a refresh token (cookie, or body for native apps) for a new access token; rotates the refresh token. */
  @Public()
  @Post("refresh")
  @HttpCode(200)
  refresh(@Body() body: { refreshToken?: string; client?: string }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const native = body?.client === "native";
    const token = native ? body.refreshToken : readCookie(req, REFRESH_COOKIE);
    if (!token) throw new UnauthorizedException("NO_SESSION");
    const r = this.auth.refresh(token);
    if ("error" in r) {
      if (!native) this.clearCookie(res);
      throw new UnauthorizedException(r.error === "REUSED" ? "SESSION_REVOKED_FOR_SECURITY" : "SESSION_EXPIRED");
    }
    return this.respond(req, res, r.user, r.issued, native);
  }

  @Public()
  @Post("logout")
  @HttpCode(200)
  logout(@Body() body: { refreshToken?: string; client?: string }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = body?.client === "native" ? body.refreshToken : readCookie(req, REFRESH_COOKIE);
    if (token) {
      const r = this.auth.refresh(token); // resolves the session; we revoke it right away
      if (!("error" in r)) this.auth.revoke(r.issued.sessionId, "LOGOUT");
    }
    this.clearCookie(res);
    return { ok: true };
  }

  /* ---------------- device sessions ---------------- */

  @Get("sessions")
  sessions(@CurrentUser() me: AuthUser) {
    return this.auth.activeSessions(me.userId).map((s) => ({
      id: s.id,
      device: s.device,
      createdAt: s.createdAt,
      lastUsedAt: s.lastUsedAt,
      current: s.id === me.sessionId,
    }));
  }

  @Delete("sessions/:id")
  revokeSession(@Param("id") id: string, @CurrentUser() me: AuthUser) {
    const s = this.auth.activeSessions(me.userId).find((x) => x.id === id);
    if (!s) throw new NotFoundException("SESSION_NOT_FOUND");
    this.auth.revoke(id, "SIGNED_OUT_REMOTELY");
    return { ok: true };
  }

  @Post("sessions/revoke-others")
  @HttpCode(200)
  revokeOthers(@CurrentUser() me: AuthUser) {
    this.auth.revokeAllForUser(me.userId, "SIGNED_OUT_REMOTELY", me.sessionId);
    return { ok: true };
  }

  @Post("change-password")
  @HttpCode(200)
  changePassword(@Body() body: { currentPassword?: string; newPassword?: string }, @CurrentUser() me: AuthUser, @Req() req: Request) {
    const user = this.store.users.find((u) => u.id === me.userId)!;
    if (!this.store.verifyPassword(String(body?.currentPassword ?? ""), user.passwordHash)) throw new UnauthorizedException("WRONG_PASSWORD");
    const problem = passwordProblem(body?.newPassword, { name: user.name, phone: user.phone, email: user.email });
    if (problem) throw new BadRequestException(problem);
    user.passwordHash = this.store.hashPassword(body.newPassword as string);
    this.auth.revokeAllForUser(user.id, "PASSWORD_CHANGED", me.sessionId);
    void this.verify.passwordChanged(user, deviceLabel(req.headers["user-agent"]));
    return { ok: true };
  }

  /* ---------------- password reset (one-time code) ---------------- */

  @Public()
  @Post("password-reset/request")
  @HttpCode(200)
  async requestReset(@Body() body: { identifier?: string; phone?: string; channel?: string }) {
    const identifier = (typeof body?.identifier === "string" ? body.identifier : body?.phone ?? "").trim();
    if (!identifier) throw new BadRequestException("Enter your phone number or email.");
    const ok = await this.verify.requestReset(identifier, body?.channel);
    if (!ok) {
      throw new ServiceUnavailableException(body?.channel === "sms" ? "Password reset by SMS is not available on this server. Use email." : "Password reset is not available: no email or SMS delivery is configured on this server.");
    }
    // Identical answer whether or not an account exists (no account discovery).
    return { ok: true, message: "If an account matches, we sent a 6-digit code. It is valid for 10 minutes." };
  }

  @Public()
  @Post("password-reset/confirm")
  @HttpCode(200)
  confirmReset(@Body() body: { identifier?: string; phone?: string; code?: string; newPassword?: string }, @Req() req: Request) {
    const identifier = (typeof body?.identifier === "string" ? body.identifier : body?.phone ?? "").trim();
    const r = this.verify.confirmReset(identifier, body?.code, body?.newPassword, deviceLabel(req.headers["user-agent"]));
    if (r === "WEAK_PASSWORD") throw new BadRequestException(passwordProblem(body?.newPassword) ?? "Choose a stronger password (letters and numbers, not your name, phone or email).");
    if (r !== "OK") throw new BadRequestException(r === "EXPIRED" ? "CODE_EXPIRED" : r === "TOO_MANY_ATTEMPTS" ? "TOO_MANY_ATTEMPTS" : "INVALID_CODE");
    return { ok: true };
  }

  /* ---------------- admin ---------------- */

  @Public()
  @Post("admin/sign-in")
  @HttpCode(200)
  adminSignIn(@Body() dto: AdminSignInDto) {
    const key = "admin";
    if (this.auth.isLockedOut(key)) throw new UnauthorizedException("TOO_MANY_ATTEMPTS: try again in 15 minutes.");
    if (!this.store.adminLoginEnabled) throw new ServiceUnavailableException("Admin console disabled: set ADMIN_PASSWORD (12+ characters).");
    if (!this.store.verifyAdminCredentials(dto.username, dto.password)) {
      this.auth.recordFailure(key);
      throw new UnauthorizedException("INVALID_ADMIN_CREDENTIALS");
    }
    this.auth.clearFailures(key);
    return { adminToken: this.store.createAdminSession(), username: dto.username, tokenType: "Bearer" };
  }

  @Public()
  @Post("admin/sign-out")
  @HttpCode(200)
  adminSignOut(@Headers("x-admin-token") token?: string) {
    if (token) this.store.revokeAdminSession(token);
    return { ok: true };
  }
}
