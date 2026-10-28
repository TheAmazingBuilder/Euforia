# @cosmoz/api — NestJS Backend (Foundation)

The Cosmoz backend: a **NestJS DDD Modular Monolith**. This document reflects
the actual Foundation implementation (Phase 1) and the binding conventions
every future bounded context must follow.

> Architecture source of truth: `docs/backend/PHASE-0-ARCHITECTURE-REPORT.md`
> Persistence design seed: `docs/specs/data-model.md`
> Contract package: `packages/shared` (`@cosmoz/shared`)

---

## Quick start

```bash
# 1. Install (workspace root)
corepack pnpm install

# 2. Make sure YOUR OWN local PostgreSQL server is running (default port 5432)
#    and create the dev database:  createdb cosmoz   (or via pgAdmin)

# 3. Configure
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env: DATABASE_URL, AUTH_JWT_SECRET,
# AUTH_MFA_ENCRYPTION_KEY, ACCOUNTS_CREDENTIALS_ENCRYPTION_KEY,
# INTEGRATIONS_WEBHOOK_ENCRYPTION_KEY must all be valid.
# Generate keys with:
# node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
# node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 4. Start the API in its own terminal (port 4000)
pnpm api:dev

# 5. In a SECOND terminal, start only the web frontend (port 3000)
pnpm web:dev
```

Do not assume the API started just because Next.js is running. Wait for the
`cosmoz-api listening` log and verify `http://localhost:4000/health/ready`.
If the API exits during startup, fix the first `[config]` validation error
or database connection error shown in that terminal before testing auth.

For local-only signup/login without an email provider, set
`AUTH_REQUIRE_EMAIL_VERIFICATION=false` in `apps/api/.env`. This still uses
the real API and PostgreSQL; it disables only the email-verification gate.
When enabled, registration returns an active session and auto-signs the user
in. Do not disable email verification in production.

The API listens on **http://localhost:4000**:

| Endpoint | Purpose |
|---|---|
| `GET /health` | App status (no DB) — monitoring/UI target |
| `GET /health/live` | Liveness probe |
| `GET /health/ready` | Readiness probe (pings the database) |
| `POST /api/v1/auth/*` | register · login · refresh · logout · me · email verify/resend · password forgot/reset · MFA challenge/recover |
| `GET·POST /api/v1/security/*` | overview · reauth · password change · 2FA enable/confirm/disable · email-code MFA enable · recovery codes · sessions revoke · API keys |
| `GET·PATCH /api/v1/me` | profile + preferences doc (9 domains) · deactivate · delete |
| `POST /api/v1/calculators/lot-size` | authoritative position sizing — exact-decimal, broker-aware specs per request; informational only, never an order instruction |
| `POST /api/v1/calculators/compounding` | period-by-period growth projection (full precision, ≤ 1 000 periods); informational only |
| `GET·POST /api/v1/ocr/recognitions` · `…/:id` · `…/:id/image` · `…/:id/confirm` · `DELETE …/:id` | trade-screenshot recognition (Phase 19) — upload → deterministic engine (FastAPI sidecar) → human review → confirmation; NEVER creates a Trade |

## Scripts

| Script | What it does |
|---|---|
| `pnpm api:dev` | Start only the NestJS API on port 4000 (watch mode) |
| `pnpm web:dev` | Start only the Next.js frontend on port 3000 |
| `pnpm dev` | Start all workspace dev services through Turbo |
| `pnpm build` | Compile to `dist/` (tsc) |
| `pnpm start` | Run compiled output |
| `pnpm typecheck` | `tsc --noEmit` (src + test) |
| `pnpm lint` | ESLint (flat config) |
| `pnpm test` | vitest — **unit specs only** (no database required) |
| `pnpm test:e2e` | vitest e2e harness — needs a local PostgreSQL; creates/migrates the dedicated test DB (`cosmoz_test` by default, override with `DATABASE_URL_TEST`) |
| `pnpm prisma:generate` | Regenerate the Prisma client after schema edits |
| `pnpm db:migrate -- --name X` | Create + apply a migration (dev) |
| `pnpm db:deploy` | Apply committed migrations (CI/prod) |

