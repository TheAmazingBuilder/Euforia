#!/usr/bin/env bash
# Phase 15 - runtime smoke verification of the Settings bounded context.
# Boots the real API (dev DB), then exercises: auth gates, doc read, domain
# PATCH with write-through, reset, default-account ownership, mass-assignment
# stripping. Exits non-zero on any failed expectation.
set -euo pipefail

cd /home/z/my-project/apps/api
export DATABASE_URL="postgresql://cosmoz@127.0.0.1:5433/cosmoz"
export NODE_ENV=development

LOG=/tmp/cosmoz-phase15-api.log
BASE=http://127.0.0.1:4000/api/v1
HEALTH=http://127.0.0.1:4000/health

# ── boot ─────────────────────────────────────────────────────────────────────
pnpm build > /dev/null 2>&1
node --enable-source-maps dist/apps/api/src/main.js > "$LOG" 2>&1 &
API_PID=$!
trap 'kill "$API_PID" 2>/dev/null || true' EXIT

for i in $(seq 1 60); do
  if curl -sf "$HEALTH/live" > /dev/null 2>&1; then break; fi
  sleep 1
done
curl -sf "$HEALTH/live" > /dev/null || { echo "FAIL: API did not boot"; tail -30 "$LOG"; exit 1; }
echo "[boot] API live"

EMAIL="phase15-smoke-$(date +%s)@test.cosmoz.dev"

# ── 1. auth gate ─────────────────────────────────────────────────────────────
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/me/preferences")
[ "$CODE" = "401" ] || { echo "FAIL: unauthenticated GET /me/preferences = $CODE (expected 401)"; exit 1; }
echo "[auth] unauthenticated GET /me/preferences → 401 OK"

# ── 2. register + verify + login ─────────────────────────────────────────────
curl -sf -X POST "$BASE/auth/register" -H 'content-type: application/json' \
  -d "{\"name\":\"Phase 15 Smoke\",\"email\":\"$EMAIL\",\"password\":\"correct-horse-battery\"}" > /dev/null
# pino-pretty flushes from an async worker - give it a beat before grepping.
sleep 3
TOKEN=$(grep -o 'token=[A-Za-z0-9_-]*' "$LOG" | tail -1 | cut -d= -f2)
[ -n "$TOKEN" ] || { echo "FAIL: no verification token in mail log"; exit 1; }
curl -sf -X POST "$BASE/auth/email/verify" -H 'content-type: application/json' -d "{\"token\":\"$TOKEN\"}" > /dev/null
ACCESS=$(curl -sf -X POST "$BASE/auth/login" -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"correct-horse-battery\",\"remember\":false}" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['accessToken'])")
AUTH="Authorization: Bearer $ACCESS"
echo "[auth] register+verify+login OK"

# ── 3. GET doc ───────────────────────────────────────────────────────────────
GET=$(curl -sf "$BASE/me/preferences" -H "$AUTH")
echo "$GET" | python3 -c "
import json, sys
doc = json.load(sys.stdin)
domains = ['trading','risk','journal','notifications','appearance','dashboard','academy','privacy','localization']
missing = [d for d in domains if d not in doc]
assert not missing, f'missing domains: {missing}'
assert doc['trading']['displayCurrency'] == 'USD', 'default displayCurrency'
assert doc['privacy']['profileVisibility'] == 'PRIVATE', 'default visibility'
print('[read] full doc with defaults OK')"
ME_TZ=$(curl -sf "$BASE/me" -H "$AUTH" | python3 -c "import json,sys; print(json.load(sys.stdin)['timezone'])")
echo "$GET" | python3 -c "
import json, sys
doc = json.load(sys.stdin)
assert doc['localization']['timezone'] == '$ME_TZ', f\"mirror mismatch: {doc['localization']['timezone']} != profile $ME_TZ\"
print('[read] provisioned doc mirrors profile timezone ($ME_TZ) OK')"

# ── 4. PATCH localization → write-through ────────────────────────────────────
curl -sf -X PATCH "$BASE/me/preferences/localization" -H "$AUTH" -H 'content-type: application/json' \
  -d "{\"language\":\"fr\",\"timezone\":\"Europe/Paris\",\"dateFormat\":\"ISO\",\"timeFormat\":\"H24\",\"decimalSeparator\":\"LOCALE\",\"numberFormat\":\"LOCALE\",\"currencyDisplay\":\"CODE\",\"weekStart\":\"MONDAY\"}" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['localization']['timezone']=='Europe/Paris', 'patch response'"
NEW_TZ=$(curl -sf "$BASE/me" -H "$AUTH" | python3 -c "import json,sys; print(json.load(sys.stdin)['timezone'])")
[ "$NEW_TZ" = "Europe/Paris" ] || { echo "FAIL: write-through timezone = $NEW_TZ"; exit 1; }
echo "[patch] localization write-through → Profile.timezone = Europe/Paris OK"

# ── 5. mass-assignment stripping ─────────────────────────────────────────────
curl -sf -X PATCH "$BASE/me/preferences/appearance" -H "$AUTH" -H 'content-type: application/json' \
  -d '{"theme":"DARK","density":"COMPACT","defaultDashboardLayout":"COACH_FIRST","pnlDisplay":"CURRENCY","role":"ADMIN","isAdmin":true}' \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
assert d['appearance']['theme'] == 'DARK'
assert 'role' not in d and 'isAdmin' not in d, 'privileged field leaked!'
print('[security] privileged fields stripped OK')"

# ── 6. default account ownership (§21) ───────────────────────────────────────
CODE=$(curl -s -o /tmp/p15-body.json -w "%{http_code}" -X PATCH "$BASE/me/preferences/trading" -H "$AUTH" -H 'content-type: application/json' \
  -d '{"defaultAccountId":"00000000-0000-4000-8000-000000000000","defaultAssetClass":null,"defaultInstrumentId":null,"defaultTimeframe":"M15","defaultSession":"LONDON","displayCurrency":"USD","defaultDirection":null,"defaultPositionType":"MARKET","rrDisplay":"RATIO","chart":{"style":"CANDLES","showVolume":false,"showGrid":true},"sessionMaxDurationMin":null,"softLockAfterViolations":null}')
[ "$CODE" = "404" ] || { echo "FAIL: foreign default account → $CODE"; exit 1; }
grep -q "DEFAULT_ACCOUNT_NOT_FOUND" /tmp/p15-body.json || { echo "FAIL: missing error code"; cat /tmp/p15-body.json; exit 1; }
echo "[security] foreign defaultAccountId → 404 DEFAULT_ACCOUNT_NOT_FOUND OK"

# ── 7. reset localization → default write-through (mock parity) ──────────────
curl -sf -X POST "$BASE/me/preferences/reset" -H "$AUTH" -H 'content-type: application/json' \
  -d '{"domain":"localization"}' > /dev/null
TZ_AFTER=$(curl -sf "$BASE/me" -H "$AUTH" | python3 -c "import json,sys; print(json.load(sys.stdin)['timezone'])")
[ "$TZ_AFTER" = "America/Toronto" ] || { echo "FAIL: reset write-through = $TZ_AFTER"; exit 1; }
echo "[reset] localization reset → Profile.timezone = America/Toronto (mock parity) OK"

echo ""
echo "ALL PHASE 15 RUNTIME SMOKE CHECKS PASSED"
