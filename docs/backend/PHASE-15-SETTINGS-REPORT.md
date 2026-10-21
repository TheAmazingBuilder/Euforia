# COSMOZ — Backend Phase 15 Report

## Settings, Preferences & User Configuration

Status: **COMPLETED** · Date: 2026-10-04 · Branch state: typecheck ✓ / lint ✓ / tests 722/722 ✓ / build ✓ / migrations ✓ (dev + fresh replay) / real smoke ✓

---

## 1. Repository Findings (audit-first)

Phase 15 opened with a full read-only audit (prompt §1 rules 1–10). Findings that shaped the design:

| Setting surface found | Classification | Decision |
|---|---|---|
| Identity → `AccountService.getPreferences/updatePreferencesDomain/resetPreferencesDomain` + 3 routes in `MeController` (Phase 2 "profile & prefs" stub) | **MISPLACED OWNERSHIP** (§3: Settings ≠ Identity) | **Extracted** to the new Settings bounded context — same paths, same payloads, same response shapes (frontend contract untouched). |
| Persistence → `User.preferences Json?` column | **STRUCTURE EXISTS** | **Evolved** (§28, not duplicated): docs migrated verbatim to a dedicated `UserSettings` table owned by Settings; column dropped in the same migration. |
| Shared contracts → `schemas/settings.ts` (9 domains, `DEFAULT_USER_PREFERENCES`, boundary rules incl. "timezone ONE source of truth: Profile") | **REUSABLE INFRASTRUCTURE** | Consumed verbatim — **zero `@cosmoz/shared` changes**. |
| Frontend Settings (10 categories, 9 preference domains, `PATCH /me/preferences/:domain` per card, preferences backup import loop, dashboard `widgetOrder`, session timer `sessionMaxDurationMin`, language selector) | **SPEC OF BEHAVIOUR** | Every endpoint the frontend calls is served; every field validates against the shared schemas (mock-parity). |
| Calendar → read `user?.preferences` via `IdentityRepository` (Phase 13 seam) | **CROSS-MODULE COUPLING** | Re-pointed to the Settings **public read port** (`SettingsService.readPreferences`) — no consumer reaches into the User row anymore. |
| Identity → `SecurityEventService` (`SENSITIVE_SETTINGS_CHANGED`), `IdentityRepository` (profile write-through) | **REUSABLE INFRASTRUCTURE** | Reused — no second audit system (§33), no second identity surface. |
| `POST /me/deactivate`, `POST /me/delete` (Phase 2, tested) | **ALREADY OWNED BY IDENTITY** | Left untouched (§46 — do not reimplement previous phases). |
| Caching / domain events / notification delivery | **NO CONCRETE CONSUMER** | Not introduced (§25/§26 — documented deferral). |
| `revealAnimation` (client-only localStorage `cosmoz:preferences:v1`) | **PER-DEVICE UI STATE** | Left client-only; documented as a candidate if server persistence is ever productized. |

## 2. Existing Settings Functionality Reused

- **Contracts**: `userPreferencesSchema`, the 9 per-domain schemas, `preferenceDomainSchema`, `resetPreferencesInputSchema`, `DEFAULT_USER_PREFERENCES` — all from `@cosmoz/shared`.
- **Infrastructure**: `ZodValidationPipe`, global `JwtAuthGuard` + ThrottlerGuard, error taxonomy (`AppError` family), `AllExceptionsFilter` (ZodError → 400 with issues), pino logging with correlation IDs, `SecurityEventService`.
- **Behaviour**: per-domain save semantics ("unrelated settings are NEVER saved together"), full-doc response, reset-per-domain, typed confirmations for account actions — all Phase 2/mock behaviour, preserved verbatim.

## 3. New Settings Functionality Implemented

