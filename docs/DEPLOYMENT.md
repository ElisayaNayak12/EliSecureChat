# Hosting EliSecureChat for free

One server runs everything on **one domain**:

| URL | What |
|---|---|
| `https://your-domain/` | Web app (React) |
| `https://your-domain/admin/` | Admin console |
| `https://your-domain/api/...` and `/socket.io` | Backend API and live chat |

Android users install the Flutter app (APK built by GitHub Actions) and point it at the same address.

Keeping everything on one domain is required, not just convenient: the web app's login cookie is
`SameSite=Strict`, so the web app and API must be on the same site. HTTPS is also required: camera,
microphone and the encryption code only work over HTTPS.

---

## Fastest: one command (₹0, Oracle Always Free + DuckDNS + automatic HTTPS)

1. **Oracle account:** sign up at cloud.oracle.com. A card is needed for verification only; Always Free is never
   charged. Never click "Upgrade to Pay As You Go".
2. **Server:** Compute → Instances → Create.
   - Image **Ubuntu 24.04**.
   - Shape **Ampere A1** (e.g. 2 CPU / 12 GB), or **VM.Standard.E2.1.Micro** if A1 is "out of capacity".
   - Upload or download the SSH key.
3. **Open the doors:** Networking → Virtual cloud networks → your VCN → Security Lists → Default → **Add
   Ingress Rules**: Source `0.0.0.0/0`, TCP, destination ports **80** and **443**.
4. **Free address:** duckdns.org → sign in → create `yourname` → put the server's public IP in it → copy your token.
5. **Run the setup** (from your PC: `ssh ubuntu@<server-ip>`, then paste):
   ```bash
   curl -fsSL https://raw.githubusercontent.com/<you>/EliSecureChat/main/scripts/deploy/oracle-setup.sh -o setup.sh
   sudo DOMAIN=yourname.duckdns.org DUCKDNS_TOKEN=<your-token> \
        SMTP_USER=you@gmail.com SMTP_PASS="<gmail app password>" \
        REPO_URL=https://github.com/<you>/EliSecureChat.git bash setup.sh
   ```
   `SMTP_USER`/`SMTP_PASS` send the sign-up codes, welcome emails and password-reset emails. See
   **Email and SMS** below for getting a free Gmail App Password. Without them, sign-up stays unavailable.
   It sets up everything below automatically: swap memory, Node.js, the build, fresh secrets, the background
   service, the firewall, HTTPS and daily backups. It prints the admin password at the end. Run the same
   command again to update.
   For a **private** repository, use `REPO_URL=https://<github-token>@github.com/<you>/EliSecureChat.git` and download
   the script from GitHub's web page instead of `raw.githubusercontent.com`.
6. Open `https://yourname.duckdns.org`. The first visit can take a minute while the HTTPS certificate is issued.

The rest of this page is the same setup done by hand, for reference.

---

## Email and SMS (account verification, welcome and password-reset messages)

How it works, like WhatsApp and Telegram:
1. **Sign-up:**
   - The person enters a name, mobile number, email and password. Each is checked:
     - **Mobile number:** checked against the real numbering plan of its country; mobile numbers only.
     - **Email:** checked for typos, throwaway domains and whether the domain can receive mail.
     - **Password:** 8+ characters, letters and numbers, not their name, phone or email.
   - A 6-digit code goes to the **email** (SMS is off for now; see below).
   - The account is created only after the code(s) are entered. Then a **welcome email** (and SMS) is sent.
2. **Sign in:** with the phone number (any format) or the email. A sign-in from a new device sends a
   **security email**.
3. **Forgot password:**
   - Choose **Email** or **SMS**, enter the code and a new password.
   - Every device is signed out, and a **"password changed" email** (and SMS) is sent.
4. **Code rules:** valid 10 minutes, 5 tries, 60 seconds between resends, and at most 6 codes per address/number
   per hour (stops spam and SMS-cost abuse).

