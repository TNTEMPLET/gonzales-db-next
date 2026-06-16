#!/usr/bin/env bash
# Push local workspace changes to dev-box and optionally restart dev servers.
# Usage:
#   ./scripts/sync-dev-box.sh              # rsync only
#   ./scripts/sync-dev-box.sh --restart    # rsync + restart master + ladistrict6 on 3002/3004
set -euo pipefail

REMOTE="${DEV_BOX_HOST:-dev-box}"
REMOTE_DIR="${DEV_BOX_DIR:-/srv/code/gonzales-db-next}"
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RESTART=false

for arg in "$@"; do
  case "$arg" in
    --restart) RESTART=true ;;
    -h|--help)
      echo "Usage: $0 [--restart]"
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
  --exclude .git
)

echo "→ Syncing ${LOCAL_DIR} → ${REMOTE}:${REMOTE_DIR}"
if command -v rsync >/dev/null 2>&1; then
  rsync -av --delete "${RSYNC_EXCLUDES[@]}" "${LOCAL_DIR}/" "${REMOTE}:${REMOTE_DIR}/"
else
  echo "rsync not found; using scp for bracket + dev paths (install rsync for full sync)"
  scp -r \
    "${LOCAL_DIR}/app/tournaments" \
    "${REMOTE}:${REMOTE_DIR}/app/"
  scp -r \
    "${LOCAL_DIR}/components/brackets" \
    "${REMOTE}:${REMOTE_DIR}/components/"
  scp -r \
    "${LOCAL_DIR}/components/admin" \
    "${REMOTE}:${REMOTE_DIR}/components/"
  scp -r \
    "${LOCAL_DIR}/lib/tournament-brackets" \
    "${REMOTE}:${REMOTE_DIR}/lib/"
  scp -r \
    "${LOCAL_DIR}/app/api/admin/tournament-brackets" \
    "${REMOTE}:${REMOTE_DIR}/app/api/admin/"
  scp \
    "${LOCAL_DIR}/next.config.ts" \
    "${LOCAL_DIR}/app/layout.tsx" \
    "${REMOTE}:${REMOTE_DIR}/"
  scp -r \
    "${LOCAL_DIR}/lib/dev" \
    "${REMOTE}:${REMOTE_DIR}/lib/" 2>/dev/null || true
  scp -r \
    "${LOCAL_DIR}/components/dev" \
    "${REMOTE}:${REMOTE_DIR}/components/" 2>/dev/null || true
fi

if [[ "$RESTART" == true ]]; then
  echo "→ Restarting master (3002), ladistrict2 (3003), and ladistrict6 (3004) dev servers on ${REMOTE}"
  ssh "$REMOTE" bash -s <<'EOF'
set -euo pipefail
cd /srv/code/gonzales-db-next
pkill -f "next dev -p 3002" 2>/dev/null || true
pkill -f "next dev -p 3003" 2>/dev/null || true
pkill -f "next dev -p 3004" 2>/dev/null || true
sleep 1
NODE_OPTIONS='--max-old-space-size=1536' SITE_ORG=master NEXT_DIST_DIR=.next-master \
  nohup pnpm exec next dev -p 3002 --hostname 0.0.0.0 > /tmp/master-dev.log 2>&1 &
NODE_OPTIONS='--max-old-space-size=1536' SITE_ORG=ladistrict2 NEXT_DIST_DIR=.next-ladistrict2 \
  nohup pnpm exec next dev -p 3003 --hostname 0.0.0.0 > /tmp/ladistrict2-dev.log 2>&1 &
NODE_OPTIONS='--max-old-space-size=1536' SITE_ORG=ladistrict6 NEXT_DIST_DIR=.next-ladistrict6 \
  nohup pnpm exec next dev -p 3004 --hostname 0.0.0.0 > /tmp/ladistrict6-dev.log 2>&1 &
echo "Started. Tail: /tmp/master-dev.log /tmp/ladistrict2-dev.log /tmp/ladistrict6-dev.log"
EOF
fi

echo "✓ Done. Bracket admin: http://192.168.100.156:3002/admin/tournament-brackets?org=ladistrict6"
echo "  District 2 public: http://192.168.100.156:3003/tournaments"
