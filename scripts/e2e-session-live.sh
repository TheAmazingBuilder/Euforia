#!/bin/bash
# E2E — Session Live V1 (mission §29/§30) — single-call runner v2:
# server lifecycle + browser checks in one Bash session. Reconnection is
# tested by KILLING the real market service (WS loss + poll loss), then
# restarting it — full resync path (§18).
B="agent-browser"
SHOTS=/home/z/my-project/apps/web/scripts/shots/t16
mkdir -p "$SHOTS"

# ── 1. Dev server (mocked) ────────────────────────────────────────────────
cd /home/z/my-project/apps/web
export NEXT_PUBLIC_API_MOCKED=true
node node_modules/next/dist/bin/next dev > /tmp/cosmoz-dev.log 2>&1 &
SERVER_PID=$!
for i in $(seq 1 90); do
  curl -s -m 2 -o /dev/null http://localhost:3000/ && break
  sleep 1
done
echo "== server up (pid $SERVER_PID) =="

# ── 2. Desktop 1440 ───────────────────────────────────────────────────────
$B set viewport 1440 900 >/dev/null
$B open about:blank >/dev/null
$B errors --clear >/dev/null 2>&1
$B console --clear >/dev/null 2>&1
$B open http://localhost:3000/session >/dev/null 2>&1
$B wait --load networkidle >/dev/null 2>&1
sleep 5  # feed connect + candles + broker query

echo "== URL: $($B get url 2>/dev/null) =="
echo "== overflow desktop =="
$B eval "(() => JSON.stringify({sw: document.documentElement.scrollWidth, iw: window.innerWidth, sh: document.documentElement.scrollHeight, ih: window.innerHeight}))()"
echo "== toolbar/badge/price =="
$B eval "(() => document.querySelector('[data-testid=session-toolbar]') ? 'toolbar-ok' : 'toolbar-MISSING')()"
$B eval "(() => { const el=document.querySelector('[data-testid=feed-badge]'); return el ? el.textContent+' / state='+el.dataset.state : 'MISSING'; })()"
$B eval "(() => document.querySelector('[data-testid=marked-price]')?.textContent ?? 'no-price')()"
echo "== chart =="
$B eval "(() => { const el=document.querySelector('[data-testid=price-chart]'); if(!el) return 'MISSING'; const cv=el.querySelector('canvas'); return el.dataset.symbol+' '+el.dataset.interval+' canvas='+(cv?cv.width+'x'+cv.height:'none'); })()"
echo "== broker panel (first 120 chars) =="
$B eval "(() => document.querySelector('[data-testid=broker-panel]')?.textContent?.slice(0,120) ?? 'MISSING')()"
echo "== broker action buttons (must be 0) =="
$B eval "(() => document.querySelectorAll('[data-testid=broker-panel] button').length)()"
echo "== symbol positions (first 160 chars) =="
$B eval "(() => document.querySelector('[data-testid=symbol-positions]')?.textContent?.slice(0,160) ?? 'MISSING')()"
$B screenshot "$SHOTS/desktop-session-top.png" >/dev/null
$B eval "(() => window.scrollTo(0, document.body.scrollHeight*0.5))()" >/dev/null; sleep 1
$B screenshot "$SHOTS/desktop-session-middle.png" >/dev/null
$B eval "(() => window.scrollTo(0, 0))()" >/dev/null; sleep 1

echo "== live tick check: price now vs +4s =="
P1=$($B eval "(() => document.querySelector('[data-testid=marked-price]')?.textContent ?? 'none')()" 2>/dev/null)
sleep 4
P2=$($B eval "(() => document.querySelector('[data-testid=marked-price]')?.textContent ?? 'none')()" 2>/dev/null)
echo "price1='$P1' price2='$P2'"

echo "== timeframe switch 5m -> 1H =="
$B find role combobox click --name "Select timeframe" >/dev/null 2>&1
sleep 1
$B find role option click --name "1H" >/dev/null 2>&1
sleep 2
echo "interval now: $($B eval "(() => document.querySelector('[data-testid=price-chart]')?.dataset.interval ?? 'MISSING')()" 2>/dev/null)"

