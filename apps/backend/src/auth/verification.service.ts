import { Inject, Injectable } from "@nestjs/common";
import { randomInt, randomUUID, timingSafeEqual } from "crypto";
import { NotificationService } from "../notifications/notification.service";
import * as T from "../notifications/templates";
import { InMemoryStore } from "../store/in-memory.store";
import type { CodeState, PendingRegistration, User } from "../store/models";
import { AuthService } from "./auth.service";
import { checkEmail, checkPhone, maskEmail, maskPhone, passwordProblem } from "./contact";
import { hashToken } from "./tokens";

export const CODE_MINUTES = 10;
const CODE_TTL_MS = CODE_MINUTES * 60_000;
const MAX_ATTEMPTS = 5;
const RESEND_AFTER_MS = 60_000;
const MAX_SENDS_PER_CODE = 5;
const REGISTRATION_TTL_MS = 30 * 60_000;
const MAX_SENDS_PER_TARGET_PER_HOUR = 6; // protects users' inboxes and the SMS bill (SMS pumping)

export class VerificationError extends Error {
  constructor(readonly status: 400 | 404 | 409 | 410 | 429 | 503, message: string, readonly field?: string) {
    super(message);
  }
}

export type Channel = "email" | "sms";
export type CodeResult = "OK" | "INVALID" | "EXPIRED" | "TOO_MANY_ATTEMPTS";

/**
 * Account verification like WhatsApp/Telegram: sign-up proves the email (and the phone, when SMS is available) with
 * one-time codes before any account exists; password reset sends a code by email or SMS; account events
 * (welcome, password changed, new sign-in) are notified by email/SMS.
 */
@Injectable()
export class VerificationService {
  private readonly targetSends = new Map<string, number[]>();

  constructor(
    @Inject(InMemoryStore) private readonly store: InMemoryStore,
    @Inject(NotificationService) readonly notify: NotificationService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  /* ---------------- codes ---------------- */

  private newCode(scope: string): { code: string; state: CodeState } {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const now = Date.now();
    return {
      code,
      state: { hash: hashToken(`${scope}:${code}`), expiresAt: new Date(now + CODE_TTL_MS).toISOString(), attempts: 0, sends: 1, lastSentAt: new Date(now).toISOString(), verified: false },
    };
  }

  private check(state: CodeState | undefined, scope: string, code: unknown): CodeResult {
    if (!state) return "INVALID";
    if (state.verified) return "OK";
    if (Date.parse(state.expiresAt) <= Date.now()) return "EXPIRED";
    if (state.attempts >= MAX_ATTEMPTS) return "TOO_MANY_ATTEMPTS";
    state.attempts++;
    const a = Buffer.from(hashToken(`${scope}:${String(code ?? "").trim()}`));
    const b = Buffer.from(state.hash);
    if (a.length === b.length && timingSafeEqual(a, b)) {
      state.verified = true;
      return "OK";
    }
    return "INVALID";
  }

  /** Per-recipient budget, so nobody can flood an inbox/phone (or run up SMS costs) through this server. */
  private allowSend(target: string) {
    const now = Date.now();
    const recent = (this.targetSends.get(target) ?? []).filter((t) => now - t < 3_600_000);
    if (recent.length >= MAX_SENDS_PER_TARGET_PER_HOUR) return false;
    recent.push(now);
    this.targetSends.set(target, recent);
    return true;
  }

  private assertResendAllowed(state: CodeState) {
    const wait = Date.parse(state.lastSentAt) + RESEND_AFTER_MS - Date.now();
    if (wait > 0) throw new VerificationError(429, `Please wait ${Math.ceil(wait / 1000)} seconds before requesting a new code.`);
    if (state.sends >= MAX_SENDS_PER_CODE) throw new VerificationError(429, "Too many codes requested. Start again in a few minutes.");
  }

  /* ---------------- sign-up ---------------- */

  async startRegistration(input: { name?: unknown; phone?: unknown; email?: unknown; password?: unknown; country?: unknown }) {
    const name = typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ") : "";
    if (name.length < 2 || name.length > 60) throw new VerificationError(400, "Enter your name (2-60 characters).", "name");
    const phone = checkPhone(input.phone, typeof input.country === "string" ? input.country : undefined);
    if (!phone.ok) throw new VerificationError(400, phone.reason, "phone");
    const email = await checkEmail(input.email);
    if (!email.ok) throw new VerificationError(400, email.reason, "email");
    const problem = passwordProblem(input.password, { name, phone: phone.e164, email: email.email });
    if (problem) throw new VerificationError(400, problem, "password");
    if (this.store.findUserByPhone(phone.e164)) throw new VerificationError(409, "An account with this phone number already exists. Sign in, or use Forgot password.", "phone");
    if (this.store.findUserByEmail(email.email)) throw new VerificationError(409, "An account with this email already exists. Sign in, or use Forgot password.", "email");
    if (!this.notify.emailAvailable) throw new VerificationError(503, "Sign-up is temporarily unavailable: email delivery is not configured on this server.");

    if (!this.allowSend(`email:${email.email}`)) throw new VerificationError(429, "Too many codes were sent to this email. Try again in an hour.", "email");
    // A new attempt replaces any unfinished one for the same phone or email.
    this.store.pendingRegistrations = this.store.pendingRegistrations.filter((r) => r.phone !== phone.e164 && r.email !== email.email && Date.parse(r.expiresAt) > Date.now());
    const id = randomUUID();
    const reg: PendingRegistration = {
      id,
      name,
      phone: phone.e164,
      email: email.email,
      passwordHash: this.store.hashPassword(input.password as string),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + REGISTRATION_TTL_MS).toISOString(),
      codes: {},
    };
    const e = this.newCode(`reg:${id}:email`);
    reg.codes.email = e.state;
    const emailSent = await this.notify.sendEmail(email.email, T.verificationEmail(name, e.code, CODE_MINUTES));
    if (!emailSent) throw new VerificationError(503, "We could not send the verification email. Check the address or try again later.", "email");
    if (this.notify.smsAvailable && this.allowSend(`sms:${phone.e164}`)) {
      const s = this.newCode(`reg:${id}:sms`);
      if (await this.notify.sendSms(phone.e164, T.sms.verification(s.code, CODE_MINUTES))) reg.codes.sms = s.state;
    }
    this.store.pendingRegistrations.push(reg);
    this.store.persist();
    return this.registrationView(reg);
  }

