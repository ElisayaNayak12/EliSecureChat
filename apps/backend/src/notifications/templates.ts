/**
 * Transactional email templates (approved brand design). Table-based layout with inline styles, so they render the
 * same in Gmail, Outlook, Apple Mail and phone mail apps. The logo is attached to each email (cid:esc-logo), so it
 * shows even where outside images are blocked. Every email also has a plain-text version.
 */
export type Email = { subject: string; html: string; text: string };

const BRAND = "EliSecureChat";
export const LOGO_CID = "esc-logo";
const C = {
  page: "#E8EDE3", card: "#FFFFFF", ink: "#16241A", body: "#33443A", muted: "#6B796D", line: "#DDE5D6", soft: "#F3F6EF",
  cta: "#2F4A34", accent: "#A8C596", codeBg: "#EEF4E8", codeLine: "#C9DBBB", amberBg: "#FFF4DE", amberInk: "#7A5A12",
  alert: "#8A2E2E", alertBg: "#FDECEC", alertLine: "#F3C2C2",
};
const SANS = "'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** "13 Nov 2026, 2:14 pm IST" in the server's time zone (EMAIL_TIMEZONE, default India). */
export function formatWhen(d: Date): string {
  const timeZone = process.env.EMAIL_TIMEZONE || "Asia/Kolkata";
  try {
    return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone, timeZoneName: "short" }).format(d);
  } catch {
    return d.toUTCString();
  }
}

function layout(opts: { preheader: string; title: string; body: string; alert?: boolean; footerNote?: string }) {
  const year = new Date().getFullYear();
  const band = opts.alert ? C.alert : "#1F3326";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>${esc(opts.title)}</title></head>
<body style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};">
<tr><td align="center" style="padding:28px 14px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${C.card};border-radius:20px;border:1px solid ${C.line};overflow:hidden;">
    <tr><td style="background:${band};padding:20px 26px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:middle;"><img src="cid:${LOGO_CID}" width="40" height="40" alt="" style="display:block;border:0;"></td>
        <td style="vertical-align:middle;padding-left:10px;font:700 21px/26px ${SERIF};color:#EEF3EA;">Eli<span style="color:${C.accent};">Secure</span>Chat</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:26px 26px 22px;font:400 15px/23px ${SANS};color:${C.body};">
      <h1 style="margin:0 0 10px;font:700 23px/29px ${SERIF};color:${C.ink};">${esc(opts.title)}</h1>
      ${opts.body}
    </td></tr>
    <tr><td style="background:${C.soft};padding:14px 26px;font:400 12px/18px ${SANS};color:${C.muted};">
      ${opts.footerNote ? `${opts.footerNote}<br><br>` : ""}&#128274; Your messages are end-to-end encrypted. We will never ask for your code or password by call, SMS or email.<br>
      This is an automated message; replies are not monitored. &copy; ${year} ${BRAND}
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

const p = (t: string) => `<p style="margin:0 0 12px;">${t}</p>`;
const small = (t: string) => `<p style="margin:12px 0 0;font-size:13px;line-height:19px;color:${C.muted};">${t}</p>`;

function codeBox(code: string, minutes: number) {
  const cells = code
    .split("")
    .map((d) => `<td style="padding:0 3px;"><div style="width:42px;height:52px;border-radius:12px;background:${C.codeBg};border:1.5px solid ${C.codeLine};font:800 26px/52px ${SANS};color:#1A2B1F;text-align:center;">${esc(d)}</div></td>`)
    .join("");
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:14px auto 10px;"><tr>${cells}</tr></table>
  <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 6px;"><tr>
    <td style="background:${C.amberBg};color:${C.amberInk};border-radius:999px;padding:4px 12px;font:600 12.5px/17px ${SANS};">&#9201; Expires in ${minutes} minutes</td>
  </tr></table>`;
}

function button(label: string, href: string, color: string = C.cta) {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0 4px;"><tr>
    <td style="background:${color};border-radius:12px;"><a href="${esc(href)}" style="display:inline-block;padding:12px 22px;font:700 15px/19px ${SANS};color:#F2F7EA;text-decoration:none;">${esc(label)}</a></td>
  </tr></table>`;
}

function tip(html: string, warn = false) {
  const [bg, line] = warn ? [C.alertBg, C.alertLine] : [C.soft, C.line];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 0;"><tr>
    <td style="background:${bg};border:1px solid ${line};border-radius:12px;padding:12px 14px;font:400 13.5px/20px ${SANS};color:#45564A;">${html}</td>
  </tr></table>`;
}

function facts(rows: [string, string][]) {
  const r = rows
    .map(([a, b]) => `<tr><td style="padding:5px 0;width:84px;color:${C.muted};font-size:13.5px;vertical-align:top;">${esc(a)}</td><td style="padding:5px 0;font-size:13.5px;font-weight:600;color:${C.ink};">${esc(b)}</td></tr>`)
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 4px;">${r}</table>`;
}

export function verificationEmail(name: string, code: string, minutes: number): Email {
  return {
    subject: `${code} is your ${BRAND} verification code`,
    html: layout({
      preheader: `Your verification code is ${code}. It expires in ${minutes} minutes.`,
      title: "Verify your email",
      body: `${p(`Hi ${esc(firstName(name))}, enter this code in ${BRAND} to confirm your email and finish creating your account.`)}${codeBox(code, minutes)}${tip(`Never share this code, not even with someone who says they are from ${BRAND}.`)}${small("Didn’t try to sign up? Ignore this email and no account will be created.")}`,
    }),
    text: `Hi ${firstName(name)},\n\nYour ${BRAND} verification code is: ${code}\nIt expires in ${minutes} minutes.\n\nNever share this code, not even with someone who says they are from ${BRAND}.\n\nDidn't try to sign up? Ignore this email and no account will be created.`,
  };
}

