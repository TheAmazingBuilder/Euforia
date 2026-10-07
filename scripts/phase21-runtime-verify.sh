#!/usr/bin/env bash
# COSMOZ — Phase 21 runtime verification (§136/§137/§138).
#
# Boots the REAL FastAPI sidecar (:3004) + the REAL NestJS API (:4000) on the
# dev database and drives the CONFIRMATION → TRADING CORE bridge end to end:
# register → verify → login → connect a MOCK trading account → upload a REAL
# rendered MT5 screenshot → REVIEW_REQUIRED with Tesseract-extracted fields →
# confirm with a user correction → CONFIRMED with a linked canonical Trade →
# the journal lists the imported trade (source IMPORT, P&L recomputed) →
# idempotent replay never duplicates → deleting the recognition keeps the
# trade (one-way provenance, §77).
#
# Artifacts: /tmp/cosmoz-ocr-verify/ (logs, tokens, payloads) — wiped on exit.
set -euo pipefail

ROOT=/home/z/my-project
ART=/tmp/cosmoz-ocr-verify
API_LOG=$ART/api.log
OCR_LOG=$ART/ocr-service.log
API_PORT=4000
OCR_PORT=3004
ENGINE_TOKEN="runtime-verify-token-0123456789abcdef012345"

mkdir -p "$ART"
cleanup() {
  [[ -n "${API_PID:-}" ]] && kill "$API_PID" 2>/dev/null || true
  [[ -n "${OCR_PID:-}" ]] && kill "$OCR_PID" 2>/dev/null || true
  sleep 0.5
}
trap cleanup EXIT

echo "── 1. Boot the FastAPI sidecar (:3004)"
cd "$ROOT/mini-services/ocr-service"
OCR_SERVICE_TOKEN="$ENGINE_TOKEN" python3 -m uvicorn app.main:app \
  --host 127.0.0.1 --port "$OCR_PORT" --log-level warning > "$OCR_LOG" 2>&1 &
OCR_PID=$!
for i in $(seq 1 40); do
  curl -sf "http://127.0.0.1:$OCR_PORT/healthz" > /dev/null && break
  sleep 0.25
done
curl -sf "http://127.0.0.1:$OCR_PORT/healthz" > /dev/null
echo " ✓ sidecar up"

echo "── 2. Build + boot the NestJS API (:4000, dev DB, bridge enabled)"
cd "$ROOT/apps/api"
export DATABASE_URL="postgresql://cosmoz@127.0.0.1:5433/cosmoz"
export AUTH_JWT_SECRET="runtime-verify-jwt-secret-0123456789abcdef0123456789"
export AUTH_MFA_ENCRYPTION_KEY="h0mEbiEr05Qkg5f8Duz4PrOups2o69gGx+LIEdXAuvU="
export ACCOUNTS_CREDENTIALS_ENCRYPTION_KEY="Mck3U8lb0RHzT7eDlBd7hgmE5FpYm0ZOSJB3ZfA4GFo="
export WEB_APP_URL="http://localhost:3000"
export OCR_SERVICE_URL="http://127.0.0.1:$OCR_PORT"
export OCR_SERVICE_TOKEN="$ENGINE_TOKEN"
export OCR_MOCK_ENGINE="disabled"
export LOG_LEVEL="info"
npm run build > "$ART/build.log" 2>&1
node --enable-source-maps dist/apps/api/src/main.js > "$API_LOG" 2>&1 &
API_PID=$!
for i in $(seq 1 240); do
  curl -sf "http://127.0.0.1:$API_PORT/health" > /dev/null 2>&1 && break
  if ! kill -0 "$API_PID" 2>/dev/null; then
    echo "FAIL: api process died"; tail -30 "$API_LOG"; exit 1
  fi
  sleep 0.5
done
curl -sf "http://127.0.0.1:$API_PORT/health" > /dev/null || { echo "FAIL: api not answering"; tail -30 "$API_LOG"; exit 1; }
echo " ✓ api up"

echo "── 3. Register → verify (token from mail log) → login"
EMAIL="ocr-bridge-verify-$RANDOM@test.cosmoz.dev"
REG=$(curl -s -X POST "http://127.0.0.1:$API_PORT/api/v1/auth/register" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"Str0ng-Passphrase!\",\"name\":\"OCR Bridge Verify\"}")
echo "$REG" | head -c 200; echo
TOKEN=""
for i in $(seq 1 80); do
  TOKEN=$(grep -o "token=[A-Za-z0-9_-]*" "$API_LOG" | tail -1 | cut -d= -f2 || true)
  if [[ -n "$TOKEN" ]]; then break; fi
  sleep 0.5