  registrationView(reg: PendingRegistration) {
    return {
      registrationId: reg.id,
      email: maskEmail(reg.email),
      phone: maskPhone(reg.phone),
      channels: { email: !!reg.codes.email, sms: !!reg.codes.sms },
      codeMinutes: CODE_MINUTES,
      resendAfterSeconds: RESEND_AFTER_MS / 1000,
    };
  }

  private pending(id: unknown) {
    const reg = this.store.pendingRegistrations.find((r) => r.id === id);
    if (!reg || Date.parse(reg.expiresAt) <= Date.now()) throw new VerificationError(410, "This sign-up has expired. Please start again.");
    return reg;
  }

  async resendRegistrationCode(id: unknown, channel: unknown) {
    const reg = this.pending(id);
    const ch: Channel = channel === "sms" ? "sms" : "email";
    const existing = reg.codes[ch];
    if (ch === "sms" && !this.notify.smsAvailable) throw new VerificationError(503, "SMS is not available on this server.");
    if (existing) this.assertResendAllowed(existing);
    const target = ch === "email" ? reg.email : reg.phone;
    if (!this.allowSend(`${ch}:${target}`)) throw new VerificationError(429, "Too many codes requested. Try again in an hour.");
    const c = this.newCode(`reg:${reg.id}:${ch}`);
    c.state.sends = (existing?.sends ?? 0) + 1;
    const ok = ch === "email" ? await this.notify.sendEmail(reg.email, T.verificationEmail(reg.name, c.code, CODE_MINUTES)) : await this.notify.sendSms(reg.phone, T.sms.verification(c.code, CODE_MINUTES));
    if (!ok) throw new VerificationError(503, `We could not send the ${ch === "email" ? "email" : "SMS"}. Try again later.`);
    reg.codes[ch] = c.state;
    this.store.persist();
    return this.registrationView(reg);
  }

  /** Checks the code(s); on success creates the account. Codes already confirmed stay confirmed between tries. */
  verifyRegistration(id: unknown, emailCode: unknown, smsCode: unknown): User {
    const reg = this.pending(id);
    const results: Partial<Record<Channel, CodeResult>> = { email: this.check(reg.codes.email, `reg:${reg.id}:email`, emailCode) };
    if (reg.codes.sms) results.sms = this.check(reg.codes.sms, `reg:${reg.id}:sms`, smsCode);
    this.store.persist();
    for (const ch of ["email", "sms"] as const) {
      const r = results[ch];
      if (!r || r === "OK") continue;
      const label = ch === "email" ? "email" : "SMS";
      if (r === "EXPIRED") throw new VerificationError(400, `The ${label} code has expired. Tap "Resend code".`, ch);
      if (r === "TOO_MANY_ATTEMPTS") throw new VerificationError(429, `Too many wrong ${label} codes. Tap "Resend code" to get a new one.`, ch);
      throw new VerificationError(400, `The ${label} code is not correct.`, ch);
    }
    if (this.store.findUserByPhone(reg.phone) || this.store.findUserByEmail(reg.email)) {
      this.store.pendingRegistrations = this.store.pendingRegistrations.filter((r) => r !== reg);
      this.store.persist();
      throw new VerificationError(409, "An account with this phone number or email was just created. Please sign in.");
    }
    const user = this.store.createUser({ name: reg.name, phone: reg.phone, email: reg.email, passwordHash: reg.passwordHash, emailVerified: true, phoneVerified: !!reg.codes.sms?.verified });
    this.store.pendingRegistrations = this.store.pendingRegistrations.filter((r) => r !== reg);
    this.store.persist();
    void this.welcome(user);
    return user;
  }

