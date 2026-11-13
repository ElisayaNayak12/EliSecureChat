#!/usr/bin/env bash
# =============================================================================
#  EliSecureChat: one-command server setup for a FREE Oracle Cloud server
#  (Ubuntu 22.04 / 24.04, Always Free "Ampere A1" or "E2.1.Micro").
#
#  Run on the server (as the default "ubuntu" user):
#    curl -fsSL https://raw.githubusercontent.com/<you>/EliSecureChat/main/scripts/deploy/oracle-setup.sh -o setup.sh
#    sudo DOMAIN=yourname.duckdns.org REPO_URL=https://github.com/<you>/EliSecureChat.git bash setup.sh
#
#  Optional: ADMIN_PASSWORD=... (otherwise one is generated and printed), DUCKDNS_TOKEN=... (keeps the
#  DuckDNS address pointed at this server), BRANCH=main.
#  Email (needed for sign-up codes, welcome and password-reset emails; free with Gmail):
#    SMTP_USER=you@gmail.com SMTP_PASS="<16-letter Gmail App Password>"   (SMTP_HOST defaults to smtp.gmail.com)
#  SMS (optional, paid): TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... TWILIO_FROM=+1...
#  For a PRIVATE repository use REPO_URL=https://<github-token>@github.com/<you>/EliSecureChat.git
#
#  Safe to run again: it updates the code, rebuilds and restarts, and keeps existing secrets and data.
# =============================================================================
set -euo pipefail

DOMAIN="${DOMAIN:-}"
REPO_URL="${REPO_URL:-}"
BRANCH="${BRANCH:-main}"
APP_USER="elichat"
APP_HOME="/home/${APP_USER}"
APP_DIR="${APP_HOME}/app"
DATA_DIR="${APP_HOME}/data"
ENV_FILE="${APP_HOME}/elisecurechat.env"

