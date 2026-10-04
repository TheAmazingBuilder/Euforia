# ADR-0002 — Domain Event Strategy: Deferred Minimalism

- **Status:** Accepted (Phase 20 — Cross-Domain Integration)
- **Date:** 2026-10-04
- **Decides:** No domain-event bus, no outbox, and no event abstraction are introduced until a real consumer exists. The SecurityEvent ledger is an audit trail, not an event bus.

## Context

Phase 20 §8 asks to audit whether domain events exist and to "introduce a minimal event abstraction only where useful", §13 to "prefer the simplest mechanism that provides the required reliability", and §14 to evaluate a transactional outbox only "if the actual reliability requirements justify it". §7 forbids using events "merely because they sound architecturally sophisticated".

The audit found:

- **No event infrastructure exists**: no `@nestjs/event-emitter`, no in-process bus, no outbox table, no broker. The only event-shaped artifact is the append-only `SecurityEvent` ledger — an audit log written through the `SecurityEventService` port, with a closed type catalog, never consumed for reactivity.
- **No real consumers exist either.** The candidate cross-domain reactions of the target architecture (`TradeCreated → Analytics`, `OCR confirmed → Trading Core`, …) all target bounded contexts that are not implemented server-side yet (phases 4–15). Today every cross-context need is a synchronous query satisfied at read time (Monitoring → Accounts/Identity/Security contracts).

## Decision

1. **Defer** all event infrastructure. Phase 20 introduces none — no bus, no dispatcher, no outbox table, no event-versioning scheme — because zero live consumers justify the cost.
2. The event catalog of Phase 20 §8 (TradeCreated, TradeClosed, StrategyPublished, …) is recorded as a **naming and payload convention** for the phase that first needs one; it is not implemented speculatively.
3. When the first genuine need appears (expected: Trading Core → Analytics projection, or OCR-confirmed → Trade creation), the default mechanism is **in-process, transaction-scoped dispatch** (Nest EventEmitter or equivalent abstraction) inside the modular monolith — no broker (Kafka/RabbitMQ/Redis Streams) without a demonstrated reliability requirement.
4. A **transactional outbox** is considered only when a workflow must guarantee "DB state change + cross-domain reaction" across a process boundary or against consumer downtime. Its prerequisites stay those of Phase 20 §14: transactional persistence, retryable dispatch, idempotent processing, observable failures, no secrets in payloads.

## Consequences

- Nothing to operate, nothing to fail, nothing to monitor for event delivery today — consistent with the Monitoring phase's honest-observability stance.
- The idempotency groundwork that future consumers will rely on already exists where needed: OCR recognitions are idempotent by `(userId, idempotencyKey)`; provider rows upsert by stable external identity; sync runs admit at most one RUNNING run per account.
- Re-open this ADR when the first asynchronous consumer is justified — the decision to make then is in-process bus vs outbox, not broker selection.
