#!/usr/bin/env bash
# Self-sufficient dev-server runner for verification batches.
# Usage: bash scripts/devrun.sh "<node command...>"
# Ensures the dev server on :3000 (reuses if alive, restarts if not),
# then runs the given command in the SAME shell session.
set -u
export PATH="/home/z/.local/bin:$PATH"
cd /home/z/my-project

if ! curl -s -o /dev/null -m 2 http://localhost:3000/; then
  (lsof -ti:3000 | xargs -r kill -9) 2>/dev/null || true
  pkill -9 -f "next-server" 2>/dev/null || true
  rm -f apps/web/.next/dev/lock
  (cd apps/web && setsid nohup npx next dev > /tmp/cosmoz-dev.log 2>&1 < /dev/null &) || true
  for i in $(seq 1 60); do
    sleep 1
    if curl -s -o /dev/null -m 2 http://localhost:3000/; then break; fi
  done
  # First-compile warm-up: poll until the root route actually answers.
  for i in $(seq 1 60); do
    sleep 1
    code=$(curl -s -o /dev/null -w "%{http_code}" -m 10 http://localhost:3000/ || true)
    if [ "$code" = "200" ]; then break; fi
  done
fi

if ! curl -s -o /dev/null -m 2 http://localhost:3000/; then
  echo "DEV SERVER FAILED TO START"; tail -20 /tmp/cosmoz-dev.log; exit 1
fi

bash -c "$*"
