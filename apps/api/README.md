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

# 2. Start the local development database (embedded PostgreSQL 17 — no Docker
#    needed; portable binaries, trust auth on 127.0.0.1 ONLY)
pnpm api:db:up

# 3. Configure
cp apps/api/.env.example apps/api/.env     # defaults match db:up

# 4. Run
pnpm api:dev          # watch mode (tsc-watch → node)
```

The API listens on **http://localhost:4000**:

| Endpoint | Purpose |
|---|---|
| `GET /health` | App status (no DB) — monitoring/UI target |
| `GET /health/live` | Liveness probe |
| `GET /health/ready` | Readiness probe (pings the database) |
| `/api/v1/…` | All domain routes (versioned; none exist yet) |

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Watch build + auto-restart (`tsc-watch`) |
| `pnpm build` | Compile to `dist/` (tsc) |
| `pnpm start` | Run compiled output |
| `pnpm typecheck` | `tsc --noEmit` (src + test) |
| `pnpm lint` | ESLint (flat config) |
| `pnpm test` | vitest — unit + e2e (boots the embedded test DB automatically) |
| `pnpm db:up` / `db:status` / `db:down` | Embedded dev PostgreSQL lifecycle |
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

Authentication placeholders (`AUTH_JWT_SECRET`, …) are **deliberately not
validated yet** — the Identity phase owns their contract. Do not put real
secrets into `.env.example`; `.env*` files are gitignored.

## Database

- PostgreSQL 17 + Prisma 6. Schema: `prisma/schema.prisma`.
- **Foundation has an intentionally EMPTY schema — no business models.** Each
  future phase adds its own models + migration following `data-model.md`.
- Migrations are versioned, reviewable files in `prisma/migrations/` (created
  by `db:migrate`, applied by `db:deploy`). Never reset a non-test database.
- Dev/test databases run from **portable binaries** (`scripts/dev-db.mjs`,
  data dir `apps/api/.localpg/`, gitignored) because the dev sandbox has no
  Docker: `cosmoz` (dev) and `cosmoz_test` (tests) on port `5433`, trust auth,
  localhost only. Real deployments use `docker-compose.yml` / managed PG.

### Test database safety (binding)

Tests refuse to run against anything but `cosmoz_test`:

1. `test/global-setup.ts` starts the cluster, creates `cosmoz_test`, applies
   migrations and exports `DATABASE_URL` for every worker.
2. `test/setup.ts` re-asserts `NODE_ENV=test` and `DATABASE_URL → /cosmoz_test`
   inside each worker (fail-fast, defense in depth).

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

## Testing

- **Unit** (`test/unit/`): env validation, error mapping, request-id rules,
  contract liftability. No DB, no HTTP.
- **e2e** (`test/e2e/`): boots the REAL `AppModule` over Fastify
  (`test/helpers/build-app.ts`, fastify `inject()`) — health endpoints, 404
  envelope, Zod validation, full error taxonomy, security headers, CORS,
  rate limiting, oversized bodies, DB-down readiness, plus the security
  NEGATIVE cases (mandate §33).
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