say()  { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[!] %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m[x] %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run with sudo:  sudo DOMAIN=... REPO_URL=... bash $0"
[ -n "$DOMAIN" ] || die "Set DOMAIN, e.g. DOMAIN=yourname.duckdns.org"
[ -n "$REPO_URL" ] || die "Set REPO_URL, e.g. REPO_URL=https://github.com/<you>/EliSecureChat.git"
grep -qi ubuntu /etc/os-release || warn "This script is tested for Ubuntu; continuing anyway."
export DEBIAN_FRONTEND=noninteractive

# ---------------------------------------------------------------- 1. memory
say "Checking memory"
MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$MEM_MB" -lt 3000 ] && ! swapon --show | grep -q .; then
  say "Only ${MEM_MB} MB RAM: adding a 2 GB swap file so the build does not run out of memory"
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# ---------------------------------------------------------------- 2. packages
say "Installing system packages"
apt-get update -y
echo iptables-persistent iptables-persistent/autosave_v4 boolean true | debconf-set-selections
echo iptables-persistent iptables-persistent/autosave_v6 boolean true | debconf-set-selections
apt-get install -y git curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https iptables-persistent openssl

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  say "Installing Node.js 24"
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi
node -v

if ! command -v caddy >/dev/null; then
  say "Installing Caddy (automatic HTTPS)"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi

# ---------------------------------------------------------------- 3. app user + code
say "Getting the code"
id "$APP_USER" >/dev/null 2>&1 || useradd -m -s /bin/bash "$APP_USER"
mkdir -p "$DATA_DIR/uploads"
chown -R "$APP_USER:$APP_USER" "$DATA_DIR"
if [ -d "$APP_DIR/.git" ]; then
  sudo -u "$APP_USER" git -C "$APP_DIR" fetch --depth 1 origin "$BRANCH"
  sudo -u "$APP_USER" git -C "$APP_DIR" reset --hard "origin/$BRANCH"
else
  sudo -u "$APP_USER" git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
# Never keep a token in the stored remote URL.
sudo -u "$APP_USER" git -C "$APP_DIR" remote set-url origin "$(printf '%s' "$REPO_URL" | sed -E 's#https://[^@/]+@#https://#')"

say "Installing dependencies and building (several minutes on a free server)"
cd "$APP_DIR"
# Only the parts the server needs (skips the unused React Native folder).
sudo -u "$APP_USER" env NODE_OPTIONS=--max-old-space-size=1536 \
  npm ci --no-audit --no-fund --include-workspace-root \
  -w @secure-chat/backend -w @secure-chat/web -w @secure-chat/admin -w @secure-chat/shared
sudo -u "$APP_USER" env NODE_OPTIONS=--max-old-space-size=1536 npm run build:hosted

# ---------------------------------------------------------------- 4. configuration (secrets stay on the server)
if [ ! -f "$ENV_FILE" ]; then
  say "Creating configuration with fresh secrets"
  GENERATED_ADMIN=""
  if [ -z "${ADMIN_PASSWORD:-}" ]; then
    ADMIN_PASSWORD="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-20)"
    GENERATED_ADMIN="$ADMIN_PASSWORD"
  fi
  [ "${#ADMIN_PASSWORD}" -ge 12 ] || die "ADMIN_PASSWORD must be at least 12 characters"
  umask 077
  cat > "$ENV_FILE" <<EOF
NODE_ENV=production
PORT=3000
JWT_SECRET=$(openssl rand -hex 32)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=${ADMIN_PASSWORD}
ALLOWED_ORIGINS=https://${DOMAIN}
TRUST_PROXY=1
WEB_DIST_DIR=${APP_DIR}/apps/web/dist
ADMIN_DIST_DIR=${APP_DIR}/apps/admin/dist
STORE_FILE=${DATA_DIR}/store.json
UPLOADS_DIR=${DATA_DIR}/uploads
DATASET_DIR=${DATA_DIR}/dataset
APP_URL=https://${DOMAIN}
DEFAULT_COUNTRY=${DEFAULT_COUNTRY:-IN}
EOF
  if [ -n "${SMTP_USER:-}" ] && [ -n "${SMTP_PASS:-}" ]; then
    cat >> "$ENV_FILE" <<EOF
SMTP_HOST=${SMTP_HOST:-smtp.gmail.com}
SMTP_PORT=${SMTP_PORT:-465}
SMTP_USER=${SMTP_USER}
SMTP_PASS=${SMTP_PASS}
MAIL_FROM=EliSecureChat <${SMTP_USER}>
EOF
  else
    warn "No SMTP_USER/SMTP_PASS given: sign-up and password reset stay unavailable until you add them to $ENV_FILE"
  fi
  if [ -n "${TWILIO_ACCOUNT_SID:-}" ] && [ -n "${TWILIO_AUTH_TOKEN:-}" ] && [ -n "${TWILIO_FROM:-}" ]; then
    printf 'TWILIO_ACCOUNT_SID=%s
TWILIO_AUTH_TOKEN=%s
TWILIO_FROM=%s
' "$TWILIO_ACCOUNT_SID" "$TWILIO_AUTH_TOKEN" "$TWILIO_FROM" >> "$ENV_FILE"
  fi
  chown "$APP_USER:$APP_USER" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
else
  say "Keeping the existing configuration ($ENV_FILE)"
  GENERATED_ADMIN=""
fi

# ---------------------------------------------------------------- 5. service
say "Installing the background service"
cat > /etc/systemd/system/elisecurechat.service <<EOF
[Unit]
Description=EliSecureChat
After=network-online.target
Wants=network-online.target

[Service]
User=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/node apps/backend/dist/main.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=full
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable elisecurechat >/dev/null
systemctl restart elisecurechat
for i in $(seq 1 30); do
  curl -fs http://127.0.0.1:3000/api/health >/dev/null && break
  sleep 2
  [ "$i" -eq 30 ] && { journalctl -u elisecurechat -n 40 --no-pager; die "The app did not start (log above)"; }
done
echo "App is running."

# ---------------------------------------------------------------- 6. firewall (the Oracle image blocks 80/443)
say "Opening ports 80 and 443 in the server firewall"
for p in 80 443; do
  iptables -C INPUT -p tcp --dport "$p" -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p tcp --dport "$p" -j ACCEPT
done
netfilter-persistent save >/dev/null 2>&1 || true

# ---------------------------------------------------------------- 7. HTTPS
say "Configuring HTTPS for ${DOMAIN}"
cat > /etc/caddy/Caddyfile <<EOF
${DOMAIN} {
  encode gzip
  reverse_proxy 127.0.0.1:3000
}
EOF
systemctl enable caddy >/dev/null
systemctl reload caddy 2>/dev/null || systemctl restart caddy

# ---------------------------------------------------------------- 8. DuckDNS + backups
if [ -n "${DUCKDNS_TOKEN:-}" ] && [[ "$DOMAIN" == *.duckdns.org ]]; then
  say "Keeping ${DOMAIN} pointed at this server (DuckDNS, every 10 minutes)"
  SUB="${DOMAIN%.duckdns.org}"
  printf '*/10 * * * * root curl -fs "https://www.duckdns.org/update?domains=%s&token=%s&ip=" >/dev/null\n' "$SUB" "$DUCKDNS_TOKEN" > /etc/cron.d/duckdns
  chmod 600 /etc/cron.d/duckdns
  curl -fs "https://www.duckdns.org/update?domains=${SUB}&token=${DUCKDNS_TOKEN}&ip=" >/dev/null || warn "DuckDNS update failed; check the token"
fi
say "Daily backups (7 kept) in ${APP_HOME}/backups"
mkdir -p "${APP_HOME}/backups" && chown "$APP_USER:$APP_USER" "${APP_HOME}/backups"
cat > /etc/cron.d/elisecurechat-backup <<EOF
0 3 * * * ${APP_USER} tar czf ${APP_HOME}/backups/data-\$(date +\%a).tgz -C ${APP_HOME} data
EOF

# ---------------------------------------------------------------- done
PUBLIC_IP="$(curl -fs --max-time 5 https://api.ipify.org || echo 'unknown')"
say "Done!"
cat <<EOF

  Chat app:       https://${DOMAIN}
  Admin console:  https://${DOMAIN}/admin/   (user: admin)
EOF
[ -n "$GENERATED_ADMIN" ] && printf '  Admin password: %s   <- save it now; it is stored only in %s\n' "$GENERATED_ADMIN" "$ENV_FILE"
cat <<EOF

  This server's public IP: ${PUBLIC_IP}   (your DuckDNS address must point here)

  If the site does not open:
   1. Oracle console -> Networking -> your VCN -> Security List: add Ingress rules for TCP 80 and 443
      from 0.0.0.0/0 (this cannot be done from inside the server).
   2. Wait a minute for the HTTPS certificate:  sudo journalctl -u caddy -n 30
   3. App log:  sudo journalctl -u elisecurechat -n 50

  Update later:  run this same command again.
EOF