### Email: free with Gmail
1. Use a Gmail account for the app (a new one like `elisecurechat.app@gmail.com` is best).
2. Turn on **2-Step Verification**: myaccount.google.com → Security.
3. Open **myaccount.google.com/apppasswords** and create an app password named "EliSecureChat". Copy the 16 letters.
4. Put these in the server's `elisecurechat.env` (the setup script does it when you pass `SMTP_USER`/`SMTP_PASS`):
   ```ini
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_USER=elisecurechat.app@gmail.com
   SMTP_PASS=abcdefghijklmnop
   MAIL_FROM=EliSecureChat <elisecurechat.app@gmail.com>
   ```
5. Restart: `sudo systemctl restart elisecurechat`.

Gmail allows about **500 emails a day** for free. For more, any SMTP service works with the same five settings,
for example Brevo (free 300/day) or Amazon SES.

### SMS: switched off (email-only verification for now)
SMS is not free from any provider, so the app currently verifies accounts and resets passwords **by email
only**. The SMS code is kept dormant: setting a provider's keys turns SMS on everywhere (sign-up code, "reset by
SMS" option, notices) without code changes. Notes for when you add it:
- Built in: **Twilio** (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`). A trial account gives free credit
  but only sends to numbers you verify in Twilio, which is fine for testing.
- **India:** commercial SMS needs **TRAI DLT registration**: your business (entity) and each message template
  ("{#var#} is your EliSecureChat verification code...") are registered through a DLT portal before Indian
  carriers deliver them. This takes a few days and has small fees. Providers such as MSG91 and Fast2SMS handle
  it; they can be added on request.
- Until then: sign-up verifies the **email only** (the phone number is still checked as a real mobile number), and
  password reset works by email. No SMS option is shown anywhere.

### Testing locally
Without these settings, the local dev server writes every email and SMS to `apps/backend/data/outbox/`. Open
the `.html` files to see the emails as users will. The codes also appear in the "EliSecureChat Dev Servers"
window.

---

## Recommended: Oracle Cloud "Always Free" server + free HTTPS

**Cost: free.** Oracle asks for a card to verify your identity but does not charge for Always Free resources.
You get a real Linux server with a permanent disk, so users, chats and uploads are kept.

### 1. Create the server
1. Sign up at **cloud.oracle.com** and choose your home region (it cannot be changed later).
2. Go to **Compute → Instances → Create instance**:
   - Image: **Ubuntu 24.04**.
   - Shape: **Ampere A1** (Always Free: up to 4 CPUs / 24 GB RAM). 1 CPU / 6 GB is plenty to start.
     If A1 capacity is unavailable in your region, use **VM.Standard.E2.1.Micro** (also free, slower).
   - Add your SSH public key and create the instance.
3. Open ports 80 and 443:
   - **Networking → Virtual cloud network → Security list → Add ingress rules**: TCP 80 and 443 from `0.0.0.0/0`.
   - Then on the server: `sudo iptables -I INPUT 6 -p tcp -m multiport --dports 80,443 -j ACCEPT && sudo netfilter-persistent save`

### 2. Get a free address
- **DuckDNS** (free forever): sign in at duckdns.org, create `yourname.duckdns.org`, and set it to your
  server's public IP.
- Or a real domain (about $10/year) from Cloudflare, Namecheap or similar, with an A record pointing to the server.

### 3. Install and build the app (on the server)
```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs git
sudo useradd -m -s /bin/bash elichat && sudo -iu elichat
git clone https://github.com/<your-account>/EliSecureChat.git app && cd app
npm ci
npm run build:hosted        # builds web (/), admin (/admin/) and the backend
```

### 4. Configure the app (secrets live only on the server)
Create `/home/elichat/app/.env`. The values in angle brackets are yours; generate secrets with `openssl rand -hex 32`.
```ini
NODE_ENV=production
PORT=3000
JWT_SECRET=<64 random hex characters>
ADMIN_PASSWORD=<a strong password, 12+ characters>
ALLOWED_ORIGINS=https://yourname.duckdns.org
TRUST_PROXY=1
WEB_DIST_DIR=/home/elichat/app/apps/web/dist
ADMIN_DIST_DIR=/home/elichat/app/apps/admin/dist
STORE_FILE=/home/elichat/data/store.json
UPLOADS_DIR=/home/elichat/data/uploads
```
Then run `mkdir -p /home/elichat/data/uploads`.

### 5. Keep it running (systemd)
`sudo nano /etc/systemd/system/elisecurechat.service`:
```ini
[Unit]
Description=EliSecureChat
After=network-online.target

[Service]
User=elichat
WorkingDirectory=/home/elichat/app
EnvironmentFile=/home/elichat/app/.env
ExecStart=/usr/bin/node apps/backend/dist/main.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```
Then run:
```bash
sudo systemctl daemon-reload && sudo systemctl enable --now elisecurechat
curl -s localhost:3000/api/health      # {"ok":true,...}
```

### 6. HTTPS with Caddy (automatic, free certificates)
```bash
sudo apt-get install -y caddy
echo 'yourname.duckdns.org {
  encode gzip
  reverse_proxy localhost:3000
}' | sudo tee /etc/caddy/Caddyfile
sudo systemctl reload caddy
```
Open `https://yourname.duckdns.org`. Caddy gets the certificate and forwards live-chat WebSockets automatically.