- **Bounded context** `apps/api/src/modules/settings/` (domain / infrastructure / service / controller / module), following the repo's flat-services convention (no ceremonial DDD).
- **Dedicated table** `UserSettings` (1:1 per user, singleton doc aggregate) with ownership moved out of the User row.
- **Row-locked domain updates** (§36): `SELECT … FOR UPDATE` inside a transaction — concurrent patches on different domains can never lose an update (multi-tab safety) without inventing a version protocol the frontend does not speak.
- **Read-side timezone mirror** (§15): `User.timezone` (Identity) is the ONE source of truth; the doc's `localization.timezone` is overridden to the profile value on EVERY read — the stale-mirror incoherence of the Phase 2 stub (doc said America/Toronto while the profile said UTC) is structurally eliminated.
- **Default-account ownership check** (§21): `trading.defaultAccountId` must reference an account of the authenticated user (via `AccountsRepository.findAccountForUser`) — 404 otherwise; the account row is never mutated.
- **Audit triage** (§33): timezone / privacy / default-account changes append `SENSITIVE_SETTINGS_CHANGED` to the existing append-only log; cosmetic domains do not.
- **Mass-assignment protection by contract** (§31/§32): strict zod objects strip unknown keys — `role`, `isAdmin`, `permissions`, `passwordHash`, `userId` in a body can never reach the doc.
- **Self-healing reads**: a corrupted stored doc is rebuilt from safe defaults (warn logged) instead of 500-ing the settings screen.

## 4. Final Domain Boundary

```text
Identity/Auth  → owns identity, authentication, sessions, profile (User.timezone), deactivation/deletion
Accounts       → owns trading connectivity (Settings stores a REFERENCE: defaultAccountId)
Calendar       → owns economic events (reads the risk guard through the Settings port)
Integrations   → owns external services & credentials (never stored in Settings)
Settings       → owns the 9-domain user preferences document — THIS PHASE
Monitoring     → future — owns operational observability
```

Settings does NOT own: authentication, authorization, trading accounts, broker connections, integrations, trades, analytics, calendar events, notes, academy content, monitoring, system configuration. No environment variable or server config is exposed through the Settings API (§6 — no `GET /settings/config` surface exists).

## 5. Database Changes

- New model `UserSettings` (PK = `userId`, FK → `User` ON DELETE CASCADE, `preferences Json`, timestamps).
- Migration `20261004100000_settings_preferences`: CREATE TABLE → **data backfill** (6 existing docs copied verbatim) → FK → DROP `User.preferences`. Reversible at the data level (re-adding the column from `UserSettings` restores the Phase 2 shape). No other schema object touched (§28).
- Verified: `prisma validate` ✓, `migrate deploy` on dev ✓, **fresh-database replay** (dropped `cosmoz_test`, global-setup re-applied all 13 migrations from zero) ✓.

## 6. API Endpoints / Contracts

Routes unchanged (frontend `apiPaths` verbatim — now served by `SettingsController`):

| Endpoint | Semantics |
|---|---|
| `GET /api/v1/me/preferences` | Full doc, provisioned lazily from safe defaults; envelope `userId` = principal |
| `PATCH /api/v1/me/preferences/:domain` | Replaces ONE validated domain (body = the whole domain object); response = FULL doc; unknown fields stripped |
| `POST /api/v1/me/preferences/reset` | `{domain}` → restores that domain to `DEFAULT_USER_PREFERENCES` |

Error semantics (existing conventions): 400 `ValidationError` (unknown domain, partial body, invalid enum/IANA/refine), 401 (unauthenticated), 404 (referenced default account missing or not owned), 409/422 reserved by the shared taxonomy. Profile + deactivate/delete remain on Identity's `MeController`.

## 7. Security Model

- **Authentication**: global JWT guard — the three routes are 401 without credentials.
- **Ownership (§10/§11)**: the doc is keyed by the authenticated principal only; no route accepts a client-supplied userId; a forged `userId` in the body is stripped.
- **IDOR**: user B reads defaults, never user A's doc; cross-user `defaultAccountId` → 404 without leaking the account's existence.
- **Mass-assignment (§32)**: validated DTO → explicit domain merge → allowed fields only; privileged-field injection tests (role/permission/`isAdmin`/`passwordHash`/auth-state) all pass.
- **Audit (§33)**: sensitive triage integrates with the append-only `SecurityEvent` log (`SENSITIVE_SETTINGS_CHANGED`), actor = user email, human-safe context.
- **No secrets**: the doc schema cannot carry credentials (no such fields exist); unknown fields are stripped, not merged.

## 8. Cross-Domain Dependencies

