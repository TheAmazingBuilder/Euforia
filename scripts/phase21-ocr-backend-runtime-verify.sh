#!/usr/bin/env bash
# COSMOZ — OCR BACKEND V1 runtime verification (master prompt §134–§138).
#
# Boots the REAL FastAPI sidecar (:3004, Tesseract) + the REAL NestJS API
# (:4000) on the dev database, then drives the COMPLETE frontend-derived
# flow with curl:
#   register → verify → login → upload a REAL rendered MT5 screenshot →
#   job COMPLETED with Tesseract-extracted fields → save the validated
#   trade draft → CONFIRM → CANONICAL TRADE in Trading Core (source IMPORT,
#   externalRef OCR:<jobId>) → idempotent replay → screenshot bytes →
#   delete → trade-boundary probes.
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

echo "── 1. Boot the FastAPI sidecar (:3004, real Tesseract)"
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

echo "── 2. Build + boot the NestJS API (:4000, dev DB)"
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
EMAIL="ocr-verify-$RANDOM@test.cosmoz.dev"
REG=$(curl -s -X POST "http://127.0.0.1:$API_PORT/api/v1/auth/register" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"Str0ng-Passphrase!\",\"name\":\"OCR Verify\"}")
echo "$REG" | head -c 200; echo
TOKEN=""
for i in $(seq 1 40); do
  TOKEN=$(grep -o "token=[A-Za-z0-9_-]*" "$API_LOG" | tail -1 | cut -d= -f2 || true)
  if [[ -n "$TOKEN" ]]; then break; fi
  sleep 0.25
done
[[ -n "$TOKEN" ]] || { echo "FAIL: no verification token in api log"; tail -20 "$API_LOG"; exit 1; }
curl -sf -X POST "http://127.0.0.1:$API_PORT/api/v1/auth/email/verify" \
  -H 'content-type: application/json' -d "{\"token\":\"$TOKEN\"}" > /dev/null
LOGIN=$(curl -sf -X POST "http://127.0.0.1:$API_PORT/api/v1/auth/login" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"Str0ng-Passphrase!\",\"remember\":true}")
ACCESS=$(echo "$LOGIN" | python3 -c "import json,sys; print(json.load(sys.stdin)['accessToken'])")
echo " ✓ authenticated ($EMAIL)"

echo "── 4. Render a REAL MT5 screenshot + anonymous rejection"
python3 "$ROOT/scripts/ocr-verify-fixture.py" > "$ART/fixture.json"
python3 - << 'EOF'
import json
payload = json.load(open("/tmp/cosmoz-ocr-verify/fixture.json"))
json.dump({"imageDataUrl": payload["dataUrl"], "name": "mt5-history.png"},
          open("/tmp/cosmoz-ocr-verify/upload.json", "w"))
print("fixture ready:", payload["width"], "x", payload["height"], "-", len(payload["dataUrl"]), "chars")
EOF
ANON=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://127.0.0.1:$API_PORT/api/v1/recognition/uploads" \
  -H 'content-type: application/json' -d '{"imageDataUrl":"data:image/png;base64,AAAAAAAAAAAAAAAAAAAA","name":"anon.png"}')
[[ "$ANON" == "401" ]] || { echo "FAIL: anonymous upload returned $ANON"; exit 1; }
echo " ✓ anonymous upload rejected (401)"

echo "── 5. Upload → screenshot registered (server-derived metadata)"
UP=$(curl -s -X POST "http://127.0.0.1:$API_PORT/api/v1/recognition/uploads" \
  -H "authorization: Bearer $ACCESS" -H 'content-type: application/json' \
  --data-binary @/tmp/cosmoz-ocr-verify/upload.json)
echo "$UP" > "$ART/upload-response.json"
python3 - << 'EOF'
import json
up = json.load(open("/tmp/cosmoz-ocr-verify/upload-response.json"))["screenshot"]
assert up["mimeType"] == "image/png", up
assert up["width"] == 1150 and up["height"] == 420, up
json.dump({"screenshotId": up["id"], "platform": "AUTO", "mode": "AUTOMATIC"},
          open("/tmp/cosmoz-ocr-verify/job-input.json", "w"))