echo "== symbol switch to BTCUSDT (REAL feed — expect LIVE badge) =="
$B find role combobox click --name "Select symbol" >/dev/null 2>&1
sleep 1
$B find role option click --name "BTCUSDT" >/dev/null 2>&1
sleep 4
echo "badge: $($B eval "(() => { const el=document.querySelector('[data-testid=feed-badge]'); return el ? el.textContent+' / state='+el.dataset.state : 'MISSING'; })()" 2>/dev/null)"
echo "chart: $($B eval "(() => { const el=document.querySelector('[data-testid=price-chart]'); return el ? el.dataset.symbol+' '+el.dataset.interval : 'MISSING'; })()" 2>/dev/null)"
echo "price: $($B eval "(() => document.querySelector('[data-testid=marked-price]')?.textContent ?? 'none')()" 2>/dev/null)"
$B screenshot "$SHOTS/desktop-btcusdt-real-live.png" >/dev/null

echo "== symbol switch to EURUSD (SIM feed — expect SIM badge) =="
$B find role combobox click --name "Select symbol" >/dev/null 2>&1
sleep 1
$B find role option click --name "EURUSD" >/dev/null 2>&1
sleep 3
echo "badge: $($B eval "(() => { const el=document.querySelector('[data-testid=feed-badge]'); return el ? el.textContent+' / state='+el.dataset.state : 'MISSING'; })()" 2>/dev/null)"
echo "chart: $($B eval "(() => { const el=document.querySelector('[data-testid=price-chart]'); return el ? el.dataset.symbol+' '+el.dataset.interval : 'MISSING'; })()" 2>/dev/null)"
echo "price: $($B eval "(() => document.querySelector('[data-testid=marked-price]')?.textContent ?? 'none')()" 2>/dev/null)"
$B screenshot "$SHOTS/desktop-session-eurusd-sim.png" >/dev/null

# ── 3. Reconnection (mission §18) — REAL server loss then restart ────────
echo "== kill market service (real connection loss) =="
pkill -f "bun --hot index.ts" 2>/dev/null
pkill -f "bun index.ts" 2>/dev/null
sleep 14
echo "badge after loss: $($B eval "(() => { const el=document.querySelector('[data-testid=feed-badge]'); return el ? el.textContent+' / state='+el.dataset.state : 'MISSING'; })()" 2>/dev/null)"
$B screenshot "$SHOTS/desktop-session-feed-lost.png" >/dev/null
echo "== restart market service =="
cd /home/z/my-project/mini-services/market-service
nohup bun index.ts > /tmp/cosmoz-market-restart.log 2>&1 &
sleep 3
cd /home/z/my-project/apps/web
sleep 15
echo "badge after resync: $($B eval "(() => { const el=document.querySelector('[data-testid=feed-badge]'); return el ? el.textContent+' / state='+el.dataset.state : 'MISSING'; })()" 2>/dev/null)"
echo "price after resync: $($B eval "(() => document.querySelector('[data-testid=marked-price]')?.textContent ?? 'none')()" 2>/dev/null)"
$B screenshot "$SHOTS/desktop-session-reconnected.png" >/dev/null

echo "== full page desktop =="
$B screenshot --full "$SHOTS/desktop-session-full.png" >/dev/null

echo "== page errors (must be empty) =="
$B errors --json 2>/dev/null | head -c 300
echo
echo "== console errors/warnings (last 12) =="
$B console 2>/dev/null | grep -iE "error|warn" | tail -12

# ── 4. Mobile 390 ─────────────────────────────────────────────────────────
echo "== mobile 390 =="
$B set viewport 390 844 >/dev/null
$B open http://localhost:3000/session >/dev/null 2>&1
$B wait --load networkidle >/dev/null 2>&1
sleep 5
echo "== overflow mobile =="
$B eval "(() => JSON.stringify({sw: document.documentElement.scrollWidth, iw: window.innerWidth, sh: document.documentElement.scrollHeight, ih: window.innerHeight}))()"
$B screenshot "$SHOTS/mobile-session-top.png" >/dev/null
$B eval "(() => window.scrollTo(0, document.body.scrollHeight*0.4))()" >/dev/null; sleep 1
$B screenshot "$SHOTS/mobile-session-middle.png" >/dev/null
$B screenshot --full "$SHOTS/mobile-session-full.png" >/dev/null
echo "== mobile errors (count) =="
$B errors --json 2>/dev/null | grep -o '"text"' | wc -l

echo "== E2E DONE =="
kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null
echo "== server stopped =="