### 7. Backups (do this)
All data is in `/home/elichat/data`: users, encrypted messages, uploads, sign dataset. Add a daily copy with
`crontab -e`:
```
0 3 * * * tar czf /home/elichat/backup-$(date +\%a).tgz -C /home/elichat data
```
This keeps 7 rotating daily backups. Also download one regularly, so a copy lives off the server.

### Updating
```bash
sudo -iu elichat && cd app && git pull && npm ci && npm run build:hosted && exit
sudo systemctl restart elisecurechat
```

---

## Android app (Flutter): free builds, free distribution

1. Push the repository to GitHub. The **Flutter Android** workflow
   (`.github/workflows/flutter-android.yml`) runs automatically. It analyses and tests the app, checks
   encryption compatibility with the web app, and builds the APKs.
2. Set the app's default server: **GitHub → Settings → Secrets and variables → Actions → Variables →
   New variable** `SERVER_URL` = `https://yourname.duckdns.org`. Then **Actions → Flutter Android → Run workflow**.
3. Download **elisecurechat-android** from the run's *Artifacts*:
   - `app-release.apk`: for users. It only connects to HTTPS servers.
   - `app-debug.apk`: for testing. It also allows plain `http://` servers such as `http://192.168.x.x:3000`.
4. Share the APK directly (free; users allow "install unknown apps" once), or publish on Google Play
   (one-time $25 developer fee). Play requires your own signing key instead of the debug key.

Users can always change the server on the app's sign-in screen (**Server**).

---

## Other options (and why they are not recommended)

| Option | Free? | Problem |
|---|---|---|
| Render / Koyeb free web service | Yes | **The disk is wiped on every restart or redeploy, so all users and chats are lost.** Render also sleeps after 15 minutes idle. Only for a quick demo |
| Cloudflare Pages (web) + a separate API host | Yes | Different sites, so the web login cookie is blocked and users are signed out every 15 minutes |
| Cloudflare Workers for the backend | Yes | Cannot run this Node/NestJS server or keep files; it would need a rewrite |
| Your own PC + Cloudflare Tunnel | Yes | Works, but only while the PC is on. A free `trycloudflare.com` URL changes on each start |
| Google Cloud e2-micro (free tier) | Yes | Works like Oracle but only 1 GB RAM; building there is slow |

## Before inviting the public (not free, or not done yet)
- **Password reset by SMS:** needs an SMS provider (MSG91 or Twilio, paid per message). Until then the reset code
  is printed in the server log, so only an admin can help users reset.
- **Call relay (TURN):** calls between some mobile and office networks fail without one. Options: coturn on the
  same server, or a hosted TURN service with a free allowance. The app does not have TURN settings yet.
- **More than one server / many users:** the JSON file store and in-memory rate limits are single-server. Move to
  PostgreSQL and Redis first.
- **Legal:** privacy policy and India DPDP Act compliance before public launch.
