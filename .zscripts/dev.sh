#!/bin/bash
# COSMOZ — platform boot hook (executed by /start.sh via `sudo -u z bash`).
#
# VERSIONED IN GIT on purpose: the sandbox restores /home/z/my-project from
# the git-based archive at every boot, so only tracked files survive. This
# hook is what makes the preview (and the specialized services) come back
# after a cold start.
#
# The sandbox's default flow (bun install + bun run dev at the repo root)
# targets a single-package Next.js app; COSMOZ is a pnpm monorepo, so this
# hook defines the correct boot sequence instead:
#
#   1. workspace dependencies (pnpm — skipped when node_modules exist)
#   2. market-service  (bun, :3003 — live prices for Session Live)
#   3. web             (:3000 — the product preview the gateway proxies)
#
# The web tier serves the PRODUCTION build (next build + next start): the
# dev server's cross-origin guards on dev resources (/_next/hmr, fonts)
# blank the page behind the sandbox gateway, while the production server
# serves the exact verified artifact. The preview runs the product through
# the MSW mock contract — mock auth and the real NestJS auth are two
# parallel session systems (worklog Task 24), so the API (:4000) is NOT
# booted here; the backend is verified by its own suite (388 tests +
# scripts/finalize-clean-db-and-runtime.mjs runtime smoke).
#
# Boot budget note: start.sh health-checks its OWN services (Caddy, ZAI)
# with a hard deadline — this hook runs in the background and must never
# block boot. Logs: /tmp/cosmoz-*.log.

set -u
ROOT=/home/z/my-project
NODE=/usr/bin/node
BUN=/usr/local/bin/bun
# pnpm is NOT persisted across restores — corepack (system node) serves
# the version pinned by package.json "packageManager" (pnpm@12.4.2).
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
PNPM="/usr/bin/corepack pnpm"
run_pnpm() { "$NODE" /usr/bin/corepack pnpm "$@"; }
cd "$ROOT"

log() { echo "[dev.sh $(date '+%F %T')] $*"; }

# ── 0. dependencies ─────────────────────────────────────────────────────────
if [ ! -d "$ROOT/apps/web/node_modules" ] || [ ! -d "$ROOT/apps/api/node_modules" ]; then
  log "installing workspace dependencies (pnpm, fresh archive)"
  run_pnpm install >> /tmp/cosmoz-install.log 2>&1 \
    || run_pnpm install --no-frozen-lockfile >> /tmp/cosmoz-install.log 2>&1
  (cd apps/api && run_pnpm prisma generate >> /tmp/cosmoz-install.log 2>&1) || true
  log "dependencies installed (see /tmp/cosmoz-install.log)"
fi

# ── 1. market-service (:3003) ───────────────────────────────────────────────
if ! curl -sf --max-time 2 http://127.0.0.1:3003/health > /dev/null 2>&1; then
  # Fresh archives ship WITHOUT mini-service node_modules (the pnpm install
  # above only covers the workspace) — bun start dies on missing socket.io
  # (incident 2026-10-08: silent boot failure left the chart in its error
  # card for the whole session). bun install is idempotent and fast when
  # node_modules already exists.
  log "installing market-service dependencies"
  (cd "$ROOT/mini-services/market-service" && "$BUN" install >> /tmp/cosmoz-market.log 2>&1)
  log "starting market-service on :3003"
  (cd "$ROOT/mini-services/market-service" && exec "$BUN" --hot index.ts) \
    > /tmp/cosmoz-market.log 2>&1 &
else
  log "market-service already up on :3003"
fi

# ── 2. web (:3000) — the preview the gateway proxies ────────────────────────
# Build once when the artifact is absent (fresh archive), then serve with
# next start. NEXT_PUBLIC_API_MOCKED=true must be set at BUILD time — the
# flag is inlined into the client bundle.
if [ ! -f "$ROOT/apps/web/.next/BUILD_ID" ]; then
  log "building web (production, mocked product contract) — see /tmp/cosmoz-web-build.log"
  (cd "$ROOT/apps/web" && NEXT_PUBLIC_API_MOCKED=true run_pnpm build) \
    > /tmp/cosmoz-web-build.log 2>&1
fi
if [ -f "$ROOT/apps/web/.next/BUILD_ID" ]; then
  log "starting web on :3000 (next start, production build)"
  (cd "$ROOT/apps/web" && exec "$NODE" ./node_modules/next/dist/bin/next start) \
    > /tmp/cosmoz-web.log 2>&1 &
else
  # Fallback: never leave the gateway without an upstream.
  log "WARN: production build unavailable — falling back to next dev"
  (cd "$ROOT/apps/web" && NEXT_PUBLIC_API_MOCKED=true exec "$NODE" ./node_modules/next/dist/bin/next dev) \
    > /tmp/cosmoz-web.log 2>&1 &
fi

log "boot sequence issued (logs: /tmp/cosmoz-web.log, /tmp/cosmoz-market.log)"
