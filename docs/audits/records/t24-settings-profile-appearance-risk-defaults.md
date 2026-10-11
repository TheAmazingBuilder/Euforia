# Audit record — t24: Settings — profile, appearance, risk defaults, accounts, data & backup

- **Date**: 2026-09-26
- **Verdict**: PASS* (Turbopack incident fixed by clean restart)
- **Commit**: `c75f25f`

## Scope
- Shared contract settingsRisk.ts: RiskDefaults (riskPerTradePct/maxDailyLossPct decimal strings + maxTradesPerDay int).
- Mock: store.riskDefaults (0.5%/2%/3), get/update, MSW GET/PATCH /settings/risk, endpoints.settingsRisk, keys, hooks useRiskDefaults/useUpdateRiskDefaults.
- UI: settings-view replaces PagePlaceholder — ruled hairline sections (reusable Section, no cards-in-cards): Profile (name/email/timezone via PATCH /me, seed via adjust-during-render), Appearance (3 theme buttons with dots + aria-pressed, active = ink block), Risk defaults (3 numeric inputs + validation), Accounts (read-only table from /accounts, default badge), Data & backup (BackupCard kept), Sign out. Toasts on each save.

## Ritual results
tsc 0, eslint 0, impeccable detector [] · Desktop 1440: profile edited 'Alex Trader' → toast + server persistence (avatar AT updated), risk 0.75% persists (GET verified via UI), Light switch from Appearance → data-theme=light + paper background → back to dark-blue · Mobile 390 dark + light sw=iw · 0 page errors.

## Evidence
- `apps/web/scripts/shots/t24/ (5 PNG)`

## Notes
Turbopack stale RSC manifest after page rewrite — resolved by clean .next restart; documented as part of the pass.
