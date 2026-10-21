# ADR-0004 — Consistency Model: Read-Time Composition, No Projections

- **Status:** Accepted (Phase 20 — Cross-Domain Integration)
- **Date:** 2026-10-04
- **Decides:** Every cross-domain read today is strongly consistent, resolved at request time from the owning context. No read models, projections, or caches exist; eventual consistency enters only with the first real projection consumer.

## Context

Phase 20 §31 requires documenting which workflows are strongly vs eventually consistent; §30 ties read models to real projection needs; §48 forbids introducing caching "where none is necessary".

The audit of every existing cross-context interaction:

| Consumer | Owning context | Mechanism | Consistency |
| --- | --- | --- | --- |
| Security center (posture/activity) | Identity, Security | synchronous application query | strong |
| Monitoring (sync health, brokers) | Accounts | synchronous application query (`AccountsRepository`) | strong |
| Monitoring (delivery telemetry) | Identity | synchronous application query (`MailerService`) | strong |
| Monitoring (entity counts, ledger) | Identity, Security, Accounts | synchronous application query (`countUserEntities`) | strong |
| Accounts (user validation, audit context) | Identity | synchronous application query (`IdentityRepository`) | strong |
| Identity/Accounts/OCR (audit trail) | Security | synchronous write port (`SecurityEventService`) | strong |
| OCR (recognition workloads) | OCR sidecar (FastAPI) | request-scoped engine port call | strong (per request) |

No feature currently reads derived data: Monitoring derives alert episodes and system events in bounded in-memory windows at read time (Phase 17 §40/§45); nothing aggregates trades because Trading Core does not exist yet.

## Decision

1. **Strong consistency everywhere, today.** No endpoint returns lagging data; no projection exists; no cache layer exists (the Monitoring overview itself lists "cache layer (none in this build)" as an honest gap).
2. Future eventual consistency arrives only with projections that a real consumer requires — the canonical candidate remains `TradeClosed → Analytics read model` (Phase 20 §30). That phase must: keep Trading Core untouched by presentation needs, make projections idempotent, make projection failure non-canonical (Trade = SUCCESS, projection = PENDING/FAILED, retry possible — §32), and document the lag in the API contract the frontend consumes.
3. Caching is not introduced to paper over cross-domain latency; when introduced, invalidation follows canonical-change events (§48) and is owned by the caching consumer.

## Consequences

- The frontend contract is simple: every response reflects committed canonical state; no staleness semantics need to be communicated yet (§31's "frontend must understand" clause is vacuously satisfied).
- The failure scenarios of §58 that involve projection lag or duplicate delivery have no live surface today; their equivalents (provider sync failure, OCR engine timeout/unavailability, DB unavailability) are covered by the e2e suite and monitored through Monitoring's derived signals.
