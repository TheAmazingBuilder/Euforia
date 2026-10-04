# ADR-0003 — Cross-Domain Prisma Boundary (No Leakage)

- **Status:** Accepted (enforced in Phase 20 — Cross-Domain Integration, §39)
- **Date:** 2026-10-04
- **Decides:** A context's tables are reachable ONLY through the owning context's exported contract. Monitoring consumes counts from owning-context contracts; Identity no longer touches Security-owned tables.

## Context

Phase 20 §39 requires eliminating cross-module Prisma access ("Prisma remains infrastructure"). The audit found two violations of the ownership model that earlier phases had established on paper:

1. **Monitoring** — `MonitoringRepository.countUserEntities()` counted rows directly on Identity tables (`Session`, `SecurityEvent`, `LoginRecord`, `ApiKey`) and Accounts tables (`TradingAccount*`, `TradingSyncRun`), bypassing the very contracts the Monitoring phase had mandated ("consume, never duplicate", Phase 17 §26).
2. **Identity** — `IdentityRepository` still carried the pre-extraction methods `appendSecurityEvent`, `listSecurityEvents`, `appendLoginRecord`, `listLoginRecords`, `countRecentFailedLogins` over tables that the Phase 16 bounded-context extraction had moved into the Security context. Four were dead code; one had a live caller: the MFA-failure branch of `AuthService` wrote a `LoginRecord` through raw Prisma next to its port-based security-event write.

## Decision

1. Each context exposes counts of its **own** tables as part of its exported contract, named uniformly `countUserEntities(userId)`:
   - `IdentityRepository.countUserEntities` → `{ sessions, apiKeys }`
   - `SecurityEventRepository.countUserEntities` → `{ securityEvents, loginRecords }`
   - `AccountsRepository.countUserEntities` → `{ accounts, positions, orders, deals, syncRuns }`
2. `MonitoringService` composes the user-facing labels ("Sessions", "Security events", …) from these three contracts. Labels are presentation — they belong to Monitoring; counts belong to owners. The HTTP contract of `GET /monitoring/overview` is unchanged.
3. The five security-owned methods were **removed** from `IdentityRepository`. The single live caller (MFA-failure) now records the event + login-history pair through `SecurityEventService.recordLogin` — one port, one writer, identical rows.
4. Going forward, this is the review rule: **a Prisma model accessor outside its owning module is a defect.** New consumers ask the owning context for a narrow contract; they never add a table to their own repository.

## Consequences

- The dependency graph gains one narrow edge (`MonitoringModule → SecurityEventModule`) and loses all hidden data-layer coupling. `madge --circular` stays clean (124 files, zero cycles).
- Full verification stays green after the change: typecheck, lint, 310/310 unit + e2e tests (the Monitoring e2e asserts the same entity labels/counts through the new path), build, runtime boot.
- Database-level integrity checks (Phase 20 §59, 21 assertions) run read-only over the migrated schema — no repair logic was needed and none was added.