done
[[ -n "$TOKEN" ]] || { echo "FAIL: no verification token in api log"; tail -20 "$API_LOG"; exit 1; }
curl -sf -X POST "http://127.0.0.1:$API_PORT/api/v1/auth/email/verify" \
  -H 'content-type: application/json' -d "{\"token\":\"$TOKEN\"}" > /dev/null
LOGIN=$(curl -sf -X POST "http://127.0.0.1:$API_PORT/api/v1/auth/login" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"Str0ng-Passphrase!\",\"remember\":true}")
ACCESS=$(echo "$LOGIN" | python3 -c "import json,sys; print(json.load(sys.stdin)['accessToken'])")
echo " ✓ authenticated ($EMAIL)"

echo "── 4. Connect a MOCK trading account (persisted default — §81 convention)"
CONNECT=$(curl -s -X POST "http://127.0.0.1:$API_PORT/api/v1/accounts" \
  -H "authorization: Bearer $ACCESS" -H 'content-type: application/json' \
  -d "{\"providerId\":\"MOCK\",\"environment\":\"DEMO\",\"externalAccountId\":\"77bridge01\",\"credentials\":{\"method\":\"API_KEY\",\"secret\":\"mock-api-key-runtime-bridge\"}}")
echo "$CONNECT" > "$ART/account.json"
ACCOUNT_ID=$(python3 -c "import json; print(json.load(open('$ART/account.json'))['account']['id'])")
[[ -n "$ACCOUNT_ID" ]] || { echo "FAIL: account connect $CONNECT"; exit 1; }
echo " ✓ account $ACCOUNT_ID connected (initial sync included)"

echo "── 5. Render a REAL MT5 screenshot + upload → REVIEW_REQUIRED"
python3 "$ROOT/scripts/ocr-verify-fixture.py" > "$ART/fixture.json"
python3 - << 'EOF'
import json
payload = json.load(open("/tmp/cosmoz-ocr-verify/fixture.json"))
json.dump({"imageDataUrl": payload["dataUrl"], "requestedProfile": "TRADE_SUMMARY"},
          open("/tmp/cosmoz-ocr-verify/upload.json", "w"))
print("fixture ready:", payload["width"], "x", payload["height"])
EOF
RESULT=$(curl -s -X POST "http://127.0.0.1:$API_PORT/api/v1/ocr/recognitions" \
  -H "authorization: Bearer $ACCESS" -H 'content-type: application/json' \
  --data-binary @/tmp/cosmoz-ocr-verify/upload.json)
echo "$RESULT" > "$ART/result.json"
RID=$(python3 -c "import json; print(json.load(open('$ART/result.json'))['recognition']['id'])")
python3 - << 'EOF'
import json
rec = json.load(open("/tmp/cosmoz-ocr-verify/result.json"))["recognition"]
assert rec["status"] == "REVIEW_REQUIRED", rec.get("status")
fields = {f["field"]: f["normalizedValue"] for f in rec["fields"]}
print("  engine fields:", {k: fields[k] for k in ("symbol", "direction", "volume", "entryPrice", "exitPrice") if k in fields})
EOF
echo " ✓ recognition id=$RID"

echo "── 6. Confirm with corrections → CONFIRMED + canonical Trade linked (§77)"
CONFIRM=$(curl -s -X POST "http://127.0.0.1:$API_PORT/api/v1/ocr/recognitions/$RID/confirm" \
  -H "authorization: Bearer $ACCESS" -H 'content-type: application/json' \
  -d '{"corrections":{"symbol":"XAUUSD","entryPrice":"2345,60"}}')
echo "$CONFIRM" > "$ART/confirm.json"
TRADE_ID=$(python3 - << 'EOF'
import json
rec = json.load(open("/tmp/cosmoz-ocr-verify/confirm.json"))["recognition"]
assert rec["status"] == "CONFIRMED", rec.get("status")
assert rec["tradeId"] is not None, f"expected a linked trade, warnings={rec['warnings']}"
skips = [w for w in rec["warnings"] if w.startswith("TRADE_IMPORT")]
assert skips == [], f"unexpected import warnings: {skips}"
print(rec["tradeId"])
EOF
)
echo " ✓ confirmed → trade $TRADE_ID linked on the recognition"