## Environment variables

Validated at startup by `src/config/env.schema.ts` (Zod). **Invalid
configuration aborts the boot with a controlled error listing key paths —
never secret values.**

| Variable | Default (dev) | Notes |
|---|---|---|
| `NODE_ENV` | `development` | `test` \| `development` \| `production` |
| `PORT` | `4000` | |
| `DATABASE_URL` | — (required) | `postgresql://…` |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allowlist; `*` rejected |
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` |
| `BODY_LIMIT_BYTES` | `1048576` | JSON body cap (1 MiB) |
| `TRUST_PROXY` | `false` | `true` only behind a trusted reverse proxy |
| `RATE_LIMIT_WINDOW_SECONDS` | `60` | Global default window |
| `RATE_LIMIT_MAX` | `120` | Global default max requests |
| `MARKET_SERVICE_URL` | — (optional) | Market sidecar; not wired in Foundation |

Authentication and encryption keys are validated at startup. The API will
exit rather than listen if any required key is empty/invalid or PostgreSQL
cannot be reached. Generate local-only secrets; never commit `.env` values.
Transactional email uses Nodemailer over SMTP when `SMTP_USER` and
`SMTP_APP_PASSWORD` are configured. In local development only, the console
transport remains available when credentials are absent; production startup
requires SMTP credentials and never logs one-time codes or action links.

## Database

- PostgreSQL 17 + Prisma 6. Schema: `prisma/schema.prisma`.
- **Foundation has an intentionally EMPTY schema — no business models.** Each
  future phase adds its own models + migration following `data-model.md`.
- Migrations are versioned, reviewable files in `prisma/migrations/` (created
  by `db:migrate`, applied by `db:deploy`). Never reset a non-test database.
- The embedded dev PostgreSQL (`scripts/dev-db.mjs`, port `5433`) has been
  REMOVED from the project. Local development points at a developer-provided
  PostgreSQL server (default port `5432`) via `DATABASE_URL`; tests use the
  dedicated `cosmoz_test` database (`DATABASE_URL_TEST`). Containers remain
  available through `docker-compose.yml` / managed PG.

### Test database safety (binding)

E2E tests refuse to run against anything but the dedicated test database:

1. `test/global-setup.ts` creates the test DB (best-effort) on YOUR local
   PostgreSQL server, applies migrations and exports `DATABASE_URL` for every
   worker. The target is `DATABASE_URL_TEST` (default
   `postgresql://postgres@127.0.0.1:5432/cosmoz_test`). Put your real
   credentials there, e.g.
   `DATABASE_URL_TEST="postgresql://postgres:secret@127.0.0.1:5432/euforia_test"`.
2. `test/setup.ts` re-asserts `NODE_ENV=test` and `DATABASE_URL → /<TEST_DB_NAME>`
   inside each worker (fail-fast, defense in depth).

Unit specs (`test/unit/**`) never touch a database and run with plain
`pnpm test` anywhere. The e2e harness is opt-in (`pnpm test:e2e`) so a missing
or unauthenticated local PG can never block the default test command.

## Error contract (API envelope)

Every failure — from the validation pipe, the error taxonomy, Nest
`HttpException`s, Fastify transport errors or anything unknown — exits through
`AllExceptionsFilter` → `error-mapper.ts`:

```jsonc
{
  "error": "ValidationError",      // stable category token
  "code":  "optional machine code", // e.g. auth error codes (Phase 2+)
  "message": "safe human message",  // hidden for unsanitized 5xx in prod
  "issues": [{ "path": "name", "message": "required" }], // validation only
  "requestId": "…"                  // correlation id (also in x-request-id)
}
```

