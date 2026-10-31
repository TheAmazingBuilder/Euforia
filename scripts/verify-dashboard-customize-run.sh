#!/usr/bin/env bash
# verify-dashboard-customize-run.sh - REBUILD the web app (Phase 01 dashboard
# customization must be verified on the production build, not a stale
# next-server), restart :3000 with next start, then run BOTH dashboard probes
# in the SAME shell session so the server survives the whole run.
# Lesson from the worklog: kill -9 any next-server zombie BEFORE the build -
# an old server silently serves the stale bundle (ChunkLoadError 500s).
set -u
cd /home/z/my-project

(lsof -ti:3000 | xargs -r kill -9) 2>/dev/null || true
pkill -9 next-server 2>/dev/null || true
sleep 1
rm -f apps/web/.next/dev/lock

/usr/bin/corepack pnpm --filter web build || { echo "BUILD FAILED"; exit 1; }

nohup /usr/bin/corepack pnpm --filter web start > /tmp/cosmoz-customize-prod.log 2>&1 < /dev/null &
for i in $(seq 1 90); do
  sleep 1
  if curl -s -o /dev/null -m 2 http://localhost:3000/; then break; fi
done

if ! curl -s -o /dev/null -m 2 http://localhost:3000/; then
  echo "PROD SERVER FAILED TO START"; tail -20 /tmp/cosmoz-customize-prod.log; exit 1
fi

echo "=== Phase 01 probe (verify-dashboard-customize) ==="
node scripts/verify-dashboard-customize.js
P1=$?
echo ""
echo "=== Regression probe (verify-dashboard-upgrades) ==="
node scripts/verify-dashboard-upgrades.js
P2=$?
# NOTE: scripts/verify-dashboard-kpis.js is a STALE probe (waits for a
# "performance-strip" testid that never existed in this repo + old demo
# credentials) - pre-existing baseline failure, kept out of this gate.

echo ""
echo "probe exit codes: customize=$P1 upgrades=$P2"
# Leave the server running for manual inspection, then stop it cleanly.
