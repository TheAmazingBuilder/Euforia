#!/bin/sh
# rebuild-env-2026-10-14.sh - restore the embedded PostgreSQL cluster and
# apps/api/.env after the sandbox restart wiped .localpg/ and the .env files
# (same recovery as worklog "recover-2026-10-13b", re-applied 2026-10-14).
#
# Fresh cluster => empty DBs => `db push` + `migrate resolve --applied`
# baseline (plain `migrate deploy` fails on the historical migration drift:
# duplicate post-dated ocr_v2/ocr_v3 folders). Non-destructive: there is no
# pre-existing data anywhere (the cluster is brand new).
set -eu
cd /home/z/my-project/apps/api

DEV_URL='postgresql://cosmoz@127.0.0.1:5433/cosmoz'
TEST_URL='postgresql://cosmoz@127.0.0.1:5433/cosmoz_test'
PRISMA=./node_modules/.bin/prisma

echo "== 1. apps/api/.env (fresh keys - values are NOT printed) =="
if [ -f .env ]; then
  echo ".env already exists - keeping it"
else
  JWT=$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")
  MFA=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
  ACC=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
  WHK=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
  cat > .env <<EOF
# Rebuilt 2026-10-14 after sandbox restart (fresh coherent key set - the
# previous vault keys were lost with the previous .localpg cluster).
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://cosmoz@127.0.0.1:5433/cosmoz
CORS_ORIGINS=http://localhost:3000
LOG_LEVEL=debug
BODY_LIMIT_BYTES=9437184
TRUST_PROXY=false
RATE_LIMIT_WINDOW_SECONDS=60
RATE_LIMIT_MAX=120
AUTH_JWT_SECRET=$JWT
AUTH_ACCESS_TTL_SECONDS=900
AUTH_REFRESH_REMEMBER_DAYS=30
AUTH_REFRESH_SESSION_HOURS=12
AUTH_EMAIL_VERIFICATION_HOURS=24
AUTH_PASSWORD_RESET_MINUTES=30
AUTH_MFA_CHALLENGE_MINUTES=5
AUTH_REAUTH_MINUTES=5
AUTH_MFA_ENCRYPTION_KEY=$MFA
WEB_APP_URL=http://localhost:3000
EMAIL_FROM=Cosmoz <no-reply@cosmoz.app>
INTEGRATIONS_WEBHOOK_ENCRYPTION_KEY=$WHK
ACCOUNTS_CREDENTIALS_ENCRYPTION_KEY=$ACC
ACCOUNTS_PROVIDER_TIMEOUT_MS=10000
TRADES_SCREENSHOTS_ROOT=.data/trades-screenshots
TRADES_SCREENSHOT_MAX_BYTES=6291456
EOF
  echo ".env written (keys regenerated, chmod 600)"
  chmod 600 .env
fi

echo "== 2. embedded PostgreSQL up =="
node scripts/dev-db.mjs up

echo "== 3. prisma db push on cosmoz + cosmoz_test =="
DATABASE_URL="$DEV_URL" $PRISMA db push --skip-generate
DATABASE_URL="$TEST_URL" $PRISMA db push --skip-generate

echo "== 4. migrate resolve --applied baseline (38 migrations x 2 DBs) =="
for d in prisma/migrations/*/; do
  name=$(basename "$d")
  DATABASE_URL="$DEV_URL" $PRISMA migrate resolve --applied "$name" >/dev/null
  DATABASE_URL="$TEST_URL" $PRISMA migrate resolve --applied "$name" >/dev/null
  echo "resolved: $name"
done

echo "== 5. partial unique index (Prisma cannot express it - hand-written) =="
SQL_INDEX="CREATE UNIQUE INDEX IF NOT EXISTS \"TradingSyncRun_accountId_running_key\" ON \"TradingSyncRun\"(\"accountId\") WHERE status = 'RUNNING';"
printf '%s' "$SQL_INDEX" | DATABASE_URL="$DEV_URL" $PRISMA db execute --url "$DEV_URL" --stdin
printf '%s' "$SQL_INDEX" | DATABASE_URL="$TEST_URL" $PRISMA db execute --url "$TEST_URL" --stdin
echo "partial index applied on both databases"

echo "== 6. migrate status (both) =="
DATABASE_URL="$DEV_URL" $PRISMA migrate status
DATABASE_URL="$TEST_URL" $PRISMA migrate status

echo "== DONE =="