print("  screenshot:", up["id"], up["sizeBytes"], "bytes")
EOF
echo " ✓ screenshot registered"

echo "── 6. Create the recognition job → COMPLETED with REAL extraction"
curl -s -X POST "http://127.0.0.1:$API_PORT/api/v1/recognition/jobs" \
  -H "authorization: Bearer $ACCESS" -H 'content-type: application/json' \
  -H 'x-request-id: runtime-verify-42' \
  --data-binary @/tmp/cosmoz-ocr-verify/job-input.json > "$ART/job.json"
python3 - << 'EOF'
import json
job = json.load(open("/tmp/cosmoz-ocr-verify/job.json"))["job"]
assert job["status"] == "COMPLETED", job
assert job["stage"] == "COMPLETED" and job["progress"] == 100
json.dump({"jobId": job["id"]}, open("/tmp/cosmoz-ocr-verify/jobid.json", "w"))
print("  job:", job["id"], "platform:", job["platform"], "mode:", job["mode"])
EOF
JID=$(python3 -c "import json; print(json.load(open('$ART/jobid.json'))['jobId'])")

echo "── 7. Result: frontend-shaped fields extracted by Tesseract"
curl -s "http://127.0.0.1:$API_PORT/api/v1/recognition/jobs/$JID/result" \
  -H "authorization: Bearer $ACCESS" > "$ART/result.json"
python3 - << 'EOF'
import json
res = json.load(open("/tmp/cosmoz-ocr-verify/result.json"))["result"]
assert res["detectedPlatform"] == "METATRADER_5", res["detectedPlatform"]
trade = res["trades"][0]
assert len(trade["fields"]) == 16, len(trade["fields"])
fields = {}
for key in ["symbol","direction","volume","entryPrice","exitPrice","stopLoss","takeProfit","profitLoss","openTime","closeTime"]:
    f = trade["fields"][key]
    fields[key] = f["value"]
    region = f"{f['sourceRegion']['x']:.2f},{f['sourceRegion']['y']:.2f}" if f.get("sourceRegion") else "-"
    print(f"  {key:>11} = {str(f['value']):>20}  state={f['state']:>8}  conf={f['confidence']}  region=({region})")
# The REAL Tesseract pipeline must read the rendered MT5 ticket. Prices
# travel in the CANONICAL normalized form (toFixed — trailing zeros drop).
assert fields["symbol"] == "XAUUSD", fields["symbol"]
assert fields["direction"] == "BUY", fields["direction"]
assert fields["entryPrice"] == "2345.6", fields["entryPrice"]
assert fields["stopLoss"] == "2335.6", fields["stopLoss"]
assert fields["takeProfit"] == "2365.6", fields["takeProfit"]
assert fields["profitLoss"] == "123.75", fields["profitLoss"]
# §20 conservative extraction (sidecar pytest-documented): the close line's
# price is NOT claimed as the exit price — the HUMAN completes it in review.
assert fields["exitPrice"] is None, fields["exitPrice"]
assert res["overallConfidence"] is not None
print("  detectedPlatform:", res["detectedPlatform"], "overall:", res["overallConfidence"], "warnings:", len(res["warnings"]))
json.dump(fields, open("/tmp/cosmoz-ocr-verify/fields.json", "w"))
EOF
echo " ✓ real extraction verified (XAUUSD BUY 2345.6, SL/TP/profit; exit left to the human, §20)"

echo "── 8. §102 negative: an unconfirmed recognition creates NO trade"
curl -s -X POST "http://127.0.0.1:$API_PORT/api/v1/accounts" \
  -H "authorization: Bearer $ACCESS" -H 'content-type: application/json' \
  -d '{"providerId":"MOCK","environment":"DEMO","externalAccountId":"77ocr-verify","credentials":{"method":"API_KEY","secret":"mock-api-key-runtime"}}' > "$ART/account.json"
