/**
 * Transactional email templates (Verdant brand). Table-based layout with inline styles, so they render the same
 * in Gmail, Outlook, Apple Mail and phone mail apps. Every email also has a plain-text version.
 */
export type Email = { subject: string; html: string; text: string };

const BRAND = "EliSecureChat";
const C = { canvas: "#ECEFE7", card: "#FFFFFF", brand: "#1A2B1F", cta: "#2F4A34", ink: "#16241A", muted: "#6B796D", line: "#E3E8DD", mint: "#E1EED6", tile: "#A8C596" };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(opts: { preheader: string; title: string; body: string; footerNote?: string }) {
  const year = new Date().getFullYear();
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><title>${esc(opts.title)}</title></head>
<body style="margin:0;padding:0;background:${C.canvas};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.canvas};">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
    <tr><td align="center" style="padding:0 0 20px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="width:40px;height:40px;background:${C.brand};border-radius:12px;text-align:center;vertical-align:middle;font:700 20px/40px Arial,sans-serif;color:${C.tile};">&#128274;</td>
        <td style="padding-left:10px;font:700 20px/24px 'Segoe UI',Arial,sans-serif;color:${C.ink};">${BRAND}</td>
      </tr></table>
    </td></tr>
    <tr><td style="background:${C.card};border-radius:20px;border:1px solid ${C.line};padding:36px 32px;font:400 16px/24px 'Segoe UI',Arial,sans-serif;color:${C.ink};">
      ${opts.body}
    </td></tr>
    <tr><td align="center" style="padding:20px 12px 0;font:400 12px/18px 'Segoe UI',Arial,sans-serif;color:${C.muted};">
      ${opts.footerNote ? `${opts.footerNote}<br><br>` : ""}
      &#128274; Your messages on ${BRAND} are end-to-end encrypted.<br>
      This is an automated message; replies are not monitored.<br>&copy; ${year} ${BRAND}
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

const h1 = (t: string) => `<h1 style="margin:0 0 12px;font:700 24px/30px 'Segoe UI',Arial,sans-serif;color:${C.ink};">${t}</h1>`;
const p = (t: string) => `<p style="margin:0 0 16px;">${t}</p>`;
const codeBox = (code: string) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;"><tr>
    <td align="center" style="background:${C.mint};border-radius:14px;padding:18px 8px;font:700 34px/40px 'Consolas','Courier New',monospace;letter-spacing:10px;color:${C.brand};">${esc(code)}</td>
  </tr></table>`;
const button = (label: string, href: string) => `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;"><tr>
    <td style="background:${C.cta};border-radius:12px;"><a href="${esc(href)}" style="display:inline-block;padding:13px 26px;font:600 16px/20px 'Segoe UI',Arial,sans-serif;color:#F2F7EA;text-decoration:none;">${esc(label)}</a></td>
  </tr></table>`;
const muted = (t: string) => `<p style="margin:0;font-size:14px;line-height:21px;color:${C.muted};">${t}</p>`;
const fact = (label: string, value: string) =>
  `<tr><td style="padding:6px 0;color:${C.muted};font-size:14px;width:110px;vertical-align:top;">${esc(label)}</td><td style="padding:6px 0;font-size:14px;">${esc(value)}</td></tr>`;

export function verificationEmail(name: string, code: string, minutes: number): Email {
  return {
    subject: `${code} is your ${BRAND} verification code`,
    html: layout({
      preheader: `Your verification code is ${code}. It expires in ${minutes} minutes.`,
      title: "Verify your email",
      body: `${h1("Verify your email")}${p(`Hi ${esc(name)}, enter this code in ${BRAND} to confirm your email address and finish creating your account:`)}${codeBox(code)}${muted(`The code expires in ${minutes} minutes. Never share it with anyone, not even someone claiming to be from ${BRAND}.`)}`,
      footerNote: "If you did not try to create an account, you can ignore this email; no account will be created.",
    }),
    text: `Hi ${name},\n\nYour ${BRAND} verification code is: ${code}\n\nIt expires in ${minutes} minutes. Never share it with anyone.\n\nIf you did not try to create an account, ignore this email.`,
  };
}

export function welcomeEmail(name: string, appUrl: string): Email {
  const item = (icon: string, title: string, desc: string) =>
    `<tr><td style="width:36px;vertical-align:top;padding:8px 0;font-size:20px;">${icon}</td><td style="padding:8px 0;"><strong>${title}</strong><br><span style="color:${C.muted};font-size:14px;line-height:20px;">${desc}</span></td></tr>`;
  return {
    subject: `Welcome to ${BRAND}, ${name.split(" ")[0]}!`,
    html: layout({
      preheader: "Your account is ready. Private, end-to-end encrypted messaging awaits.",
      title: `Welcome to ${BRAND}`,
      body: `${h1(`Welcome, ${esc(name.split(" ")[0])}! &#127881;`)}${p("Your account is ready. Here is what you can do:")}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
          ${item("&#128274;", "Private by design", "Messages are encrypted on your device. Not even our server can read them.")}
          ${item("&#128249;", "Video and voice calls", "Talk face to face, with live captions when you need them.")}
          ${item("&#129311;", "Sign language assistance", "Built for Deaf and hearing people to talk together.")}
          ${item("&#127908;", "Voice messages", "Record and send in one tap.")}
        </table>
        ${button(`Open ${BRAND}`, appUrl)}
        ${muted("Tip: compare the security code with your contacts (chat info, then Verify security code) to be sure nobody is listening in.")}`,
    }),
    text: `Welcome to ${BRAND}, ${name}!\n\nYour account is ready.\n- Private by design: end-to-end encrypted messages\n- Video and voice calls with live captions\n- Sign language assistance\n- Voice messages\n\nOpen ${BRAND}: ${appUrl}`,
  };
}

export function resetCodeEmail(name: string, code: string, minutes: number): Email {
  return {
    subject: `${code} is your ${BRAND} password reset code`,
    html: layout({
      preheader: `Use ${code} to reset your password. It expires in ${minutes} minutes.`,
      title: "Reset your password",
      body: `${h1("Reset your password")}${p(`Hi ${esc(name)}, we received a request to reset your ${BRAND} password. Enter this code in the app:`)}${codeBox(code)}${muted(`The code expires in ${minutes} minutes. After the reset, you will be signed out on all your devices.`)}`,
      footerNote: "Did not ask for this? Ignore this email; your password stays the same. Someone may have typed your email or phone number by mistake.",
    }),
    text: `Hi ${name},\n\nYour ${BRAND} password reset code is: ${code}\n\nIt expires in ${minutes} minutes. After the reset you will be signed out on all devices.\n\nDid not ask for this? Ignore this email; your password stays the same.`,
  };
}

export function passwordChangedEmail(name: string, when: Date, device: string): Email {
  const at = when.toUTCString();
  return {
    subject: `Your ${BRAND} password was changed`,
    html: layout({
      preheader: "Your password was just changed. If this was not you, act now.",
      title: "Password changed",
      body: `${h1("Your password was changed")}${p(`Hi ${esc(name)}, the password for your ${BRAND} account was just changed and other devices were signed out.`)}
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">${fact("When", at)}${fact("Device", device)}</table>
        ${muted(`<strong style="color:${C.ink};">Was this not you?</strong> Reset your password immediately with "Forgot password" on the sign-in screen, and check your signed-in devices in Settings, then Security.`)}`,
    }),
    text: `Hi ${name},\n\nYour ${BRAND} password was changed.\nWhen: ${at}\nDevice: ${device}\n\nNot you? Use "Forgot password" on the sign-in screen immediately and review your devices in Settings > Security.`,
  };
}

export function newSignInEmail(name: string, when: Date, device: string): Email {
  const at = when.toUTCString();
  return {
    subject: `New sign-in to your ${BRAND} account`,
    html: layout({
      preheader: `New sign-in from ${device}.`,
      title: "New sign-in",
      body: `${h1("New sign-in detected")}${p(`Hi ${esc(name)}, your account was just used to sign in on a new device:`)}
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">${fact("When", at)}${fact("Device", device)}</table>
        ${muted(`If this was you, there is nothing to do. If not, change your password now and sign that device out in Settings, then Security.`)}`,
    }),
    text: `Hi ${name},\n\nNew sign-in to your ${BRAND} account.\nWhen: ${at}\nDevice: ${device}\n\nNot you? Change your password and sign that device out in Settings > Security.`,
  };
}

/** SMS texts: short, no links in codes (carriers and DLT templates prefer this). */
export const sms = {
  verification: (code: string, minutes: number) => `${code} is your ${BRAND} verification code. Valid ${minutes} min. Do not share it with anyone.`,
  reset: (code: string, minutes: number) => `${code} is your ${BRAND} password reset code. Valid ${minutes} min. Do not share it with anyone.`,
  welcome: (name: string) => `Welcome to ${BRAND}, ${name.split(" ")[0]}! Your account is ready.`,
  passwordChanged: () => `Your ${BRAND} password was changed. Not you? Reset it now from the sign-in screen.`,
};
