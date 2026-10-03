# COSMOZ — BACKEND PHASE 1
## NestJS Foundation & Modular Monolith Infrastructure — Final Report

| | |
|---|---|
| **Date** | 2026-10-03 |
| **Base** | Phase 0 report (`docs/backend/PHASE-0-ARCHITECTURE-REPORT.md`, HEAD `8160111`/`78e30ac`) |
| **Scope** | Foundation ONLY — configuration, database infrastructure, logging, errors, validation, security baseline, health, rate limiting, testing, shared contracts, docs, CI. **No business domains.** |
| **Verification** | typecheck ✅ · lint ✅ · build ✅ · **71/71 tests ✅** · live boot + health + graceful shutdown ✅ · invalid-env controlled failure ✅ · web/shared regression ✅ |

---

# A. What Was Implemented

| # | Capability | Where |
|---|---|---|
| 1 | **NestJS 11 app in the monorepo** (`apps/api`, pnpm workspace + turbo member), Fastify adapter, CJS, plain-`tsc` build (no `@nestjs/cli`) | `apps/api/` |
| 2 | **Environment validation (fail-fast, safe)** — Zod schema over app/database/CORS/logging/security/rate-limit/external-service categories; controlled startup abort listing key paths only (never values); wildcard CORS rejected | `src/config/` |
| 3 | **Typed configuration** — memoized `AppConfig`, DI token, single `process.env` reader | `src/config/app-config.ts` |
| 4 | **PostgreSQL + Prisma infrastructure** — client lifecycle (connect on init → **boot fails if DB unreachable**, disconnect on shutdown), `ping()` health seam, dev/test query diagnostics routed to pino, **empty schema (no speculative business models)** | `src/infrastructure/prisma/`, `prisma/schema.prisma` |
| 5 | **Structured logging** — pino root logger (service/env bindings, level from config), secret redaction by path, pretty transport in dev only; Nest lifecycle logs routed through the same logger | `src/infrastructure/logging/` |
| 6 | **Request logging + correlation** — pino-http; `x-request-id` reused only when matching a strict safe format (8–64 chars `[A-Za-z0-9_-]`), otherwise regenerated (uuid); id echoed on every response; health paths excluded from auto-logging (no probe spam) | `logging.module.ts`, `shared/http/request-id.ts`, `app.setup.ts` |
| 7 | **Error taxonomy** — `AppError` hierarchy (ValidationError 400 · Unauthorized 401 · Forbidden 403 · NotFound 404 · Conflict 409 · BusinessRule 422 · RateLimited 429 · ExternalProvider 502 · Infrastructure 500) | `src/shared/errors/` |
| 8 | **Global exception handling** — `AllExceptionsFilter` (registered via `APP_FILTER`) + pure `error-mapper.ts`: stable `{error, code?, message?, issues?, requestId?}` envelope; **5xx/unknown sanitized** (no stacks, SQL, secrets); Fastify transport errors (413/400) and Prisma P2002/P2025 mapped conservatively; unknown-route 404s flow through the same filter (Nest fastify adapter wiring) | `src/shared/http/` |
| 9 | **Global request validation** — `ZodValidationPipe` binding payloads to shared Zod contracts; 400 `{error:"ValidationError", issues}` exactly as the frontend renders today | `src/shared/http/zod-validation.pipe.ts` |
| 10 | **Security baseline** — helmet defaults (CSP, HSTS, no-sniff, frameguard, referrer-policy, hide-powered-by), CORS allowlist from config (credentials on, `*` forbidden), 1 MiB body cap, trust-proxy opt-in, safe error responses | `app.setup.ts`, adapter options |
| 11 | **Rate limiting foundation** — `@nestjs/throttler` global guard, named `default` policy from config, documented per-future-policy attachment pattern (auth vectors, sensitive ops, provider sync, WS); health exempt | `src/infrastructure/security/` |
| 12 | **Health endpoints (unversioned)** — `/health` (app status, no secrets), `/health/live`, `/health/ready` (DB ping; 503 + plain down-status, details only in logs) | `src/infrastructure/health/` |
| 13 | **API versioning** — URI versioning, default v1 → domain routes live at `/api/v1/…`; infrastructure at root (documented decision, not fashion: Phase 0 §P.2 adopted it) | `app.setup.ts` |
| 14 | **Shared contracts foundation** — `src/shared/contracts` barrel re-exports `@cosmoz/shared` (compiled into the build via relative source inclusion; eslint `no-restricted-imports` forbids bare imports — the package is source-exported and would crash at runtime); **zero changes to `packages/shared`** | `src/shared/contracts/` |
| 15 | **Testing infrastructure** — vitest (+SWC plugin for decorator metadata), unit + e2e layers, embedded-PostgreSQL global setup, **test-database safety guard** (`cosmoz_test` or nothing), security negative tests | `test/` |
| 16 | **Dev database tooling** — embedded PostgreSQL 17 via portable binaries (no Docker/root in sandbox): init/start/databases, `db:up/status/down` | `scripts/dev-db.mjs` |
| 17 | **CI** — GitHub Actions: api job (lint, typecheck, build, full tests) + web regression job (typecheck) | `.github/workflows/ci.yml` |
| 18 | **Docker/compose** — multi-stage API Dockerfile + compose (db; api under `full` profile) for Docker environments | `apps/api/Dockerfile`, `docker-compose.yml` |
| 19 | **Documentation** — this report + `apps/api/README.md` (start, env, db, migrations, tests, architecture conventions, module boundaries) | |