Status mapping: `ValidationError→400 · Unauthorized→401 · Forbidden→403 ·
NotFound→404 · Conflict→409 · BusinessRule→422 · RateLimited→429 ·
ExternalProvider→502 · Infrastructure/InternalError→5xx`.

**Bounded contexts throw `AppError` subclasses from
`src/shared/errors/app-error.ts` — nothing else.** Unknown errors are
sanitized (no stacks, SQL, secrets in responses; full detail only in logs).

## Architecture conventions (binding for Phase 2+)

```text
apps/api/src/
├── main.ts                    # bootstrap only
├── app.module.ts              # composition root
├── app.setup.ts               # HTTP wiring shared by prod AND tests
├── config/                    # env validation + typed AppConfig
├── shared/                    # cross-context kernel — NO business logic
│   ├── contracts/             # ← the ONLY import surface for @cosmoz/shared
│   ├── errors/                # AppError taxonomy
│   └── http/                  # ZodValidationPipe · AllExceptionsFilter · request-id
├── infrastructure/            # technical capabilities
│   ├── prisma/                # PrismaService (client lifecycle, health ping)
│   ├── logging/               # pino + pino-http, redaction, correlation
│   ├── security/              # rate limiting (named policies)
│   └── health/                # /health, /health/live, /health/ready
└── modules/                   # ← bounded contexts land here (Phase 2+)
    └── <context>/             # domain/ · application/ · infrastructure/ · presentation/
                               # (rich domain layer ONLY in the 5 core contexts —
                               #  supporting contexts use flat services)
```

### The rules

1. **Contracts before controllers** — request/response validation binds to
   Zod schemas via `ZodValidationPipe`. Import contracts ONLY from
   `src/shared/contracts` (eslint enforces this; a bare `@cosmoz/shared`
   import would type-check but crash at runtime — the package is
   source-exported and compiled into this build via `tsconfig.build.json`).
2. **Prisma is infrastructure** — models never leave
   `infrastructure/`; contexts define repository interfaces and get
   implementations injected. `Domain Entity = Prisma Model` is forbidden.
3. **No God services** — `shared/` and `infrastructure/` provide technical
   capabilities only; never accumulate business rules there.
4. **Cross-context communication** goes through public application interfaces
   (or domain events later) — never through another context's repositories,
   Prisma models or internals.
5. **Money discipline** — `Decimal(18,8)` columns; decimal-STRING wire format;
   authoritative P&L/R recomputed server-side at write time (never trusted
   from the client).
6. **Authorization is server-side** — the frontend `AuthGate` is UX only.
7. **No speculative abstractions** — rich domain layers only where invariants
   live (Journal, Discipline, Playbook, Analytics, Review).

## Identity & Security (Phase 2)

`src/modules/identity/` implements the auth contract defined by
`@cosmoz/shared` (schemas/auth.ts + schemas/security.ts) — the MSW engines
were the porting spec; the frontend needs **zero changes** to swap
(`NEXT_PUBLIC_API_MOCKED=false` + `NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1`).

Key mechanics (all negative-tested):

- **Passwords**: Argon2id (OWASP params) via `PasswordHasherService`.
- **Tokens**: 15-min HS256 access JWT `{sub, sid}` (memory-only client-side) +
  rotating refresh token — opaque random, `SHA-256`-hashed at rest, delivered
  ONLY as the HttpOnly `cosmoz_rt` cookie (SameSite=Lax, Secure in prod,
  Max-Age only when "remember"). Reuse of a rotated token revokes EVERY
  session of the user + `SESSION_REVOKED` event.
- **Status gates**: PENDING_VERIFICATION / SUSPENDED / DEACTIVATED → 403
  with the contract codes; anti-enumeration: unknown email and wrong password
  produce byte-identical 401s; forgot/resend always answer 202.
- **Rate limits** (per-email sliding windows, 429 + Retry-After): login 5/15m ·
  MFA 5/15m · register 5/15m · resend 3/15m · forgot 3/15m · reauth 5/15m.
