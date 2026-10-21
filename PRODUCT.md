# PRODUCT.md — COSMOZ

> Durable product truth (impeccable `init`, degraded mode — launcher binary
> unavailable in sandbox; facts gathered from the running product and the
> project worklog, not invented).

## What it is
COSMOZ is a personal **trading journal and behavioral coach**. The trader logs
every execution (forex, crypto, synthetic indices on Deriv), grades the
decision *before* seeing the result, and the app answers with analytics,
discipline alerts and a conversational coach grounded in the journal's own
data.

## Audience & scene
One operator: a dedicated retail trader reviewing their own book. Sessions
happen at a desk, market hours, often at night; reviews happen after close.
The visitor and the operator are the same person — the product talks to them
like a demanding coach, not a casino lobby.

## Success looks like
- Every trade captured with its context (setup, emotion, grade) in under 30s.
- The trader can trust the record: numbers are exact, tabular, auditable.
- Discipline (process, risk budget, rule adherence) is scored *before* P&L.
- The coach quotes the journal's real numbers back at the trader.

## Non-negotiables (constraints)
- Three themes must keep working: `dark-blue` (default), `dark`, `light`.
- Zero hardcoded hex in `.tsx` — all color lives in token files.
- Mocked backend (MSW) in dev; PWA + JSON backup already shipped.
- French UI language. Professional, calm, stoic tone — no hype, no
  gamified P&L ("gamify the process, never the P&L").
- Preserve: all routes, behavior, data semantics (R-multiples, grades A–F,
  ghost trades, violations), keyboard flows (⌘K, N, ?), accessibility.

## Register
**Operate** — the visitor completes a task. Scanability, consistency and
exactness outrank expression; brand lives in precise details.
