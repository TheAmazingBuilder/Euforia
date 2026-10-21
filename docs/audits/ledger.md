# Audit Ledger — chronological

One row per verification pass. **VERDICT**: `PASS` = all ritual checks green,
commit released. `PASS*` = passed with in-flight fixes (documented in the
record). `RE-APPLIED` = re-delivered after the workspace rollback (original
record lost). `LOST` = record destroyed by the rollback; only partial
evidence remains. Detail lives in [`records/`](records/).

| Pass | Date | Feature | Verdict | Evidence | Commit |
|------|------|---------|---------|----------|--------|
| t12 era | 2026-09-24 | Dashboard constellation + Trades module (CRUD, filters, bulk, drawer, modal) | LOST — 22 captures survive | `apps/web/scripts/shots/t12/` | `1439628`, `1087b93` |
| t13 | 2026-09-24 | KPI band on 12-col grid (2 heroes + 4 KPIs, delta pills) | LOST — 5 captures survive | `apps/web/scripts/shots/t13/` | `31f9894` |
| t14–t15 | 2026-09-23 | Playbook + Discipline screens era | LOST — no surviving evidence | — | `a755701` |
| t16 | 2026-09-26 | Session Live V1 — real market data, feed loss/reconnect paths | LOST — 8 captures survive | `apps/web/scripts/shots/t16/` | `47cb98e` (restored base) |
| t17–t18 | 2026-09-23 | Coach, Le Registre redesign, command palette era | LOST — no surviving evidence | — | `787d51e`, `b4ae65d`, `d4ba9ef` |
| t19 | 2026-09-26 | Sidebar sections (Overview/Trading/Tools/System) + collapsible Academy | RE-APPLIED — PASS | `shots/t19/` (7 PNG) | `9f2bae8` |
| t20 | 2026-09-26 | Session toolbar mobile wrap fix (11px overflow at 390) | RE-APPLIED — PASS | `shots/t20/` (2 PNG) | `eacc941` |
| t21 | 2026-09-26 | Auto weekly report — `/reports` + `/stats/weekly` | RE-APPLIED — PASS | `shots/t21/` (4 PNG) | `ad9c267` |
| t22 | 2026-09-26 | Auth improvement — split layout, 2FA, reset, confirm | RE-APPLIED — PASS | `shots/t22/` (10 PNG) | `cc3b69d` |
| t23 | 2026-09-26 | Journal — searchable written log, entries CRUD | PASS | `shots/t23/` (6 PNG) | `d22e238` |
| t24 | 2026-09-26 | Settings — profile, appearance, risk defaults, accounts, backup | PASS* (Turbopack restart) | `shots/t24/` (5 PNG) | `c75f25f` |
| t25 | 2026-09-26 | Journal ↔ trades — linked-trade picker + execution chips | PASS | `shots/t25/` (5 PNG) | `1fbcd8f` |
| t26 | 2026-09-26 | Journal PDF export — jsPDF 'Le Registre' download | PASS (real PDF artifact) | `shots/t26/` (3 PNG + PDF) | `068d52e` |
| t27 | 2026-09-26 | Journal goals — cadence today/month/year, editable targets | PASS | `shots/t27/` (4 PNG) | `da764c8` |
| t28 | 2026-09-26 | Journal filters & sort — linked/mood chips, 3 sort orders | PASS | `shots/t28/` (4 PNG) | `5ec83c4` |
| t29 | 2026-09-26 | System → Monitoring — health rows, latency chart, incidents | PASS | `shots/t29/` (4 PNG) | `490b123` |
| t30 | 2026-09-26 | System → Integrations — catalog, connect/disconnect | PASS | `shots/t30/` (3 PNG) | `43fe93d` |
| t31 | 2026-09-26 | System → Security — password, 2FA, sessions, history, checklist | PASS | `shots/t31/` (4 PNG) | `0b284c0` |
| t32 | 2026-09-27 | Topbar clock — local date + live time before search | PASS | `shots/t32/` (4 PNG) | `e70ff29` |
| t33 | 2026-09-27 | Session Live — chart owns the full row, panels re-paired | PASS | `shots/t33/` (4 PNG) | `1ba4aed` |
| t34 | 2026-09-27 | Sidebar sign out under Academy (+ trades table overflow contained) | PASS* (fix `98a8a5a`) | `shots/t34/` (5 PNG) | `ba3af67` |
| t35 | 2026-09-27 | Academy opens — data engine, nav, Overview, catalog, courses | PASS | `shots/t35/` (7 PNG) | `413b195` |
| t36 | 2026-09-27 | Academy lesson reader — figures, completion, navigation | PASS | `shots/t36/` (5 PNG) | `864991e` |
| t37 | 2026-09-27 | Academy quiz — server-graded attempts, verdicts | PASS* (handler fix in flight) | `shots/t37/` (3 PNG) | `4236681` |
| t38 | 2026-09-27 | Academy progress — category ledger, level, achievements | PASS | `shots/t38/` (3 PNG) | `9a18d56` |
| t39 | 2026-09-27 | Academy glossary — searchable term ledger | PASS | `shots/t39/` (3 PNG) | `059b811` |
| t40 | 2026-09-27 | Academy practice — pattern drills + candle simulator | PASS | `shots/t40/` (3 PNG) | `6831a3a` |

> **Rollback note (2026-09-27).** The workspace was rolled back to `47cb98e`
> (Session Live V1). Every commit between `47cb98e` and `9f2bae8` — and the
> audit records that accompanied them — was destroyed (`git fsck`: objects
> unrecoverable). Passes t19–t22 were re-executed and re-verified from
> scratch on the restored base; their verdicts are live, not archival.
> Later commits lost to the same rollback (`90103db`, `08f6287`, `3e4d57b`,
> `29ff044`) are documented in the worklog reconstruction note.
