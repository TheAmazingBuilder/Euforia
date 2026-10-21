# Audit record — t30: System → Integrations — connection catalog with simulated connect/disconnect

- **Date**: 2026-09-26
- **Verdict**: PASS
- **Commit**: `43fe93d`

## Scope
- Contract integration.ts: Integration (category broker|data|automation|productivity, status connected|disconnected, connectedAt nullable, honest detail), IntegrationsResponse, IntegrationToggleResponse.
- Mock: store.listIntegrations() — 6 seeded (Deriv demo connected; IBKR/Binance/TradingView/Telegram/Google Calendar disconnected); store.toggleIntegration(id) — flip + timestamp, MockError 404; MSW GET /integrations + POST /integrations/:id/toggle, endpoints.integrations(+toggle), keys.integrations, hooks useIntegrations/useToggleIntegration (invalidation).
- Nav: INTEGRATIONS (Cable) in System after Monitoring.
- UI: (app)/integrations + integrations-view.tsx — ruled rows grouped by category (ledger labels), Connected (profit) / Not connected (muted) pill + 'since …', description + honest mono demo detail, Connect (default) / Disconnect (outline) with spinner, 'N of M connected' counter, honest note 'no keys are exchanged'.

## Ritual results
tsc shared 0, tsc app 0, eslint 0 · Desktop 1440 dark+light: '1 OF 6 CONNECTED' → Connect IBKR → '2 OF 6' + CONNECTED + Disconnect button → Disconnect → back to '1 OF 6' · counter, toasts · Mobile 390 light sw=iw · console clean.

## Evidence
- `apps/web/scripts/shots/t30/ (3 PNG)`

## Notes
Six connections catalogued; honest simulated state switch, announced as such.
