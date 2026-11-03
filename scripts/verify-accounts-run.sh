#!/usr/bin/env bash
# verify-accounts-run.sh - ensure the dev server on :3000 (restart with
# next dev if dead), then run the Accounts probe in the SAME shell session
# so the server survives for the whole run (devrun.sh pattern, corepack).
set -u
cd /home/z/my-project

if ! curl -s -o /dev/null -m 2 http://localhost:3000/; then
  (lsof -ti:3000 | xargs -r kill -9) 2>/dev/null || true
  rm -f apps/web/.next/dev/lock
  nohup /usr/bin/corepack pnpm --filter web dev > /tmp/cosmoz-dev.log 2>&1 < /dev/null &
  for i in $(seq 1 60); do
    sleep 1
    if curl -s -o /dev/null -m 2 http://localhost:3000/; then break; fi
  done
fi

if ! curl -s -o /dev/null -m 2 http://localhost:3000/; then
  echo "DEV SERVER FAILED TO START"; tail -20 /tmp/cosmoz-dev.log; exit 1
fi

node apps/web/scripts/verify-accounts.js