  /* ---------------- password reset ---------------- */

  /** Which reset channels this server can deliver (shown on the "Forgot password" screen). */
  get resetChannels() {
    return { email: this.notify.emailAvailable, sms: this.notify.smsAvailable };
  }

  private findByIdentifier(identifier: unknown): User | undefined {
    if (typeof identifier !== "string" || !identifier.trim()) return undefined;
    const id = identifier.trim();
    return id.includes("@") ? this.store.findUserByEmail(id.toLowerCase()) : this.store.findUserByPhone(id);
  }

  /**
   * Sends a reset code. The answer never reveals whether an account exists (same response either way).
   * Returns false only when the requested channel cannot be delivered at all on this server.
   */
  async requestReset(identifier: unknown, channel: unknown): Promise<boolean> {
    const wanted: Channel | undefined = channel === "sms" ? "sms" : channel === "email" ? "email" : undefined;
    if (wanted === "sms" && !this.notify.smsAvailable) return false;
    if (wanted === "email" && !this.notify.emailAvailable) return false;
    if (!this.notify.emailAvailable && !this.notify.smsAvailable) return false;
    const user = this.findByIdentifier(identifier);
    if (!user || (user.status ?? "ACTIVE") !== "ACTIVE") return true;
    // Email when asked for (or by default when the account has one); SMS otherwise.
    const ch: Channel = wanted ?? (user.email && this.notify.emailAvailable ? "email" : "sms");
    if (ch === "email" && !user.email) return true;
    if (ch === "sms" && !this.notify.smsAvailable) return true;
    const target = ch === "email" ? user.email! : user.phone;
    const previous = this.store.passwordResets.find((r) => r.userId === user.id && r.channel === ch && Date.parse(r.code.expiresAt) > Date.now());
    if (previous && Date.parse(previous.code.lastSentAt) + RESEND_AFTER_MS > Date.now()) return true; // silently rate limited
    if (!this.allowSend(`${ch}:${target}`)) return true;
    const c = this.newCode(`reset:${user.id}`);
    this.store.passwordResets = this.store.passwordResets.filter((r) => r.userId !== user.id && Date.parse(r.code.expiresAt) > Date.now());
    this.store.passwordResets.push({ userId: user.id, channel: ch, code: c.state, createdAt: new Date().toISOString() });
    this.store.persist();
    if (ch === "email") await this.notify.sendEmail(user.email!, T.resetCodeEmail(user.name, c.code, CODE_MINUTES));
    else await this.notify.sendSms(this.smsNumber(user.phone), T.sms.reset(c.code, CODE_MINUTES));
    return true;
  }

  confirmReset(identifier: unknown, code: unknown, newPassword: unknown, device = "Unknown device"): CodeResult | "WEAK_PASSWORD" {
    const user = this.findByIdentifier(identifier);
    const entry = user ? this.store.passwordResets.find((r) => r.userId === user.id) : undefined;
    if (!user || !entry) return "INVALID";
    if (passwordProblem(newPassword, { name: user.name, phone: user.phone, email: user.email })) return "WEAK_PASSWORD";
    const r = this.check(entry.code, `reset:${user.id}`, code);
    this.store.persist();
    if (r !== "OK") return r;
    user.passwordHash = this.store.hashPassword(newPassword as string);
    if (entry.channel === "email") user.emailVerified = true;
    if (entry.channel === "sms") user.phoneVerified = true;
    this.store.passwordResets = this.store.passwordResets.filter((x) => x !== entry);
    this.auth.revokeAllForUser(user.id, "PASSWORD_RESET");
    void this.passwordChanged(user, device);
    return "OK";
  }

  /* ---------------- account notifications ---------------- */

  /** Old accounts stored national digits; SMS needs international format. */
  private smsNumber(phone: string) {
    const p = checkPhone(phone);
    return p.ok ? p.e164 : phone;
  }

  async welcome(user: User) {
    if (user.email) await this.notify.sendEmail(user.email, T.welcomeEmail(user.name, this.notify.appUrl));
    if (user.phoneVerified && this.notify.smsAvailable) await this.notify.sendSms(this.smsNumber(user.phone), T.sms.welcome(user.name));
  }

  async passwordChanged(user: User, device: string) {
    if (user.email) await this.notify.sendEmail(user.email, T.passwordChangedEmail(user.name, new Date(), device));
    if (user.phoneVerified && this.notify.smsAvailable) await this.notify.sendSms(this.smsNumber(user.phone), T.sms.passwordChanged());
  }

  /** Like Gmail/Telegram: tell the user when their account is used on a device it has not seen before. */
  async newSignIn(user: User, device: string, isFirstOfItsKind: boolean) {
    if (isFirstOfItsKind && user.email) await this.notify.sendEmail(user.email, T.newSignInEmail(user.name, new Date(), device));
  }
}
