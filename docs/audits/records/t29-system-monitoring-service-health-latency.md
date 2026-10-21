# Audit record — t29: System → Monitoring — service health, latency window, incident log

- **Date**: 2026-09-26
- **Verdict**: PASS
- **Commit**: `490b123`

## Scope
- Contract systemHealth.ts: SystemService (status operational|degraded|down|maintenance, latencyMs, uptimePct, honest detail), SystemIncident (severity minor|major|maintenance, resolvedAt nullable), SystemHealth (latencySeries + windowLabel + checkedAt).
- Mock: store.getSystemHealth() — deterministic 60-point latency walk (sin/cos, stable across loads), 3 services (Cosmoz API / Market data feed / Broker link) with honest demo details ('no real server is probed', 'synthetic quote stream', 'read-only demo broker'), 2 resolved incidents; MSW GET /system/health (handlers/system.ts), endpoints.systemHealth, keys.systemHealth, hook useSystemHealth.
- Nav: MONITORING (Gauge) in System after Settings — SIDEBAR_ITEMS/palette/titles derive automatically.
- UI: (app)/monitoring + monitoring-view.tsx — 'All systems operational' banner (worst status), ruled rows (StatusPill dot profit/warning/loss/accent, latency + uptime mono, muted detail), ECharts accent area graph (getChartTheme, mono tooltip), incident log (severity badges, timestamps, Resolved/Ongoing), 'Checked … — demo build' annotation.

## Ritual results
tsc shared 0, tsc app 0 (fixed EChart required ariaLabel), eslint 0 · Desktop 1440 dark+light: 'All systems operational', 3 services, 2 incidents, graph rendered · Mobile 390 light+dark sw=iw · console clean.

## Evidence
- `apps/web/scripts/shots/t29/ (4 PNG)`

## Notes
System > Monitoring delivered — the cockpit's health, honest about its demo nature.
