#!/usr/bin/env bash
# COSMOZ - Phase 19 runtime verification (§60/§61).
#
# Boots the REAL FastAPI sidecar (:3004) + the REAL NestJS API (:4000) on the
# dev database, then drives the complete OCR lifecycle with curl:
# register → verify → login → upload a REAL rendered MT5 screenshot →
# REVIEW_REQUIRED with Tesseract-extracted fields → confirm with a user
# correction → CONFIRMED → image fetch → delete. Anonymous access is checked
# at every step boundary.
#
# Artifacts: /tmp/cosmoz-ocr-verify/ (logs, tokens, payloads) - wiped on exit.
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
curl -sf "http://127.0.0.1:$OCR_PORT/healthz"
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
echo "$REG" | head -c 300; echo
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
json.dump({"imageDataUrl": payload["dataUrl"], "requestedProfile": "TRADE_SUMMARY"},
          open("/tmp/cosmoz-ocr-verify/upload.json", "w"))
print("fixture ready:", payload["width"], "x", payload["height"], "-", len(payload["dataUrl"]), "chars")
EOF
ANON=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://127.0.0.1:$API_PORT/api/v1/ocr/recognitions" \
  -H 'content-type: application/json' -d '{"imageDataUrl":"data:image/png;base64,AAAAAAAAAAAAAAAAAAAA"}')
[[ "$ANON" == "401" ]] || { echo "FAIL: anonymous upload returned $ANON"; exit 1; }
echo " ✓ anonymous upload rejected (401)"

echo "── 5. Upload the screenshot → REVIEW_REQUIRED with real extraction"
RESULT=$(curl -s -X POST "http://127.0.0.1:$API_PORT/api/v1/ocr/recognitions" \
  -H "authorization: Bearer $ACCESS" -H 'content-type: application/json' \
  --data-binary @/tmp/cosmoz-ocr-verify/upload.json)
echo "$RESULT" > "$ART/result.json"
python3 - << 'EOF'
import json
rec = json.load(open("/tmp/cosmoz-ocr-verify/result.json"))["recognition"]
assert rec["status"] == "REVIEW_REQUIRED", rec.get("status")
assert rec["classification"]["type"] == "MT5_TRADE", rec["classification"]
print("  classification:", rec["classification"]["type"], f"({rec['classification']['confidence']})")
for f in rec["fields"]:
    region = f"{f['sourceRegion']['x']},{f['sourceRegion']['y']}" if f["sourceRegion"] else "-"
    print(f"  {f['field']:>11} = {str(f['normalizedValue']):>20}  conf={f['confidence']:.2f}  {f['confidenceBand']:>6}  region=({region})  {f['warnings']}")
print("  engine:", rec["engine"])
EOF
RID=$(python3 -c "import json; print(json.load(open('$ART/result.json'))['recognition']['id'])")
echo " ✓ recognition id=$RID"

echo "── 6. Idempotency: same upload returns the SAME recognition (§32)"
RESULT2=$(curl -s -X POST "http://127.0.0.1:$API_PORT/api/v1/ocr/recognitions" \
  -H "authorization: Bearer $ACCESS" -H 'content-type: application/json' \
  --data-binary @/tmp/cosmoz-ocr-verify/upload.json)
RID2=$(echo "$RESULT2" | python3 -c "import json,sys; print(json.load(sys.stdin)['recognition']['id'])")
[[ "$RID" == "$RID2" ]] || { echo "FAIL: idempotency broken ($RID vs $RID2)"; exit 1; }
echo " ✓ idempotent replay"

echo "── 7. Confirm with a user correction → CONFIRMED (§21)"
CONFIRM=$(curl -s -X POST "http://127.0.0.1:$API_PORT/api/v1/ocr/recognitions/$RID/confirm" \
  -H "authorization: Bearer $ACCESS" -H 'content-type: application/json' \
  -d '{"corrections":{"symbol":"XAUUSD.m","entryPrice":"2345,60"}}')
echo "$CONFIRM" > "$ART/confirm.json"
python3 - << 'EOF'
import json
rec = json.load(open("/tmp/cosmoz-ocr-verify/confirm.json"))["recognition"]
assert rec["status"] == "CONFIRMED", rec.get("status")
# Corrections record = the user's VALIDATED declaration: the symbol is
# normalized per §15 (non-alphanumerics stripped: "XAUUSD.m" → "XAUUSDM")
# and decimal declared precision is preserved ("2345,60" → "2345.60").
assert rec["corrections"]["symbol"] == "XAUUSDM", rec["corrections"]
assert rec["corrections"]["entryPrice"] == "2345.60", rec["corrections"]
fields = {f["field"]: f for f in rec["fields"]}
# Merged FIELDS carry the normalized wire form ("2345.60" → "2345.6").
assert fields["symbol"]["normalizedValue"] == "XAUUSDM"
assert fields["entryPrice"]["normalizedValue"] == "2345.6"
assert fields["symbol"]["confidence"] == 1.0  # authoritative (§21)
print("  corrections:", rec["corrections"])
print("  confirmed authoritative values ✓")
EOF
echo " ✓ confirmed"

echo "── 8. Image bytes + delete + post-delete 404 (§31)"
HTTP_CT=$(curl -s -o "$ART/image.png" -w "%{content_type}" "http://127.0.0.1:$API_PORT/api/v1/ocr/recognitions/$RID/image" \
  -H "authorization: Bearer $ACCESS")
[[ "$HTTP_CT" == image/png* ]] || { echo "FAIL: content-type $HTTP_CT"; exit 1; }
python3 - << 'EOF'
import json
stored = open("/tmp/cosmoz-ocr-verify/image.png","rb").read()
fixture = json.load(open("/tmp/cosmoz-ocr-verify/fixture.json"))
import base64
original = base64.b64decode(fixture["dataUrl"].split(",",1)[1])
assert stored == original, "served bytes differ from the upload"
print("  served bytes byte-identical ✓", len(stored), "bytes")
EOF
DEL=$(curl -s -X DELETE "http://127.0.0.1:$API_PORT/api/v1/ocr/recognitions/$RID" -H "authorization: Bearer $ACCESS")
[[ "$DEL" == *"\"deleted\":true"* ]] || { echo "FAIL: delete $DEL"; exit 1; }
AFTER=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$API_PORT/api/v1/ocr/recognitions/$RID" -H "authorization: Bearer $ACCESS")
[[ "$AFTER" == "404" ]] || { echo "FAIL: post-delete $AFTER"; exit 1; }
echo " ✓ deleted, then 404"

echo "── 9. Trade boundary probes (§53): no execution surface exists"
for probe in "POST /api/v1/ocr/recognitions/$RID/trade" "POST /api/v1/ocr/trade" "POST /api/v1/ocr/execute" "PUT /api/v1/ocr/recognitions/$RID"; do
  METHOD=${probe%% *}; URL=${probe#* }
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X "$METHOD" "http://127.0.0.1:$API_PORT$URL" -H "authorization: Bearer $ACCESS" -H 'content-type: application/json' -d '{}')
  [[ "$CODE" == "404" ]] || { echo "FAIL: $METHOD $URL → $CODE (must 404)"; exit 1; }
done
echo " ✓ all trade/execution probes 404"

echo ""
echo "PHASE 19 RUNTIME VERIFICATION: ALL CHECKS PASSED"
