#!/usr/bin/env bash
# run-with-server.sh - start the dev server, wait until it answers, run a
# command, then stop the server. Usage: bash run-with-server.sh <command...>
set -u
export PATH="/home/z/.local/bin:$PATH"
PORT=3000
LOG=/tmp/dev-server.log

# Fresh start: kill anything on the port. Bracket trick so the pattern never
# matches this script's own cmdline (pkill would SIGKILL its own shell).
pkill -9 -f "next[ ]dev" 2>/dev/null
pkill -9 -f "next[-]server" 2>/dev/null
sleep 1

cd /home/z/my-project/apps/web
setsid nohup pnpm dev > "$LOG" 2>&1 < /dev/null &
SERVER_PID=$!

# Wait for the server to answer (max 60s)
for i in $(seq 1 60); do
  if curl -s -o /dev/null --max-time 2 http://localhost:$PORT/; then
    break
  fi
  sleep 1
done

if ! curl -s -o /dev/null --max-time 2 http://localhost:$PORT/; then
  echo "SERVER FAILED TO START"; tail -20 "$LOG"; exit 1
fi

echo "server ready - running: $*"
cd /home/z/my-project
"$@"
EXIT=$?

(lsof -t -i:$PORT 2>/dev/null | xargs -r kill -9) 2>/dev/null
exit $EXIT
