#!/usr/bin/env bash
# serve-web.sh - start the production web server on :3000 and wait until it
# answers. The process dies with the tool call in this environment; each
# verification call must invoke this first. Usage: bash serve-web.sh
set -u
export PATH="/home/z/.local/bin:$PATH"

# Kill anything already on 3000 (bracket trick so pkill never matches itself).
pkill -9 -f "next[-]server" 2>/dev/null
pkill -9 -f "next[ ]start" 2>/dev/null
sleep 1

cd /home/z/my-project/apps/web
NEXT_PUBLIC_API_MOCKED=true setsid nohup npx next start -p 3000 > /tmp/cosmoz-web.log 2>&1 < /dev/null &

for i in $(seq 1 40); do
  if curl -s -o /dev/null --max-time 2 http://localhost:3000/; then
    echo "SERVER UP (attempt $i)"
    exit 0
  fi
  sleep 1
done
echo "SERVER FAILED TO START"; tail -20 /tmp/cosmoz-web.log; exit 1