```text
SettingsService (public read port, exported)
    ↑ CalendarModule — risk guard via readPreferences() (replaces the Phase 13 User-row seam)

SettingsModule (imports, read/write through public contracts only)
    → IdentityModule  — profile-timezone write-through + SecurityEventService audit
    → AccountsModule  — default-account ownership check (read-only)
```

No direct Prisma access across modules; no events without consumers (§25); no second preferences/notification/audit/cache system (§1 rules 19–20, §33).

## 9. Tests Executed

| Suite | Count | Result |
|---|---|---|
| Unit — `settings-rules.spec.ts` (defaults, merge, reset scoping, invariants, audit triage, read mirror) | 14 | ✓ |
| e2e — `settings.e2e.spec.ts` (auth 401 battery, provisioning, per-domain semantics, mass-assignment, IDOR, default-account 404s, write-through both directions, reset scoping, validation battery, concurrency race, audit triage) | 17 | ✓ |
| **Full regression** (42 files — all Phase 0–14 suites incl. the pre-existing preferences battery in `security.e2e`) | **722** | **✓ 722/722** |
| Runtime smoke — `scripts/smoke-phase15.mjs` (real server, real DB, real HTTP: boot→health→register→verify→login→provision→PATCH+write-through→strip check→400 battery→reset→deactivate) | 21 steps | ✓ ALL GREEN |

## 10. Verification Results

- `tsc --noEmit` (typecheck) ✓ · `eslint` ✓ · `tsc -p tsconfig.build.json` (build) ✓
- `prisma validate` ✓ · `prisma migrate deploy` (dev) ✓ · fresh-database replay (all 13 migrations, test DB rebuilt from zero) ✓ · `prisma generate` ✓
- API startup + `/health` ✓ · settings routes authenticated ✓ · frontend compatibility: routes/shapes exercised by the unchanged frontend contract and the untouched pre-existing e2e battery ✓
- Not executed: browser-level click-through of the web app against the real API (frontend unchanged and out of scope; contract parity is covered server-side and by mock parity).

## 11. Known Limitations

1. **Quiet-hours values** — the shared contract validates the `HH:MM` *format* (regex), not hour/minute ranges (`"25:99"` parses; mock parity). Strengthening the shared schema is a contract change affecting web+API and was deliberately out of scope.
2. **Default instrument / asset class** — existence is not verified against the instrument catalogue (the prompt scopes verification to the default *account*; the catalogue is global, not user-scoped).
3. **Timezone mirror in the stored doc** — kept for the shared schema's shape but always overridden at read time; harmless by construction.
4. **Concurrent same-domain patches** remain last-write-wins per field group (the UI contract has no version protocol — §36 "do not introduce complexity if the UI does not require it").

## 12. Deferred Work

- **Notification delivery** — the 7×events×3-channels matrix + quiet hours are stored now; honoring them belongs to the future delivery service (§22 — no email/push infrastructure introduced).
- **Rules Engine server-side propagation** — `risk.syncWithRulesEngine` gates the frontend's explicit "Apply limits" action (POST/PATCH /rules); no automatic server-side upsert was invented (§20 — preferences are defaults, never enforcement).
- **Preferences import endpoint** — the frontend composes backup/restore client-side from the same per-domain PATCHes; no dedicated endpoint exists and none was invented.
- **`revealAnimation`** server persistence (client-only per-device state today).
- **Phase 9 — Backtesting: remains DEFERRED** (frontend/product module does not exist — roadmap status maintained, §47).

## Definition of Done — Confirmation (§45)

- Settings owns ONLY user preferences ✓ · one user cannot access another's settings ✓ (tested)
- Settings cannot mutate roles/permissions/authentication/integrations ✓ (stripping tested)
- A preference cannot mutate canonical trading/financial data ✓ (reference-only default account; no financial fields in the doc)
- Default-account selection is a verified reference, never ownership ✓ (§21 flow + untouched account row)
- Credentials are completely outside Settings ✓ · system/environment configuration stays out of user Settings ✓
- No second notification/audit/auth/cache/configuration system ✓ · contracts explicit and shared-validated ✓ · Prisma model = singleton doc table owned by the context ✓ · concurrency handled per actual frontend behaviour ✓ · ownership & mass-assignment vulnerabilities covered by tests ✓

**STOP AFTER PHASE 15.**
