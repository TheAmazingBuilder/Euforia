#!/usr/bin/env bash
# restore-canonical-server.sh — mirror of .zscripts/dev.sh launch lines
# (market-service :3003 + web :3000 production start), used after a
# verification batch killed the tiers. Same health checks, no rebuild.
set -u
ROOT=/home/z/my-project
cd "$ROOT"

if ! curl -sf --max-time 2 http://127.0.0.1:3003/health > /dev/null 2>&1; then
  (cd "$ROOT/mini-services/market-service" && exec /usr/local/bin/bun --hot index.ts) \
    > /tmp/cosmoz-market.log 2>&1 &
  echo "market-service launched"
else
  echo "market-service already up"
fi

if ! curl -sf --max-time 2 http://127.0.0.1:3000/ > /dev/null 2>&1; then
  (cd "$ROOT/apps/web" && exec /usr/bin/node ./node_modules/next/dist/bin/next start) \
    > /tmp/cosmoz-web.log 2>&1 &
  echo "web launched"
else
  echo "web already up"
fi

sleep 3
curl -s -o /dev/null -w "home: %{http_code}\n" http://localhost:3000/ --max-time 5
curl -s -o /dev/null -w "accounts: %{http_code}\n" http://localhost:3000/accounts --max-time 5
