#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Clearing corrupted dev caches..."
rm -rf "$ROOT/.next-gonzales" "$ROOT/.next-ascension" "$ROOT/.next-master" "$ROOT/.next-ladistrict2"

echo "Stopping existing dev servers..."
pkill -f "concurrently.*gonzales,ascension,master" 2>/dev/null || true
pkill -f "next dev.*--hostname 0.0.0.0" 2>/dev/null || true
sleep 2

if pgrep -f "next dev.*--hostname 0.0.0.0" >/dev/null; then
  echo "Force-stopping stubborn next dev processes..."
  pkill -9 -f "next dev.*--hostname 0.0.0.0" 2>/dev/null || true
  sleep 1
fi

echo "Starting dev:all (Turbopack, ports 3000-3003)..."
nohup pnpm dev:all > /tmp/gonzales-dev-all.log 2>&1 &
echo "Log: /tmp/gonzales-dev-all.log"
sleep 8

for port in 3000 3001 3002 3003; do
  if curl -sf -o /dev/null --connect-timeout 5 "http://127.0.0.1:${port}/"; then
    echo "  port ${port}: up"
  else
    echo "  port ${port}: not ready yet"
  fi
done