- **MFA**: TOTP (RFC 6238, ±1 step), secret AES-256-GCM encrypted at rest,
  shown once at enrollment with 10 single-use XXXX-XXXX recovery codes
  (hashed). No `demoCode` ever leaves the server.
- **Reauth**: `POST /security/reauth` (password) → single-use 5-min token;
  consumed by password change, 2FA enable/disable, recovery regeneration,
  API-key create/revoke. Missing token → 401 INVALID_REAUTH_TOKEN.
- **Security events**: append-only table (19 contract types) + login history;
  no update/delete paths exist. Retention constants declared (365d / 180d;
  purge job deferred).
- **API keys**: prefix + fingerprint + hashed secret; plaintext shown exactly
  once at creation. Not yet accepted as request credentials (no consumers).
- **Account**: deactivation (revoke-all + DEACTIVATED) and scheduled deletion
  (14-day grace, `ACCOUNT_DELETION_REQUESTED`; purge job is a later phase —
  all data-owning domains must exist first).
- **Authorization**: global `JwtAuthGuard` (token → live session → ACTIVE
  user), `@Public()` opt-out, `@CurrentUser` principal; ownership checks
  demonstrated on sessions/keys (foreign ids → 404, never leaky).

Transactional email uses Nodemailer over SMTP when `SMTP_USER` and
`SMTP_APP_PASSWORD` are configured; development falls back to a console transport
when credentials are absent. For Gmail, enable Google 2-Step Verification, create
an App Password, and set the following in `apps/api/.env`:

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-account@gmail.com
SMTP_APP_PASSWORD=your-16-character-app-password
EMAIL_FROM=Euforia <your-account@gmail.com>
```

Use the same address in `SMTP_USER` and `EMAIL_FROM`, or a Gmail-approved
send-as alias. Never commit real credentials. Production startup fails if SMTP
credentials are missing. Email-based MFA sends a six-digit code with the same
short expiry as the login challenge; TOTP remains available as the alternative.

## Accounts / Trading Connectivity (Phase 3)

`src/modules/accounts/` implements the provider-agnostic, **READ-ONLY**
trading-accounts domain (Phase 3 mandate). Execution is architecturally
impossible: the provider interface has no execution methods, no execution
endpoints exist, and V1 permissions are `READ_*` only.

Key mechanics:

- **Concept separation (§3)**: `TradingAccount` (stable external identity:
  provider, external login, environment DEMO/LIVE/PROP_FIRM, currency,
  starting balance) ≠ `TradingConnection` (how Cosmoz talks to the provider:
  method, status, **encrypted credentials**) ≠ `TradingAccountSnapshot` +
  positions/orders/deals (mutable external state). `TradingSyncRun` records
  every synchronization attempt (observability, §50).
- **Orthogonal lifecycles (§15)**: connection status
  (`DISCONNECTED|CONNECTING|CONNECTED|ERROR`) never merges with
  synchronization status (`UNKNOWN|SYNCING|LIVE|DELAYED|STALE|ERROR`, derived
  from run outcomes + a 15-min freshness TTL in `mappers.ts`).
- **Provider abstraction (§9–§11)**: the domain depends only on
  `TradingProviderAdapter` (read-oriented: `testConnection`, `fetchAccountInfo`,
  `fetchSnapshot`, `fetchPositions`, `fetchOrders`, `fetchDeals`) +
  `ProviderRegistryService`. Adapter output is schema-validated at the
  normalization boundary (`normalization.ts`) — a type-broken provider
  response becomes 502 `INVALID_PROVIDER_RESPONSE`, never a corrupted row.
- **Adding a provider (§60)**: implement `TradingProviderAdapter`, add the
  instance to the registry factory in `accounts.module.ts`, done. Registry,
  capabilities, descriptors and UI metadata follow automatically; nothing
  outside the accounts module changes.
- **Mock provider (§55/§57)**: `MOCK` simulates an MT5-style broker with
  deterministic data (pure function of the external account id) and
  controlled failures via secret prefixes (`fail-invalid`, `fail-timeout`,
  `fail-unavailable`, `fail-malformed`). Registered ONLY when
  `ACCOUNTS_MOCK_PROVIDER` allows (default: on outside production) —
  production cannot silently serve mock data.
- **Credentials (§22/§23)**: API-key secrets arrive over TLS, are validated
  with the provider BEFORE persistence, encrypted at rest with AES-256-GCM
  under the dedicated `ACCOUNTS_CREDENTIALS_ENCRYPTION_KEY` (key separation
  from the MFA key), and are NEVER returned, logged, or echoed — responses
  carry a `••••1234`-style hint only. Disconnect DESTROYS credentials but
  keeps all history (§52); deletion semantics are a future product decision.
- **Idempotency & concurrency (§18/§38)**: external objects are keyed by
  `(accountId, externalXxxId)` — re-syncing upserts, never duplicates.
  At most ONE `RUNNING` run per account (partial unique index); a second
  trigger gets 409 `SYNC_ALREADY_RUNNING`. Sync persistence is ONE
  transaction (snapshot + positions + orders + deals + run + lastSyncAt).
- **Rate limits (§37)**: per-user sliding windows via the identity limiter
  class — connect 5/15m, reconnect 5/15m, sync 20/15m; provider failures are
  normalized to the stable `TRADING_ERROR_CODES` (§36).
- **Audit (§39)**: `TRADING_ACCOUNT_CONNECTED` / `_CONNECTION_FAILED` /
  `_DISCONNECTED` / `_SYNC_FAILED` events land in the append-only security
  event log (sync success lives in run records to keep the log signal-dense).
- **API surface** (`/api/v1`, all authenticated): `GET/POST /accounts`,
  `GET /accounts/providers`, `GET /accounts/:id`, `…/snapshot`, `…/positions`,
  `…/orders`, `…/deals`, `…/sync` (GET status / POST trigger),
  `POST …/connection`, `DELETE …/connection`, `POST …/connection/test`, and
  `GET /broker/session` (the Session-Live panel aggregate, served from the
  synchronized state — the provider stays the source of truth, §46).

## Testing

- **Unit** (`test/unit/`): env validation, error mapping, request-id rules,
  contract liftability, AES-GCM roundtrip/tamper, the mock provider's
  determinism + controlled failures, synchronization-status derivation.
  No DB, no HTTP.
- **e2e** (`test/e2e/`): boots the REAL `AppModule` over Fastify
  (`test/helpers/build-app.ts`, fastify `inject()`) — health endpoints, 404
  envelope, Zod validation, full error taxonomy, security headers, CORS,
  rate limiting, oversized bodies, DB-down readiness, security NEGATIVE
  cases (mandate §33), the full identity contract, and the accounts
  lifecycle + ownership + credential-redaction + execution-red-line suites
  (`accounts.e2e.spec.ts`, §48/§49).
- The probe routes live in `test/helpers/probe.controller.ts` and are **not**
  part of the production build.
- Frontend Playwright suites (`apps/web/scripts/verify-*.js`) keep running
  against MSW (`NEXT_PUBLIC_API_MOCKED=true`) — the swap to this API happens
  by setting `NEXT_PUBLIC_API_MOCKED=false` + `NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1`
  once domain phases deliver the matching endpoints.

## Production notes

- `pnpm build` → self-contained `dist/` (includes compiled `@cosmoz/shared`).
  Entry: `dist/apps/api/src/main.js`. `pnpm start` adds `--enable-source-maps`.
- Graceful shutdown: SIGTERM/SIGINT → HTTP server close → Prisma disconnect.
- Logs are JSON (pino) with secret redaction (`REDACT_PATHS` in
  `logger.factory.ts`); dev adds pretty transport. Health endpoints are
  excluded from request logging to avoid probe spam.
- `docker-compose.yml` (root) provides PostgreSQL 16 + the API service for
  environments with Docker. The API image lives in `apps/api/Dockerfile`.