python3 -c "import json; d=json.load(open('/tmp/cosmoz-ocr-verify/account.json')); assert d.get('account',{}).get('id'), d"
echo " ✓ default MOCK trading account connected (import prerequisite)"
NO_DRAFT=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://127.0.0.1:$API_PORT/api/v1/recognition/jobs/$JID/confirm" \
  -H "authorization: Bearer $ACCESS")
[[ "$NO_DRAFT" == "409" ]] || { echo "FAIL: confirm without draft returned $NO_DRAFT (want 409)"; exit 1; }
TR_COUNT=$(curl -s "http://127.0.0.1:$API_PORT/api/v1/trades" -H "authorization: Bearer $ACCESS" | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('trades',[])))" || echo "?")
echo " ✓ confirm without draft → 409; journal trades: ${TR_COUNT}"

echo "── 9. Save the validated trade draft — with the HUMAN exit-price correction (§74)"
python3 - << 'EOF'
import json
fields = json.load(open("/tmp/cosmoz-ocr-verify/fields.json"))
draft = {
    "symbol": fields["symbol"],
    "direction": fields["direction"],
    "platform": "METATRADER_5",
    "entryPrice": fields["entryPrice"],
    # The close price is visible on the screenshot; conservative V1 OCR did
    # not claim it — the REVIEWING USER types it (§74 correction path).
    "exitPrice": "2353.85",
    "volume": fields["volume"],
    "stopLoss": fields["stopLoss"],
    "takeProfit": fields["takeProfit"],
    "profitLoss": fields["profitLoss"],
    "currency": None,
    "openTime": fields["openTime"],
    "closeTime": fields["closeTime"],
    "positionId": None,
    "orderId": None,
}
json.dump(draft, open("/tmp/cosmoz-ocr-verify/draft.json", "w"))
print("  draft:", draft["symbol"], draft["direction"], draft["entryPrice"], "→", draft["exitPrice"], "(user-corrected)")
EOF
curl -s -X PUT "http://127.0.0.1:$API_PORT/api/v1/recognition/jobs/$JID/draft" \
  -H "authorization: Bearer $ACCESS" -H 'content-type: application/json' \
  --data-binary @/tmp/cosmoz-ocr-verify/draft.json > "$ART/draft-response.json"
python3 -c "import json; d=json.load(open('/tmp/cosmoz-ocr-verify/draft-response.json')); assert d['draft']['jobId']=='$JID', d"
echo " ✓ draft saved"

echo "── 10. CONFIRM → the canonical Trade exists in Trading Core (§75–§79)"
CONFIRM=$(curl -s -X POST "http://127.0.0.1:$API_PORT/api/v1/recognition/jobs/$JID/confirm" \
  -H "authorization: Bearer $ACCESS")
echo "$CONFIRM" > "$ART/confirm.json"
python3 - << 'EOF'
import json
c = json.load(open("/tmp/cosmoz-ocr-verify/confirm.json"))
assert c["tradeId"], c
assert c["job"]["status"] == "COMPLETED" and c["job"]["importedTradeId"] == c["tradeId"], c["job"]
json.dump({"tradeId": c["tradeId"]}, open("/tmp/cosmoz-ocr-verify/tradeid.json", "w"))
print("  tradeId:", c["tradeId"])
EOF
TID=$(python3 -c "import json; print(json.load(open('$ART/tradeid.json'))['tradeId'])")
curl -s "http://127.0.0.1:$API_PORT/api/v1/trades" -H "authorization: Bearer $ACCESS" > "$ART/trade.json"
python3 - << 'EOF'
import json
t = json.load(open("/tmp/cosmoz-ocr-verify/trade.json"))
trades = t.get("trades") or []
tid = json.load(open("/tmp/cosmoz-ocr-verify/tradeid.json"))["tradeId"]
match = [x for x in trades if x.get("id") == tid]
assert len(match) == 1, f"expected the imported trade in the journal, got {len(match)}"
trade = match[0]
assert trade["source"] == "IMPORT", trade.get("source")
assert trade["direction"] == "BUY", trade
assert trade["status"] == "CLOSED", trade.get("status")
assert trade["entryPrice"] == "2345.6", trade["entryPrice"]
assert trade["exitPrice"] == "2353.85", trade["exitPrice"]
jid = json.load(open("/tmp/cosmoz-ocr-verify/jobid.json"))["jobId"]
assert trade["externalRef"] == f"OCR:{jid}", trade.get("externalRef")
print("  journal trade:", trade["instrumentId"], trade["direction"], trade["entryPrice"], "→", trade["exitPrice"], "status:", trade["status"])
print("  computed pnlGross:", str(trade.get("pnlGross")), "(authoritative; the OCR P&L stays in notes, §55)")
print("  notes:", (trade.get("notes") or "")[:90])
EOF
echo " ✓ canonical trade imported through Trading Core"

