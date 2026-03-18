#!/usr/bin/env bash
set -euo pipefail

echo "== Starting container =="
echo "Node: $(node --version)"
echo "npm : $(npm --version)"

echo "== Starting D-Bus =="
mkdir -p /run/dbus
dbus-daemon --system --fork 2>/dev/null || true

echo "== Locating warp-svc =="
if command -v warp-svc >/dev/null 2>&1; then
  WARP_SVC="$(command -v warp-svc)"
elif [ -x /usr/bin/warp-svc ]; then
  WARP_SVC=/usr/bin/warp-svc
elif [ -x /usr/sbin/warp-svc ]; then
  WARP_SVC=/usr/sbin/warp-svc
else
  echo "ERROR: warp-svc not found"
  find /usr -name 'warp-svc' 2>/dev/null || true
  exit 1
fi
echo "warp-svc path: ${WARP_SVC}"

echo "== Starting WARP service =="
"${WARP_SVC}" >/tmp/warp-svc.log 2>&1 &
WARP_PID=$!
sleep 5

if ! kill -0 "${WARP_PID}" 2>/dev/null; then
  echo "ERROR: warp-svc failed to stay running"
  cat /tmp/warp-svc.log || true
  exit 1
fi

echo "== Configuring WARP local proxy mode =="
warp-cli --accept-tos mode proxy || true
warp-cli --accept-tos proxy port "${WARP_LOCAL_PROXY_PORT}" || true
warp-cli --accept-tos dns families off || true

echo "== Registering WARP client =="
if [ -n "${CF_REGISTRATION_TOKEN:-}" ]; then
  echo "Using explicit CF_REGISTRATION_TOKEN"
  warp-cli --accept-tos registration token "${CF_REGISTRATION_TOKEN}" || true
elif [ -n "${CF_TEAM_NAME:-}" ]; then
  echo "Attempting team-based registration for: ${CF_TEAM_NAME}"
  warp-cli --accept-tos registration new "${CF_TEAM_NAME}" || true
else
  echo "Attempting consumer registration"
  warp-cli --accept-tos registration new || true
fi

echo "== Connecting WARP =="
warp-cli --accept-tos connect || true

TIMEOUT=45
while [ "${TIMEOUT}" -gt 0 ]; do
  STATUS="$(warp-cli --accept-tos status 2>/dev/null || true)"
  echo "${STATUS}"
  if echo "${STATUS}" | grep -qi "Connected"; then
    break
  fi
  sleep 1
  TIMEOUT=$((TIMEOUT - 1))
done

FINAL_STATUS="$(warp-cli --accept-tos status 2>/dev/null || true)"
echo "== Final WARP status =="
echo "${FINAL_STATUS}"

if ! echo "${FINAL_STATUS}" | grep -qi "Connected"; then
  echo "WARNING: WARP did not report Connected."
  echo "The direct IP test will still run, but proxied checks may fail."
fi

echo "WARP local SOCKS5 proxy available at 127.0.0.1:${WARP_LOCAL_PROXY_PORT}"

echo "== Running test app =="
exec npm start