export function welcomeEmail(name: string, appUrl: string): Email {
  const item = (icon: string, title: string, desc: string) =>
    `<tr><td style="width:34px;vertical-align:top;padding:7px 0;font-size:19px;">${icon}</td><td style="padding:7px 0;font-size:14px;line-height:20px;"><strong style="color:${C.ink};">${title}</strong><br><span style="color:${C.muted};">${desc}</span></td></tr>`;
  const first = firstName(name);
  return {
    subject: `Welcome to ${BRAND}, ${first}! 🎉`,
    html: layout({
      preheader: "Your account is ready. Here’s what you can do.",
      title: `Welcome, ${first}! 🎉`,
      body: `${p("Your account is ready. Here’s what you can do:")}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 4px;">
          ${item("&#128274;", "Private by design", "Only you and the people you talk to can read your chats.")}
          ${item("&#129311;", "Sign and captions in calls", "Speech becomes signs and captions; signs become text and speech.")}
          ${item("&#127807;", "Leafy stickers and moods", "25 stickers, mood emoji and GIFs.")}
          ${item("&#127912;", "Make it yours", "5 designs and 10 wallpapers.")}
        </table>
        ${button(`Open ${BRAND}`, appUrl)}
        ${small("Tip: check the security code with your contacts in chat info, so you know nobody is listening in.")}`,
    }),
    text: `Welcome to ${BRAND}, ${first}!\n\nYour account is ready.\n- Private by design: only you and the people you talk to can read your chats\n- Sign and captions in calls\n- Leafy stickers, mood emoji and GIFs\n- 5 designs and 10 wallpapers\n\nOpen ${BRAND}: ${appUrl}`,
  };
}

export function resetCodeEmail(name: string, code: string, minutes: number): Email {
  return {
    subject: `${code} is your ${BRAND} password reset code`,
    html: layout({
      preheader: `Use ${code} to set a new password. It expires in ${minutes} minutes.`,
      title: "Reset your password",
      body: `${p(`Hi ${esc(firstName(name))}, we got a request to reset your password. Enter this code in the app:`)}${codeBox(code, minutes)}${tip("After the reset you will be signed out on all your devices, for your safety.")}${small("Didn’t ask for this? Ignore this email. Your password stays the same.")}`,
    }),
    text: `Hi ${firstName(name)},\n\nYour ${BRAND} password reset code is: ${code}\nIt expires in ${minutes} minutes.\n\nAfter the reset you will be signed out on all your devices.\n\nDidn't ask for this? Ignore this email. Your password stays the same.`,
  };
}

export function passwordChangedEmail(name: string, when: Date, device: string, appUrl?: string): Email {
  const at = formatWhen(when);
  const secure = appUrl ? `${appUrl.replace(/\/$/, "")}/#forgot` : null;
  return {
    subject: `Your ${BRAND} password was changed`,
    html: layout({
      alert: true,
      preheader: "Your password was just changed. If this wasn’t you, act now.",
      title: "Your password was changed",
      body: `${p(`Hi ${esc(firstName(name))}, your password was just changed and your other devices were signed out.`)}${facts([["When", at], ["Device", device]])}
        ${tip(`<strong style="color:${C.alert};">Wasn’t you?</strong> Reset your password now with “Forgot password” and check your devices in Settings › Security.`, true)}
        ${secure ? button("Secure my account", secure, C.alert) : ""}`,
    }),
    text: `Hi ${firstName(name)},\n\nYour ${BRAND} password was changed and your other devices were signed out.\nWhen: ${at}\nDevice: ${device}\n\nWasn't you? Reset your password now with "Forgot password"${secure ? ` (${secure})` : ""} and check your devices in Settings > Security.`,
  };
}

export function newSignInEmail(name: string, when: Date, device: string, appUrl?: string): Email {
  const at = formatWhen(when);
  const secure = appUrl ? `${appUrl.replace(/\/$/, "")}/#forgot` : null;
  return {
    subject: `New sign-in to your ${BRAND} account`,
    html: layout({
      preheader: `${device} signed in just now.`,
      title: "New sign-in",
      body: `${p(`Hi ${esc(firstName(name))}, your account was just used to sign in on a new device.`)}${facts([["When", at], ["Device", device]])}
        ${small("If this was you, there’s nothing to do.")}
        ${secure ? button("Not me: secure my account", secure, C.alert) : small("If not, change your password now and sign that device out in Settings › Security.")}`,
    }),
    text: `Hi ${firstName(name)},\n\nNew sign-in to your ${BRAND} account.\nWhen: ${at}\nDevice: ${device}\n\nIf this was you, there's nothing to do. If not, change your password now${secure ? ` (${secure})` : ""} and sign that device out in Settings > Security.`,
  };
}

/** SMS texts: short, no links in codes (carriers and DLT templates prefer this). */
export const sms = {
  verification: (code: string, minutes: number) => `${code} is your ${BRAND} verification code. Valid ${minutes} min. Do not share it with anyone.`,
  reset: (code: string, minutes: number) => `${code} is your ${BRAND} password reset code. Valid ${minutes} min. Do not share it with anyone.`,
  welcome: (name: string) => `Welcome to ${BRAND}, ${firstName(name)}! Your account is ready.`,
  passwordChanged: () => `Your ${BRAND} password was changed. Not you? Reset it now from the sign-in screen.`,
};