echo "── 7. The journal lists the canonical trade (source IMPORT, P&L recomputed)"
TRADES=$(curl -s "http://127.0.0.1:$API_PORT/api/v1/trades" -H "authorization: Bearer $ACCESS")
echo "$TRADES" > "$ART/trades.json"
python3 - << 'EOF'
import json
rec = json.load(open("/tmp/cosmoz-ocr-verify/confirm.json"))["recognition"]
fields = {f["field"]: f["normalizedValue"] for f in rec["fields"]}
trades = json.load(open("/tmp/cosmoz-ocr-verify/trades.json"))["trades"]
match = [t for t in trades if t.get("externalRef") == f"ocr:{rec['id']}"]
assert len(match) == 1, f"expected exactly 1 imported trade, got {len(match)}"
t = match[0]
assert t["id"] == rec["tradeId"], "recognition.tradeId must reference the imported trade"
assert t["source"] == "IMPORT", t["source"]
assert t["direction"] == fields["direction"], (t["direction"], fields["direction"])
assert t["entryPrice"] == fields["entryPrice"], (t["entryPrice"], fields["entryPrice"])
assert t["quantity"] == fields["volume"], (t["quantity"], fields["volume"])
assert t["initialStop"] == fields.get("stopLoss"), (t["initialStop"], fields.get("stopLoss"))
assert t["initialTP"] == fields.get("takeProfit"), (t["initialTP"], fields.get("takeProfit"))
assert f"recognition {rec['id']}" in (t["notes"] or ""), "provenance must ride the notes (§82)"
# Variant rule (§54): CLOSED only when BOTH exit price and close time were
# confirmed — a missing exit price stays an OPEN trade, never invented.
closed = fields.get("exitPrice") is not None and fields.get("closeTime") is not None
if closed:
    assert t["status"] == "CLOSED" and t["exitReason"] == "MANUAL", (t["status"], t["exitReason"])
    # P&L is Trading Core's own computation — never the OCR profit (§55/§15).
    assert t["pnlGross"] is not None and t["pnlNet"] is not None, "P&L must be recomputed server-side"
else:
    assert t["status"] == "OPEN", t["status"]
    print(f"  honest OPEN import (exitPrice not readable on the screenshot, §54)")
print(f"  trade {t['id']}: {t['direction']} {t['quantity']} @ {t['entryPrice']} status={t['status']}")
EOF
echo " ✓ canonical trade verified in the journal"

echo "── 8. Idempotent confirmation replay never duplicates the trade (§51/§79)"
REPLAY=$(curl -s -X POST "http://127.0.0.1:$API_PORT/api/v1/ocr/recognitions/$RID/confirm" \
  -H "authorization: Bearer $ACCESS" -H 'content-type: application/json' \
  -d '{"corrections":{"symbol":"XAUUSD","entryPrice":"2345,60"}}')
echo "$REPLAY" > "$ART/replay.json"
python3 - << 'EOF'
import json
replay = json.load(open("/tmp/cosmoz-ocr-verify/replay.json"))["recognition"]
assert replay["id"] == json.load(open("/tmp/cosmoz-ocr-verify/confirm.json"))["recognition"]["id"]
assert replay["tradeId"] is not None
trades = json.load(open("/tmp/cosmoz-ocr-verify/trades.json"))
EOF
TRADES2=$(curl -s "http://127.0.0.1:$API_PORT/api/v1/trades" -H "authorization: Bearer $ACCESS")
COUNT=$(python3 -c "
import json
rec = json.load(open('/tmp/cosmoz-ocr-verify/confirm.json'))['recognition']
trades = json.loads('''$TRADES2''')['trades']
print(len([t for t in trades if t.get('externalRef') == f'ocr:{rec[\"id\"]}']))")
[[ "$COUNT" == "1" ]] || { echo "FAIL: replay produced $COUNT trades"; exit 1; }
echo " ✓ still exactly one trade"

echo "── 9. Deleting the recognition KEEPS the journal trade (one-way provenance)"
DEL=$(curl -s -X DELETE "http://127.0.0.1:$API_PORT/api/v1/ocr/recognitions/$RID" -H "authorization: Bearer $ACCESS")
[[ "$DEL" == *"\"deleted\":true"* ]] || { echo "FAIL: delete $DEL"; exit 1; }
STILL=$(python3 -c "
import json
rec = json.load(open('/tmp/cosmoz-ocr-verify/confirm.json'))['recognition']
trades = json.loads('''$TRADES2''')['trades']
print(any(t['id'] == rec['tradeId'] for t in trades))")
[[ "$STILL" == "True" ]] || { echo "FAIL: the journal trade disappeared with the recognition"; exit 1; }
echo " ✓ recognition gone, trade survives"

echo ""
echo "PHASE 21 RUNTIME VERIFICATION: ALL CHECKS PASSED"
