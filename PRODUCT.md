# PRODUCT.md — Euforia

## What it is

Euforia is a personal trading journal and behavioral review workspace. A trader records executions from external broker platforms, documents the plan and decision, reviews the result, and uses analytics and discipline tools to improve process quality.

Euforia is **not an order-execution platform**. Broker integrations are read-only and do not place, modify or close orders.

## Core product areas

- Journal and trade capture: executions, screenshots, notes, tags, plans and reviews.
- Accounts: broker/prop-account metadata and read-only synchronization where a real adapter is configured.
- Discipline and review: rules, violations, grading, lessons, goals and process analytics.
- Oryon: charting, analysis, drawings, alerts and journal linkage. Market coverage depends on the active public/provider feeds.
- Academy and Nofy: learning content and trading knowledge notes.
- Tasky and Personal Events: user-owned planning and events.
- OCR: chart/statement recognition through the FastAPI sidecar, with user confirmation before persistence.

## Runtime truth

- The web app calls the real NestJS API; mock mode/MSW is not part of the current runtime.
- PostgreSQL is the system of record. Redis is optional cache/infrastructure.
- The market service currently uses Binance Spot and Deriv public feeds. Catalog presence does not imply that an instrument has live quote/candle coverage.
- Oryon's private positions stream is explicitly marked simulated until it is sourced from a real broker bridge.
- Provider adapters, background synchronization, OCR and email require the relevant local/deployment configuration and credentials.

## Success criteria

- Journal data is accurate, auditable and exportable.
- Risk and review calculations use shared/server-side business rules.
- The UI distinguishes missing, stale, simulated and live data.
- No UI implies that an order was executed by Euforia.
- Security boundaries (ownership, verification, MFA, session revocation, secret handling) remain enforced.

## Product posture

Professional, calm and precise. Improve process quality, not excitement around P&L.
