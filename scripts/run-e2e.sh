#!/usr/bin/env bash
# Run the Playwright e2e suite against the Vite dev server.
#
# Starts `npm run dev` on 127.0.0.1:1420 (unless it is already running), waits
# for it to be ready, runs `npm run test:e2e`, and tears the server down on exit.
#
# Usage: make test-e2e   (or: scripts/run-e2e.sh)
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND="$ROOT/ui/frontend"
HOST="${FRONTEND_HOST:-127.0.0.1}"
PORT="${FRONTEND_PORT:-1420}"
URL="http://$HOST:$PORT/"
LOG="$(mktemp -t aim3d-e2e-dev.XXXXXX.log)"

cleanup() {
  if [ -n "${DEV_PID:-}" ] && kill -0 "$DEV_PID" 2>/dev/null; then
    kill "$DEV_PID" 2>/dev/null || true
    wait "$DEV_PID" 2>/dev/null || true
  fi
  rm -f "$LOG"
}
trap cleanup EXIT INT TERM

# If a server is already serving the app on the port, reuse it.
already_up() {
  curl -sf "$URL" >/dev/null 2>&1
}

DEV_PID=""
if ! already_up; then
  echo "[e2e] starting Vite dev server on $URL ..."
  ( cd "$FRONTEND" && npm run dev -- --host "$HOST" --port "$PORT" ) >"$LOG" 2>&1 &
  DEV_PID=$!

  # Wait for Vite to report a Local URL (or exit early if it dies, e.g. port busy).
  for _ in $(seq 1 90); do
    if grep -qi "Local:" "$LOG" 2>/dev/null; then break; fi
    if ! kill -0 "$DEV_PID" 2>/dev/null; then
      # Process exited — maybe the port was taken by another server. Re-check.
      if already_up; then DEV_PID=""; break; fi
      echo "[e2e] dev server exited unexpectedly:" >&2
      cat "$LOG" >&2
      exit 1
    fi
    sleep 0.5
  done

  if ! already_up; then
    echo "[e2e] dev server did not become ready:" >&2
    cat "$LOG" >&2
    exit 1
  fi
  echo "[e2e] dev server ready."
else
  echo "[e2e] reusing existing dev server on $URL."
fi

( cd "$FRONTEND" && npm run test:e2e )
status=$?
exit "$status"
