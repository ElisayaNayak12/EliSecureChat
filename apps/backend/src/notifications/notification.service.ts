import { Injectable, Logger } from "@nestjs/common";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { lookup } from "dns/promises";
import { createTransport, type Transporter } from "nodemailer";
import { LOGO_CID, type Email } from "./templates";

/** Brand logo attached to emails (apps/backend/assets, found from src/ and dist/ alike). */
const EMAIL_LOGO = resolve(__dirname, "..", "..", "assets", "email-logo.png");

export type SentRecord = { channel: "email" | "sms"; to: string; subject?: string; text: string; html?: string; at: string };

/**
 * Sends emails and SMS.
 *
 * Email (free): any SMTP server. With Gmail, use an App Password:
 *   SMTP_HOST=smtp.gmail.com  SMTP_PORT=465  SMTP_USER=you@gmail.com  SMTP_PASS=<16-letter app password>
 *   MAIL_FROM="EliSecureChat <you@gmail.com>"
 * SMS: OFF for now (email-only verification). Ready for later: set Twilio's TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
 * TWILIO_FROM (or TWILIO_MESSAGING_SERVICE_SID) and SMS turns on everywhere (sign-up code, reset by SMS, notices).
 *
 * Not configured, outside production: messages are written to <data>/outbox/*.html|txt and the server log, so the
 * whole flow can be tested locally. Not configured, in production: that channel is reported as unavailable.
 */
@Injectable()
export class NotificationService {
  private readonly log = new Logger("Notify");
  private mailer: Transporter | null = null;
  /** Last messages (for tests and the dev outbox). Never contains anything in production logs. */
  readonly sent: SentRecord[] = [];
  outboxDir = resolve(process.env.OUTBOX_DIR ?? join(process.cwd(), process.cwd().endsWith("backend") ? "data/outbox" : "apps/backend/data/outbox"));

  private get production() {
    return process.env.NODE_ENV === "production";
  }

  get smtpConfigured() {
    return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  }

  get twilioConfigured() {
    return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && (process.env.TWILIO_FROM || process.env.TWILIO_MESSAGING_SERVICE_SID));
  }

  /** Email can reach users (real SMTP, or the dev outbox outside production). */
  get emailAvailable() {
    return this.smtpConfigured || !this.production;
  }

  /**
   * SMS can reach users: only when an SMS provider is configured. (SMS_DEV_OUTBOX=on simulates it locally,
   * for testing the SMS screens before a provider is chosen.)
   */
  get smsAvailable() {
    return this.twilioConfigured || (!this.production && process.env.SMS_DEV_OUTBOX === "on");
  }

  get appUrl() {
    return (process.env.APP_URL ?? (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173").split(",")[0]).trim();
  }

  private remember(r: SentRecord) {
    this.sent.push(r);
    if (this.sent.length > 50) this.sent.shift();
  }

  /**
   * Nodemailer resolves the SMTP host with its own DNS client, which times out on some networks (VPNs, office or
   * home routers) even though normal lookups work. Resolve with the system resolver instead and connect to that
   * address, keeping the real host name for the TLS certificate check.
   */
  private async createMailer(): Promise<Transporter> {
    const host = (process.env.SMTP_HOST ?? "smtp.gmail.com").trim();
    const port = Number(process.env.SMTP_PORT ?? 465);
    let address = host;
    try {
      address = (await lookup(host, { family: 4 })).address;
    } catch (err) {
      this.log.warn(`Could not look up ${host} (${(err as Error).message}); trying the name directly.`);
    }
    return createTransport({
      host: address,
      port,
      secure: port === 465,
      tls: { servername: host },
      connectionTimeout: 20000,
      auth: { user: process.env.SMTP_USER?.trim(), pass: process.env.SMTP_PASS?.replace(/\s+/g, "") },
    });
  }

  async sendEmail(to: string, email: Email): Promise<boolean> {
    const record: SentRecord = { channel: "email", to, subject: email.subject, text: email.text, html: email.html, at: new Date().toISOString() };
    if (this.smtpConfigured) {
      try {
        this.mailer ??= await this.createMailer();
        await this.mailer.sendMail({
          from: process.env.MAIL_FROM ?? `EliSecureChat <${process.env.SMTP_USER}>`,
          to,
          subject: email.subject,
          text: email.text,
          html: email.html,
          // The logo travels inside the email (shown even where outside images are blocked).
          attachments: email.html.includes(`cid:${LOGO_CID}`) && existsSync(EMAIL_LOGO) ? [{ filename: "elisecurechat.png", path: EMAIL_LOGO, cid: LOGO_CID }] : [],
        });
        if (!this.production) this.remember(record);
        return true;
      } catch (err) {
        this.log.error(`Email to ${to.replace(/(.{2}).*@/, "$1***@")} failed: ${(err as Error).message}`);
        this.mailer = null; // reconnect (and look the server up again) on the next email
        return false;
      }
    }
    if (this.production) return false;
    this.remember(record);
    this.writeOutbox("email", to, email.subject, email.html, email.text);
    return true;
  }

  async sendSms(toE164: string, text: string): Promise<boolean> {
    const record: SentRecord = { channel: "sms", to: toE164, text, at: new Date().toISOString() };
    if (this.twilioConfigured) {
      const sid = process.env.TWILIO_ACCOUNT_SID!;
      const body = new URLSearchParams({ To: toE164, Body: text });
      if (process.env.TWILIO_MESSAGING_SERVICE_SID) body.set("MessagingServiceSid", process.env.TWILIO_MESSAGING_SERVICE_SID);
      else body.set("From", process.env.TWILIO_FROM!);
      try {
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: "POST",
          headers: { Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
          body,
        });
        if (!res.ok) throw new Error(`Twilio HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
        if (!this.production) this.remember(record);
        return true;
      } catch (err) {
        this.log.error(`SMS to ${toE164.slice(0, 4)}***${toE164.slice(-2)} failed: ${(err as Error).message}`);
        return false;
      }
    }
    if (!this.smsAvailable) return false;
    this.remember(record);
    this.writeOutbox("sms", toE164, "SMS", null, text);
    return true;
  }

  private writeOutbox(kind: "email" | "sms", to: string, subject: string, html: string | null, text: string) {
    try {
      mkdirSync(this.outboxDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const base = join(this.outboxDir, `${stamp}-${kind}-${to.replace(/[^a-z0-9+@.]/gi, "_")}`);
      // Local preview: point the attached-logo reference at the file on disk.
      if (html) writeFileSync(`${base}.html`, html.replaceAll(`cid:${LOGO_CID}`, `file:///${EMAIL_LOGO.replace(/\\/g, "/")}`), "utf8");
      writeFileSync(`${base}.txt`, `To: ${to}\nSubject: ${subject}\n\n${text}\n`, "utf8");
      this.log.warn(`[DEV OUTBOX] ${kind.toUpperCase()} to ${to}: "${subject}" -> ${base}.${html ? "html" : "txt"}`);
      // Codes are also printed so developers can test without opening the file.
      const code = text.match(/\b\d{6}\b/);
      if (code) this.log.warn(`[DEV OUTBOX] code: ${code[0]}`);
    } catch (err) {
      this.log.warn(`[DEV OUTBOX] could not write: ${(err as Error).message}`);
    }
  }
}