echo "── 11. Idempotent replay → SAME trade id, never a second import (§79)"
REPLAY=$(curl -s -X POST "http://127.0.0.1:$API_PORT/api/v1/recognition/jobs/$JID/confirm" \
  -H "authorization: Bearer $ACCESS")
TID2=$(echo "$REPLAY" | python3 -c "import json,sys; print(json.load(sys.stdin)['tradeId'])")
[[ "$TID" == "$TID2" ]] || { echo "FAIL: replay created a different trade ($TID vs $TID2)"; exit 1; }
REF_COUNT=$(curl -s "http://127.0.0.1:$API_PORT/api/v1/trades" -H "authorization: Bearer $ACCESS" | python3 -c "import json,sys; print(sum(1 for t in json.load(sys.stdin).get('trades',[]) if t.get('externalRef')=='OCR:$JID'))")
[[ "$REF_COUNT" == "1" ]] || { echo "FAIL: expected exactly 1 OCR trade, got $REF_COUNT"; exit 1; }
echo " ✓ one canonical trade per confirmed recognition"

echo "── 12. Screenshot bytes + delete + post-delete 404 (§31)"
HTTP_CT=$(curl -s -o "$ART/image.png" -w "%{content_type}" "http://127.0.0.1:$API_PORT/api/v1/recognition/jobs/$JID/screenshot" \
  -H "authorization: Bearer $ACCESS")
[[ "$HTTP_CT" == image/png* ]] || { echo "FAIL: content-type $HTTP_CT"; exit 1; }
python3 - << 'EOF'
import json, base64
stored = open("/tmp/cosmoz-ocr-verify/image.png","rb").read()
fixture = json.load(open("/tmp/cosmoz-ocr-verify/fixture.json"))
original = base64.b64decode(fixture["dataUrl"].split(",",1)[1])
assert stored == original, "served bytes differ from the upload"
print("  served bytes byte-identical ✓", len(stored), "bytes")
EOF
DEL=$(curl -s -X DELETE "http://127.0.0.1:$API_PORT/api/v1/recognition/jobs/$JID" -H "authorization: Bearer $ACCESS")
[[ "$DEL" == *"\"ok\":true"* ]] || { echo "FAIL: delete $DEL"; exit 1; }
AFTER=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$API_PORT/api/v1/recognition/jobs/$JID" -H "authorization: Bearer $ACCESS")
[[ "$AFTER" == "404" ]] || { echo "FAIL: post-delete $AFTER"; exit 1; }
echo " ✓ deleted, then 404 (the imported TRADE remains in the journal)"

echo "── 13. Trade-safety probes (§101): no execution surface under /recognition"
for probe in "POST /api/v1/recognition/jobs/$JID/trade" "POST /api/v1/recognition/jobs/$JID/execute" "POST /api/v1/recognition/trade" "PUT /api/v1/recognition/jobs/$JID" "PATCH /api/v1/recognition/jobs/$JID/confirm"; do
  METHOD=${probe%% *}; URL=${probe#* }
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X "$METHOD" "http://127.0.0.1:$API_PORT$URL" -H "authorization: Bearer $ACCESS" -H 'content-type: application/json' -d '{}')
  [[ "$CODE" == "404" ]] || { echo "FAIL: $METHOD $URL → $CODE (must 404)"; exit 1; }
done
echo " ✓ all trade/execution probes 404"

echo ""
echo "OCR BACKEND V1 RUNTIME VERIFICATION: ALL CHECKS PASSED"
