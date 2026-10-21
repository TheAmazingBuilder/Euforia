# ADR-0001 — Modular Monolith & Bounded-Context Contracts

- **Status:** Accepted (ratified by Phase 20 — Cross-Domain Integration)
- **Date:** 2026-10-04
- **Decides:** Cosmoz remains a NestJS modular monolith; bounded contexts communicate only through narrow, explicit contracts.

## Context

Phase 20's mandate (§3/§5/§6/§60/§61) required verifying that the backend behaves as one coherent platform without becoming a distributed monolith or an "everything imports everything" codebase. The repository currently implements six bounded contexts (Identity, Accounts, Security, Monitoring, Calculators, OCR) plus infrastructure; the remaining domains referenced by the target architecture (Trading Core, Trade Planner, Trade Review, Playbook, Analytics, Session Live, Academy, Nofy, Calendar, Integrations, Settings) belong to phases that have not been implemented server-side.

## Decision

1. Each bounded context lives under `apps/api/src/modules/<context>` and owns its Prisma models, its repository, and its business rules. The composition root (`app.module.ts`) wires modules; it never wires cross-domain services.
2. Cross-context consumption goes through the owning context's **exported contract surface only** (`exports:` in its Nest module). Today that surface is deliberately narrow: `IdentityRepository`, `TokenService`, `PasswordHasherService`, `ReauthService`, `MfaService`, `MailerService` (Identity); `AccountsRepository` (Accounts); `SecurityEventRepository` + `SecurityEventService` (Security).
3. Domain code never imports another context's Prisma models or reaches into its tables directly (enforced in Phase 20 — see ADR-0003).
4. No microservice extraction happens in Phase 20. The only externalized specialized service remains the FastAPI OCR sidecar (Phase 19), reached through the `OCR_ENGINE` port.

## Consequences

- Verification (Phase 20): `madge --circular` over 124 API source files reports **zero circular dependencies**; controllers never call controllers; every cross-context edge is module-import + exported contract.
- Adding a future context (e.g. Trading Core) means: own models, own repository, own module, and — where others must consume it — one narrow exported contract. Nothing else changes.
