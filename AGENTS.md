# Euforia — Engineering Rules

These rules describe the current repository. Older Cosmoz/Phase-0 briefs are retained in `docs/legacy/` for historical context only and must not override this file.

## Product and architecture

Euforia is a trading journal, review, analytics and market-charting product. It is **not** an order-execution terminal. Broker/account integrations are read-only; users place orders in their broker platform.

Monorepo: pnpm workspaces + Turborepo.

- `apps/web`: Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS v4, shadcn/Radix, TanStack Query.
- `apps/api`: NestJS 11 + Fastify, Prisma 6, PostgreSQL. Modular monolith, domain modules composed by `src/app.module.ts`.
- `packages/shared`: Zod contracts, types, enums and pure domain utilities shared by web and API.
- `mini-services/market-service`: Bun service exposing real public read-only quotes/candles from its configured providers.
- `mini-services/ocr-service`: FastAPI OCR sidecar. OCR must not use fabricated recognition output in real environments.
- Redis is optional infrastructure/cache; PostgreSQL remains the source of truth.

The frontend API mode is permanently real (`API_MOCKED = false`). Do not reintroduce MSW or pretend that a demo fixture is live data. The Next.js rewrite proxies `/api/v1` to `API_PROXY_TARGET` (default `http://localhost:4000`).

## Branch and repository safety

- Do all implementation and cleanup work on `euforia-collab`.
- Never commit, merge, rebase onto, or push to `main` unless the owner explicitly requests it.
- Never force-push. Use fast-forward updates and inspect a changed branch head before retrying.
- Preserve user data, database rows, migrations and historical QA evidence.
- Never delete a file just because it has no obvious import. Check route/module registration, scripts, dynamic imports, configuration, migrations, CI and docs first.
- Keep commits scoped and explain any intentional compatibility layer.

## Data integrity and market-data honesty

- No mock/fake prices or candles in real application paths.
- Preserve canonical raw instrument symbols for database/API/provider matching. Apply display formatting only at the UI edge.
- Distinguish catalog presence from live-feed coverage. An instrument without a compatible provider must be marked unavailable, not given synthetic quotes.
- Synthetic indices are a distinct asset class and must not be described as exchange-listed futures or cash indices.
- Keep currency, contract size, digits, tick/pip size and volume rules tied to verified instrument/provider metadata.
- Never claim Oryon private positions are broker-live unless the event source explicitly proves that provenance.

## Backend and security

- Validate request/response contracts with `packages/shared`; keep controllers thin and ownership checks server-side.
- Use Prisma migrations for schema changes. Prefer additive migrations. Never edit already-applied migrations to change deployed behavior.
- Do not log credentials, tokens, OTPs, refresh cookies, raw account secrets, or encryption keys.
- Keep password reset, email verification, MFA challenge consumption, IDOR protection and rate-limits fail-closed.
- Never weaken production security checks simply to make a test pass. Fix the test setup or the underlying defect.
- Environment examples contain placeholders only. Real secrets belong in ignored local environment files or the deployment secret store, never in Git.
- If a secret has ever been committed, removing it from the current tree does not purge history; rotate it and coordinate any history rewrite separately.

## Current theme and UI rules

The visible theme switch offers:
- `dark` — default graphite theme.
- `midnight` — dark navy/ink theme (`#0d1117`, accent `#2975ed`).
- `light` — paper theme.

The `euforia` brand theme remains available for compatibility. Use semantic CSS tokens; avoid adding hard-coded colors in TSX. Keep BUY/SELL, profit/loss, validation and destructive colors semantically distinct. Maintain keyboard access, labels, focus states and responsive behavior.

## Commands and verification

From the repository root:

```powershell
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm api:dev
pnpm web:dev
pnpm market:dev
```

API E2E requires an isolated PostgreSQL test database:

```powershell
$env:DATABASE_URL_TEST = "postgresql://postgres:postgres@127.0.0.1:5432/euforia_test"
pnpm --filter @cosmoz/api test:e2e
```

Other relevant commands:
- API: `pnpm --filter @cosmoz/api lint`, `typecheck`, `build`, `test`, `test:e2e`, `db:migrate`.
- Web: `pnpm --filter web lint`, `typecheck`, `test`, `build`.
- Market service: `pnpm market:test`.
- OCR: `mini-services/ocr-service` requirements/tests (see its README).

CI currently gates four execution blocks: API (unit + E2E), Web (lint/typecheck/unit/build/secrets guard), market-service (Bun tests/typecheck), and OCR (pytest). A green CI is necessary but not sufficient for local operational readiness: real local environment variables, PostgreSQL, provider credentials and manual browser/provider checks still matter.

When adding or changing a module, update its module-by-module test/CI coverage and the current audit/runbook. Do not label a module “operational” until the relevant tests and required external dependencies have been verified.
