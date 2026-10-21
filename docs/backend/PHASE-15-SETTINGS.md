# PHASE 15 — Settings Bounded Context

> Status: IMPLEMENTED & VERIFIED (see the phase report in the conversation for
> fresh evidence). Phase 15 mandate: Settings, Preferences & User Configuration.

## 1. What Settings owns

Settings owns ONE aggregate: the **9-domain user preferences document** — how
the user prefers Cosmoz to behave and display information:

| Domain | Purpose |
|---|---|
| `trading` | journaling defaults: default account reference, asset class, instrument, timeframe, session, display currency, direction, position type, RR display, chart, session cap, soft-lock threshold |
| `risk` | Rules-Engine DEFAULTS (1% comfort / 2% ceiling / 3% daily stop…) — they seed rule params, they enforce nothing by themselves |
| `journal` | required fields, screenshot / pre-trade / post-review gates, emotion tracking, templates, review reminders |
| `notifications` | per-category (7) × per-event channel matrix (inApp/email/push) + quiet hours |
| `appearance` | theme mirror (source of truth: next-themes), density, dashboard layout, P&L display |
| `dashboard` | widget order (bounded to the 7 canonical keys, Phase 15 §19) |
| `academy` | learning module preferences (provisioned ahead of the module) |
| `privacy` | usage analytics, diagnostics, profile visibility, product emails |
| `localization` | language, timezone MIRROR, date/time/number formats, currency display, week start |

Single source of truth rules (shared `settings.ts` header):

- **Timezone**: ONE source of truth = Profile (`PATCH /me`). The localization
  domain mirrors it; the settings UI writes it through `/me`, never directly.
  Server-side consumers (trading-day keys) read the profile value.
- **Theme**: runtime source of truth = next-themes (client); the doc mirrors
  for multi-device sync.
- **Risk preferences** are defaults for the Rules Engine, never enforcement.

## 2. What Settings does NOT own (§42)

- authentication, passwords, MFA, sessions, security center (Identity/Auth/Security)
- identity fields: name, email, username, bio, avatar (Profile = Identity)
- trading accounts and broker connections (Accounts) — Settings holds a
  **validated reference only** (`defaultAccountId`, ownership-checked §21)
- integrations, API keys, broker credentials (Integrations/Connectivity)
- trades, analytics, calendar events, academy content, notes
- monitoring / system health (Monitoring)
- system configuration (§6) — no `GET /settings/config` exists and none will;
  environment variables never cross the Settings API

## 3. Module structure

```
apps/api/src/modules/settings/
├── settings.module.ts      # bounded context wiring (Prisma, Identity, Accounts, SecurityEvent)
├── settings.controller.ts  # thin HTTP boundary: GET /me/preferences, PATCH /:domain, POST /reset
├── settings.service.ts     # application use cases + security model
└── settings.logic.ts       # pure document assembly (unit-tested invariants)
```

Wiring in `app.module.ts`: registered right after `IdentityModule` and
`AccountsModule`, before `TradesModule`.

## 4. Data model (§28 — evolve, don't duplicate)

**No new table, no migration.** The document persists in the existing
`User.preferences` JSON column (one document per user, provisioned lazily on
first read from `DEFAULT_USER_PREFERENCES`). Every write:

1. validates the incoming domain payload against the per-domain Zod schema
   (`@cosmoz/shared`, unknown fields stripped = safely ignored);
2. strips the server-managed envelope (`userId`, `updatedAt`) from the payload
   (defense-in-depth, §31/§32);
3. merges ONE domain into the doc (siblings verbatim, §39);
4. re-validates the FULL document (`userPreferencesSchema`) before persisting;
5. writes through IdentityRepository's narrow preferences contract —
   `updatePreferences` (single column) or `updatePreferencesWithTimezone`
   (atomic two-column write, §29.6) — Identity stays the only writer of the
   `User` table (ADR-0003).

## 5. API contracts (frontend parity §34)

Wire paths unchanged from the pre-extraction implementation:

| Method | Path | Semantics |
|---|---|---|
| GET | `/api/v1/me/preferences` | full doc (9 domains + envelope), 200; lazily provisioned on first read with the profile's timezone mirrored |
| PATCH | `/api/v1/me/preferences/:domain` | whole-domain replace (frontend contract); returns the FULL doc; 200 |
| POST | `/api/v1/me/preferences/reset` | `{ domain }` → restore ONE domain's defaults; 200 |

No `POST /settings`, no `DELETE /settings`, no `:userId` route (§10) —
ownership always derives from the authenticated principal (global JWT guard).

Error semantics (§35, shared taxonomy): 400 `ValidationError` (+ issues) for
invalid domain/payloads, 404 `NotFound` + `DEFAULT_ACCOUNT_NOT_FOUND` for a
foreign/unknown default account (repo-wide IDOR convention), 401
`Unauthorized` unauthenticated. Error code register:
`SETTINGS_ERROR_CODES` in `@cosmoz/shared`.

## 6. Security model (§31/§32/§33/§11)

- authentication: global JWT guard (no `@Public` on the module)
- ownership: from the token only; the document is a per-user singleton keyed
  by the principal — no client-supplied user identifiers exist
- mass-assignment: Zod strip + explicit envelope stripping; privileged state
  (role, permissions, status, baseCurrency…) is structurally unreachable
- default account reference (§21): `defaultAccountId` must resolve through
  `AccountsRepository.findAccountForUser(accountId, userId)` — foreign or
  unknown → 404; the account row itself is never mutated
- IDOR: structurally impossible by route shape (no resource id in the path);
  covered by e2e tests (payload planting, forged ids, uuid-as-domain)
- audit (§33): a privacy `profileVisibility` change records
  `SENSITIVE_SETTINGS_CHANGED` into the shared SecurityEvent ledger (single
  audit system); cosmetic preference changes stay noise-free (§40)

## 7. Default / reset semantics (§37)

`reset` = restore ONE domain's defaults. Never touches: user identity,
authentication, sessions, trading accounts, trades, integrations. Reset of
`localization` also writes the domain-default timezone through to the profile
(mock parity with `apps/web` MSW; NOTE — this contradicts the UI copy
"your timezone is untouched", a documented product divergence listed in the
phase report's known limitations).

## 8. Cross-domain relationships (§24)

| Consumer | Reads |
|---|---|
| frontend | full doc — theme/density/locale boot sync, trading form defaults, session timer cap, dashboard widget order |
| Rules Engine (future) | `risk` domain as rule-param defaults |
| Alerts (future) | `notifications` domain for channel gating |

No domain events emitted (§25 — zero concrete consumers today; ADR-0002).
No caching (§26 — single-row read by primary key; no cache infrastructure
exists to reuse; adding one would be speculative).

## 9. Deferred

- Privacy/telemetry honoring (usageAnalytics/crashDiagnostics are stored
  preferences; actual telemetry plumbing arrives with its own phase)
- Notification delivery (Nofy) and its preference interactions
- The `revealAnimation` client-only preference (`cosmoz:preferences:v1`
  localStorage) stays out of the server doc by design
- Localization-reset timezone copy divergence (product decision pending)