# B. Files Changed

**New — `apps/api/`** (all listed are load-bearing):
- `package.json` · `tsconfig.json` · `tsconfig.build.json` (rootDir `../..` compiles shared sources into a self-contained dist) · `eslint.config.mjs` (boundary rule) · `vitest.config.ts` · `.swcrc` · `.env.example`
- `src/main.ts` · `src/app.module.ts` · `src/app.setup.ts` (HTTP wiring shared by prod AND e2e — no test/prod divergence)
- `src/config/{env.schema,app-config,config.module}.ts`
- `src/shared/errors/app-error.ts` · `src/shared/http/{error-mapper,all-exceptions.filter,zod-validation.pipe,request-id}.ts` · `src/shared/contracts/index.ts`
- `src/infrastructure/logging/{logger.factory,logging.module}.ts` · `src/infrastructure/prisma/{prisma.service,prisma.module,prisma.constants}.ts` · `src/infrastructure/security/rate-limit.module.ts` · `src/infrastructure/health/{health.controller,health.module}.ts`
- `test/{global-setup,setup}.ts` · `test/helpers/{build-app,probe.controller}.ts` · `test/unit/{env.schema,error-mapper,request-id,contracts}.spec.ts` · `test/e2e/{app,security-negative}.e2e.spec.ts` (71 tests)
- `scripts/dev-db.mjs` (+ `.d.mts`) · `prisma/schema.prisma` · `README.md` · `Dockerfile`

**New — repo root**: `docker-compose.yml` · `.github/workflows/ci.yml`

