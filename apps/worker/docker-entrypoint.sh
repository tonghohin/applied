#!/bin/sh
# Runs the worker with a virtual display so the headed stealth browser can
# launch inside the container.
set -e

DISPLAY_NUM=99
export DISPLAY=":${DISPLAY_NUM}"

# Clear stale locks from a previous container start (docker compose restart).
rm -f "/tmp/.X${DISPLAY_NUM}-lock" "/tmp/.X11-unix/X${DISPLAY_NUM}"

Xvfb "$DISPLAY" -screen 0 "${SCREEN_GEOMETRY:-1280x800x24}" -nolisten tcp &

# Wait for the X socket before starting anything that needs it.
tries=100
while [ ! -S "/tmp/.X11-unix/X${DISPLAY_NUM}" ] && [ "$tries" -gt 0 ]; do
  sleep 0.1
  tries=$((tries - 1))
done

# Run via the tsx CLI (as `pnpm dev` does) from the worker package dir — the
# `node --import tsx/esm` path trips Node's require(esm) cycle guard on the
# drizzle schema imports.
cd /app/apps/worker
exec node_modules/.bin/tsx src/index.ts
