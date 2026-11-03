#!/usr/bin/env bash
# Warm up the COSMOZ dev server page by page, restarting on OOM death.
# Turbopack persists compiled chunks in .next/dev, so each successful page
# compile survives restarts - the loop converges.
set -u
export PATH="/home/z/.local/bin:$PATH"
cd /home/z/my-project

PAGES=("/login" "/" "/settings" "/goals" "/profile" "/trades")
declare -A DONE

start_server() {
  (lsof -ti:3000 | xargs -r kill -9) 2>/dev/null || true
  pkill -9 -f "next-server" 2>/dev/null || true
  sleep 1
  rm -f apps/web/.next/dev/lock
  setsid nohup pnpm --filter web dev > /tmp/cosmoz-dev.log 2>&1 < /dev/null &
  disown
  # wait for socket
  for i in $(seq 1 60); do
    sleep 1
    curl -s -o /dev/null -m 2 http://localhost:3000/ && return 0
  done
  return 1
}

for round in 1 2 3 4 5 6; do
  ALLOK=1
  for p in "${PAGES[@]}"; do
    [ "${DONE[$p]:-}" = "1" ] && continue
    code=$(curl -s -o /dev/null -w "%{http_code}" -m 180 "http://localhost:3000$p")
    if [ "$code" = "200" ]; then
      echo "✓ $p (round $round)"
      DONE[$p]=1
    else
      echo "✗ $p (round $round, code $code) - restarting"
      ALLOK=0
      free -m | sed -n 2p
      start_server || { echo "server failed to start"; exit 1; }
      break
    fi
  done
  [ "$ALLOK" = "1" ] && { echo "ALL PAGES COMPILED"; exit 0; }
done
echo "DID NOT CONVERGE"; exit 1
