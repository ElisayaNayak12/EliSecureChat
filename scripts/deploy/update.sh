#!/usr/bin/env bash
# =============================================================================
#  EliSecureChat: fast update of a server prepared by oracle-setup.sh.
#  Used by the CI/CD pipeline (GitHub Actions) over SSH, and safe to run by hand:
#    sudo BRANCH=main bash update.sh            # newest commit of the branch
#    sudo BRANCH=main COMMIT=<sha> bash update.sh
#  If the new version does not build or does not start, it goes back to the previous version.
#  Data, uploads and secrets (outside the code folder) are never touched.
# =============================================================================
set -euo pipefail

BRANCH="${BRANCH:-main}"
COMMIT="${COMMIT:-}"
APP_USER="elichat"
APP_DIR="/home/${APP_USER}/app"

say()  { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m[x] %s\033[0m\n' "$*" >&2; exit 1; }
as_app() { sudo -u "$APP_USER" env NODE_OPTIONS=--max-old-space-size=1536 "$@"; }

[ "$(id -u)" -eq 0 ] || die "Run with sudo."
[ -d "$APP_DIR/.git" ] || die "No app found in $APP_DIR. Run oracle-setup.sh once first."
cd "$APP_DIR"

PREVIOUS=$(as_app git rev-parse HEAD)
TARGET="${COMMIT:-origin/$BRANCH}"

build_and_start() {
  as_app npm ci --no-audit --no-fund --include-workspace-root \
    -w @secure-chat/backend -w @secure-chat/web -w @secure-chat/admin -w @secure-chat/shared &&
  as_app npm run build:hosted &&
  systemctl restart elisecurechat &&
  for i in $(seq 1 45); do
    curl -fs http://127.0.0.1:3000/api/health >/dev/null && return 0
    sleep 2
  done
  return 1
}

say "Fetching $BRANCH (${COMMIT:-latest})"
as_app git fetch --depth 20 origin "$BRANCH"
[ -n "$COMMIT" ] && { as_app git cat-file -e "$COMMIT^{commit}" 2>/dev/null || as_app git fetch --depth 1 origin "$COMMIT"; }
as_app git reset --hard "$TARGET"
NEW=$(as_app git rev-parse HEAD)
if [ "$NEW" = "$PREVIOUS" ] && curl -fs http://127.0.0.1:3000/api/health >/dev/null; then
  say "Already running $NEW. Nothing to do."
  exit 0
fi

say "Building and starting $NEW"
if build_and_start; then
  say "Updated: ${PREVIOUS:0:7} -> ${NEW:0:7}. App is healthy."
  exit 0
fi

journalctl -u elisecurechat -n 40 --no-pager || true
say "New version failed. Rolling back to ${PREVIOUS:0:7}"
as_app git reset --hard "$PREVIOUS"
if build_and_start; then
  die "Deploy of ${NEW:0:7} failed; rolled back to ${PREVIOUS:0:7}, which is running."
fi
die "Deploy failed and the rollback did not start either. Check: journalctl -u elisecurechat"
