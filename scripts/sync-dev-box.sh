#!/usr/bin/env bash
# Push workspace → dev-box so Next HMR can see changes.
#
# Usage:
#   ./scripts/sync-dev-box.sh                 # rsync only (HMR picks up files)
#   ./scripts/sync-dev-box.sh --restart        # rsync + restart master/d2/d6/fallball
#   ./scripts/sync-dev-box.sh --restart-fallball  # rsync + ensure fallball :3005 only
#   ./scripts/sync-dev-box.sh --quiet          # less rsync noise
#
# Env:
#   DEV_BOX_HOST  default: dev-box (ssh config Host)
#   DEV_BOX_DIR   default: /srv/code/gonzales-db-next
set -euo pipefail

REMOTE="${DEV_BOX_HOST:-dev-box}"
REMOTE_DIR="${DEV_BOX_DIR:-/srv/code/gonzales-db-next}"
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RESTART=false
RESTART_FALLBALL=false
QUIET=false
SSH_CONFIG="${SSH_CONFIG:-/config/.ssh/config}"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=15)
if [[ -f "$SSH_CONFIG" ]]; then
  SSH_OPTS+=(-F "$SSH_CONFIG")
fi

for arg in "$@"; do
  case "$arg" in
    --restart) RESTART=true ;;
    --restart-fallball) RESTART_FALLBALL=true ;;
    --quiet|-q) QUIET=true ;;
    -h|--help)
      echo "Usage: $0 [--restart|--restart-fallball] [--quiet]"
      exit 0
      ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

RSYNC_EXCLUDES=(
  --exclude node_modules
  --exclude .next
  --exclude .next-master
  --exclude .next-gonzales
  --exclude .next-ascension
  --exclude .next-ladistrict2
  --exclude .next-ladistrict6
  --exclude .next-fallball
  --exclude .next-public
  --exclude .git
  --exclude .env
  --exclude .env.local
  --exclude .env.development.local
  --exclude .env*.local
  --exclude 'public/images/*.original.png'
)

RSYNC_FLAGS=(-a --delete)
if [[ "$QUIET" == true ]]; then
  RSYNC_FLAGS+=(-q)
else
  RSYNC_FLAGS+=(-v)
fi

remote() {
  ssh "${SSH_OPTS[@]}" "$REMOTE" "$@"
}

echo "→ Syncing ${LOCAL_DIR} → ${REMOTE}:${REMOTE_DIR}"
if command -v rsync >/dev/null 2>&1; then
  rsync "${RSYNC_FLAGS[@]}" "${RSYNC_EXCLUDES[@]}" \
    -e "ssh ${SSH_OPTS[*]}" \
    "${LOCAL_DIR}/" "${REMOTE}:${REMOTE_DIR}/"
else
  echo "rsync not found; install rsync for reliable sync" >&2
  exit 1
fi

start_fallball() {
  remote bash -s <<'EOF'
set -euo pipefail
# Prefer systemd unit (webpack + DATABASE_URL via EnvironmentFile)
if systemctl --user cat fallball-dev.service >/dev/null 2>&1; then
  systemctl --user daemon-reload
  systemctl --user restart fallball-dev.service
  systemctl --user --quiet is-active fallball-dev.service
  echo "fallball → :3005 via fallball-dev.service (log /tmp/fallball-3005.log)"
  exit 0
fi
cd /srv/code/gonzales-db-next
# Free port 3005 without self-matching pkill -f pitfalls
if command -v fuser >/dev/null 2>&1; then
  fuser -k 3005/tcp 2>/dev/null || true
else
  ss -tlnp 2>/dev/null | awk '/:3005 / {print}' | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | sort -u | while read -r pid; do
    kill "$pid" 2>/dev/null || true
  done
fi
sleep 1
# shellcheck disable=SC1091
set -a
[[ -f /home/dev/.config/fallball-dev.env ]] && . /home/dev/.config/fallball-dev.env
[[ -f .env.development.local ]] && . ./.env.development.local
set +a
NODE_OPTIONS='--max-old-space-size=1536' SITE_ORG=fallball NEXT_DIST_DIR=.next-fallball \
  nohup pnpm exec next dev --webpack -p 3005 --hostname 0.0.0.0 > /tmp/fallball-dev.log 2>&1 &
echo "fallball → :3005 webpack nohup (log /tmp/fallball-dev.log)"
EOF
}

if [[ "$RESTART" == true ]]; then
  echo "→ Restarting master (3002), ladistrict2 (3003), ladistrict6 (3004), fallball (3005)"
  remote bash -s <<'EOF'
set -euo pipefail
cd /srv/code/gonzales-db-next
# Prefer fallball systemd; free other ports for nohup orgs
if systemctl --user cat fallball-dev.service >/dev/null 2>&1; then
  systemctl --user daemon-reload
  systemctl --user restart fallball-dev.service
  echo "fallball → :3005 via fallball-dev.service"
else
  if command -v fuser >/dev/null 2>&1; then
    fuser -k 3005/tcp 2>/dev/null || true
  fi
fi
for port in 3002 3003 3004; do
  if command -v fuser >/dev/null 2>&1; then
    fuser -k ${port}/tcp 2>/dev/null || true
  fi
done
sleep 1
NODE_OPTIONS='--max-old-space-size=1536' SITE_ORG=master NEXT_DIST_DIR=.next-master \
  nohup pnpm exec next dev -p 3002 --hostname 0.0.0.0 > /tmp/master-dev.log 2>&1 &
NODE_OPTIONS='--max-old-space-size=1536' SITE_ORG=ladistrict2 NEXT_DIST_DIR=.next-ladistrict2 \
  nohup pnpm exec next dev -p 3003 --hostname 0.0.0.0 > /tmp/ladistrict2-dev.log 2>&1 &
NODE_OPTIONS='--max-old-space-size=1536' SITE_ORG=ladistrict6 NEXT_DIST_DIR=.next-ladistrict6 \
  nohup pnpm exec next dev -p 3004 --hostname 0.0.0.0 > /tmp/ladistrict6-dev.log 2>&1 &
if ! systemctl --user cat fallball-dev.service >/dev/null 2>&1; then
  set -a
  [[ -f /home/dev/.config/fallball-dev.env ]] && . /home/dev/.config/fallball-dev.env
  [[ -f .env.development.local ]] && . ./.env.development.local
  set +a
  NODE_OPTIONS='--max-old-space-size=1536' SITE_ORG=fallball NEXT_DIST_DIR=.next-fallball \
    nohup pnpm exec next dev --webpack -p 3005 --hostname 0.0.0.0 > /tmp/fallball-dev.log 2>&1 &
fi
echo "Started 3002–3005. Fall Ball: systemd or /tmp/fallball-dev.log"
EOF
elif [[ "$RESTART_FALLBALL" == true ]]; then
  echo "→ Ensuring fallball on :3005"
  start_fallball
fi

if [[ "$QUIET" != true ]]; then
  echo "✓ Synced. Fall Ball: http://192.168.100.156:3005/"
  echo "  Master:    http://192.168.100.156:3002/admin/login"
  echo "  Tip: open LAN URL (not 42 proxy frame) for full Next HMR websocket."
fi