**Modified (minimal, all Foundation-related)**:
- `pnpm-workspace.yaml` — `allowBuilds` approvals (prisma engines/client, embedded-postgres linux binaries, esbuild, @swc/core)
- `turbo.json` — `test` task
- root `package.json` — `test`/`api:dev`/`api:db:up` scripts
- `.gitignore` — `.localpg/`
- `pnpm-lock.yaml` — new api deps only (web's tree untouched)

**Deleted (sanctioned by Phase 0 register)**:
- root `bun.lock` (R-5: stale turbo-only artifact) · root `.env` (R-6: stale `DATABASE_URL=file:…`; removal explicitly scheduled "when Prisma lands" — Prisma landed, and the stale value was actively interfering)

**NOT touched**: `apps/web/**` (zero files), `packages/shared/**` (zero files), `mini-services/**`.

# C. Existing Functionality Reused

- **`@cosmoz/shared` consumed verbatim** as the contract layer (Phase 0 §G verdict applied) — schemas, enums, wire primitives (`decimalString`, `isoDateTime`, `dateKey`), `COSMOZ_VERSION` (exposed by `/health`). No parallel contract code was created.
- **MSW error conventions** (`{error[,code]}`, `ValidationError` + `issues`) reproduced exactly in the filter — the frontend's `client.ts` needs no changes to render backend errors.
- **Phase 0 blueprint** (§L structure, §P.1 conventions, §Q stack decisions) followed rather than re-derived: Fastify, Prisma+Postgres, pino, throttler, vitest, `/api/v1`, contract-first rule.
- **`data-model.md`** conventions encoded into `schema.prisma` header comments (Decimal(18,8), UTC, migration discipline) — the design seed for Phase 2+.
- **Frontend port convention** (`NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1`) honored — no frontend change required (swap remains a config change).

# D. Architecture (DDD Modular Monolith fit)

- `src/` is organized exactly along the mandate's conceptual tree: `config/` + `infrastructure/` (technical capabilities) + `shared/` (kernel: contracts, errors, http) — **no business logic anywhere**; `modules/` (bounded contexts) deliberately empty until Phase 2.
- **Prisma boundary**: PrismaService is a global infrastructure capability; contexts will depend on repository interfaces, never on the client or generated types. No Prisma type crosses a context interface (enforced by convention + review; no context exists yet to violate it).
- **Context boundaries pre-enforced**: the contracts barrel + eslint rule give future contexts exactly one import surface for shared schemas; cross-context imports of internals are banned by the documented module rules (README §Architecture conventions).
- **No God service**: `shared/` holds zero business logic; `infrastructure/health` is system-only; the rate-limit module documents future policy names instead of inventing limits.
- **FastAPI/market-service untouched** — no Python responsibilities absorbed; the Bun sidecar remains the feed service (Phase 0 §M recommendation stands).
- Single-process monolith: one Prisma client, one logger, in-process throttler storage — no premature brokers/queues/microservices.

# E. Database

- **Schema changes: NONE.** `prisma/schema.prisma` defines datasource + generator only — **zero models** (Foundation mandate §9/§37). `prisma migrate dev` reports "Already in sync" — no migration files exist yet; the first migration arrives with Identity (Phase 2) following the `data-model.md` order.
- What WAS established: connectivity + lifecycle (boot fails when the DB is down), health ping, dev/test query diagnostics, migration conventions (deterministic, reviewable, `deploy` for CI/prod, never reset non-test DBs), and a **dedicated `cosmoz_test` database** with a hard safety guard.

# F. Security

- Helmet defaults on every response (verified live: CSP, HSTS, nosniff, frameguard, referrer-policy; `x-powered-by` suppressed).
- CORS: explicit origin allowlist from validated config, credentials on, `*` rejected at validation time (startup fails); disallowed origins get **no** ACAO header (verified).
- Request body capped (1 MiB → 413 mapped envelope); invalid JSON → 400 envelope.
- Rate limiting: global default policy + per-route override capability (verified 3rd request → 429 `RateLimited`); health exempt; `TRUST_PROXY` opt-in.
- Errors sanitized: unknown 5xx/throws never expose messages, stacks, SQL or connection strings (negative-tested, including a planted fake credential).
- Secrets: redaction list on all logs (auth headers, cookies, passwords, tokens, MFA/recovery codes, nested `*.secret`); env validation errors print key paths only (negative-tested); `.env*` gitignored; no secret hardcoded anywhere.
- Test safety: tests refuse any database except `cosmoz_test` (worker-level fail-fast) — "production database used by tests" is itself a negative test.
- Authentication/JWT/MFA deliberately **not** implemented (next phase).

# G. Testing

- **Unit (4 files, 39 tests)**: env schema (defaults, rejects, secret-safety), error mapper (full taxonomy + sanitization + framework/Prisma mapping), request-id rules, contract liftability (decimal-string/UTC/dateKey semantics).
- **E2E (2 files, 32 tests)**: real `AppModule` over Fastify via `inject()` — health/live/ready (incl. DB-down 503 + recovery), routing conventions (`/api/v1` 404 envelope), Zod validation pass/fail, full error taxonomy over HTTP, helmet headers, CORS allow/deny, request-id echo/replace, rate-limit 429, oversized body 413, invalid-JSON, startup env failures, test-db safety.
- **Verification results**: `tsc --noEmit` ✅ (api src+test) · eslint ✅ 0/0 · `pnpm build` (api) ✅ · **vitest 71/71 ✅** · live boot + curl probes ✅ · SIGTERM graceful shutdown ✅ · invalid env → controlled failure ✅.
- **Regression**: `packages/shared` tsc ✅ (0 changes to the package), `apps/web` tsc ✅ (0 changes to the app).

# H. Remaining Risks

1. **PRE-EXISTING, frontend**: `next build` fails prerendering `/login` — `useSearchParams()` without a Suspense boundary (Next.js CSR bailout). Reproduced with **zero backend files involved** (it blocks `turbo build` monorepo-wide but is outside this phase's mandate; CI's web job therefore typechecks only). One-line frontend fix when the owner chooses.
2. `tsc-watch` dev loop rebuilds shared sources too (rootDir `../..`) — slightly slower incremental watch; acceptable at current size, revisitable with project references.
3. Rate limiting uses in-memory storage — correct for single-instance monolith; must move to a shared store when horizontal scaling arrives (documented in module).
4. Health endpoints are unauthenticated by design; if `/health` must go public behind a proxy, keep payloads as-is (they leak nothing) but consider throttling at proxy level.
5. CI web job is typecheck-only until risk #1 is fixed (commented in workflow).
6. Embedded dev DB uses trust auth on localhost — dev convenience only; compose/managed PG for anything real (documented).

# I. Deferred Work (intentional)

- **All business domains** — Identity/Auth (JWT, refresh rotation, MFA, sessions, security events, audit log), Profile/Preferences, Reference catalogs, Accounts, Trading Journal, Discipline, Session Live, Playbook, Reviews, Analytics, Calendar, Nofy, Academy, Connectivity (READ-ONLY), Monitoring/Backup.
- Domain events bus (conventions documented; in-process when justified), WebSocket gateway foundation, OpenAPI generation, pagination strategy, secret management (vault), email delivery (Phase 0 open question), FastAPI services, market-service JWT/JWKS seam replacement.
- MSW→real-API swap for the existing Playwright suites (blocked on Phase 2 endpoints by design).

# J. Next Phase

**Phase 2 — Identity & Security + Profile & Preferences** (Phase 0 §Q row 2): register/login/logout, refresh rotation + reuse detection (real HttpOnly cookies — integration-test what MSW couldn't), MFA + recovery codes, email verification lifecycle, account status, `/me` + preferences doc, security events + `AuditLog`, API-keys — consuming the existing `authErrorCodeSchema` contract and the auth-engine's mock behaviors as the porting spec, with `@Throttle` policies finally attached to auth vectors.

---

**STOP** — per mandate §40: Phase 1 complete and verified; no Phase 2 work has begun.
