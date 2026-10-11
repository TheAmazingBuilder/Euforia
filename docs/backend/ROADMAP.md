# COSMOZ — Backend Implementation Roadmap

Living record of the bounded-context implementation order. Conceptual phase
numbers are NEVER renumbered (a skipped phase stays in the record).

## Implemented

| Phase | Context | Report |
|---|---|---|
| 0 | Repository audit & architecture ground rules | PHASE-0-ARCHITECTURE-REPORT.md |
| 1 | NestJS Foundation (config/logging/prisma/errors/validation/health/rate-limit) | PHASE-1-FOUNDATION-REPORT.md |
| 2 | Identity — auth, MFA, sessions, security events | PHASE-2-IDENTITY-REPORT.md |
| 3 | Accounts — trading accounts, connectivity, read-only providers, snapshots | PHASE-3-ACCOUNTS-REPORT.md |
| 4 | Trading Core — Trade + TradeExecution, aggregation, reconstruction | PHASE-4-TRADING-CORE-REPORT.md |
| 5 | Trade Planning — TradePlan, authoritative risk engine, instrument catalog | PHASE-5-TRADE-PLANNING-REPORT.md |
| 6 | Trade Review — post-trade analysis, plan-vs-actual, streaks | PHASE-6-TRADE-REVIEW-REPORT.md |
| 7 | Playbook — strategies/setups/checklists/rules, freeze versioning | PHASE-7-PLAYBOOK-REPORT.md |
| 8 | Analytics — full analytics suite + dashboard overview (server-side) | PHASE-8-ANALYTICS-REPORT.md |
| 10 | Session Live — read-only real-time workspace (sessions, analyses, levels, notes, timeline, summary) | PHASE-10-SESSION-LIVE-REPORT.md |
| 11 | Academy — authored education content + per-user learning state (progress, quizzes, flashcards, practice, exams) | PHASE-11-ACADEMY-REPORT.md |
| 12 | Nofy — personal knowledge & notes workspace (notes/blocks, folders, tags, templates, versions, search, cross-domain references) | PHASE-12-NOFY-REPORT.md |
| 13 | Economic Calendar — canonical economic-event layer (provider port + builtin adapter, lazy idempotent sync, calendar-view overlay, blocks, import-eco; consumed by Session Live/Analytics/Nofy via public read port) | PHASE-13-CALENDAR-REPORT.md |
| 14 | Integrations — generic external-services platform (provider registry, per-user connection lifecycle, Hub ledgers, inbound webhook pipeline with HMAC/idempotency; eco feed & accounts projected via public ports) | PHASE-14-INTEGRATIONS-REPORT.md |
| 15 | Settings — user-preferences bounded context (9-domain doc in its owned `UserSettings` table, per-domain PATCH under row lock, read-side timezone mirror to the Profile, default-account reference verification, audit triage; consumed by Calendar via the public read port) | PHASE-15-SETTINGS-REPORT.md |

## Deferred

```text
Phase 9 — Backtesting
Status: DEFERRED

Reason:
Frontend Backtesting module does not currently exist.

Decision:
Do not implement Backend Backtesting until the product/frontend
module exists and its requirements are defined.

Future architecture (RECORD ONLY — DO NOT IMPLEMENT NOW):

Playbook/Strategy Version
        ↓
Backtesting Engine
        ↓
Risk Simulation
        ↓
Execution Simulation
        ↓
Portfolio Results
        ↓
Analytics
```

No backtesting controllers, services, database models, engine, Python
microservice or historical simulation infrastructure exists — and none may be
created until the frontend/product module defines its requirements.

## Known deferred seams (documented honesty, Phase 8/10 audits)

- Discipline backend (violations/mistakes/emotions) — Session Live summary
  reports `violationsCount: 0` honestly; timeline emits no SL/TP-modification
  or ALERT rows; moods are always `[]` (Trade carries no emotion columns).
- Eco Calendar backend — Session Live summary reports `ecoEventsCount: 0`.
- Trade attribution columns (Trade.strategyId) — attribution currently flows
  Trade → review.originTradePlanId → TradePlan.strategyId.
