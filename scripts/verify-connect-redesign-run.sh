#!/usr/bin/env bash
# verify-connect-redesign-run.sh - REBUILD the web app (the redesign must be
# verified on the production build, not a stale next-server), restart :3000
# with next start, then run the probe in the SAME shell session so the server
# survives the whole run (sandbox: processes die between commands).
set -u
cd /home/z/my-project

(lsof -ti:3000 | xargs -r kill -9) 2>/dev/null || true
sleep 1
rm -f apps/web/.next/dev/lock

/usr/bin/corepack pnpm --filter web build || { echo "BUILD FAILED"; exit 1; }

nohup /usr/bin/corepack pnpm --filter web start > /tmp/cosmoz-prod.log 2>&1 < /dev/null &
for i in $(seq 1 90); do
  sleep 1
  if curl -s -o /dev/null -m 2 http://localhost:3000/; then break; fi
done

if ! curl -s -o /dev/null -m 2 http://localhost:3000/; then
  echo "PROD SERVER FAILED TO START"; tail -20 /tmp/cosmoz-prod.log; exit 1
fi

node apps/web/scripts/verify-connect-redesign.js
