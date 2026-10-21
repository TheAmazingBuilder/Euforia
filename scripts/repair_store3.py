#!/usr/bin/env python3
"""Store + fixtures fixes (round 3 — v2)."""
from pathlib import Path

STORE = Path("/home/z/my-project/apps/web/src/mocks/store.ts")
src = STORE.read_text()

def rep(old, new, n=1):
    global src
    assert old in src, f"STORE ANCHOR NOT FOUND: {old[:90]!r}"
    src = src.replace(old, new, n)

# 1. duplicate `type Account,` import (mine) — remove the second occurrence
first = src.find("  type Account,\n")
second = src.find("  type Account,\n", first + 1)
assert second != -1
src = src[:second] + src[second + len("  type Account,\n"):]

# 2. missing type imports: Toggle responses
if "type ToggleLikeResponse," not in src:
    rep("""  type ToggleIntegrationResponse,
} from "@cosmoz/shared";""",
"""  type ToggleIntegrationResponse,
  type ToggleLikeResponse,
  type ToggleFollowResponse,
} from "@cosmoz/shared";""")

# 3. ext block: drop my redeclarations — the store already defines
#    instrumentById / closedTrades in the same scope.
ext_idx = src.find("// ═══ RESTORED DOMAINS (Academy-save wiring) ═══")
assert ext_idx != -1
head, ext = src[:ext_idx], src[ext_idx:]
for decl in (
    "const instrumentById = new Map(data.instruments.map((instrument) => [instrument.id, instrument]));\n",
    "const closedTrades = (): Trade[] =>\n  data.trades.filter((trade) => trade.status === \"CLOSED\" && !trade.deletedAt);\n",
):
    if decl in ext:
        ext = ext.replace(decl, "", 1)
# strategyById may also already exist — check head
if "const strategyById = new Map(" in head:
    ext = ext.replace(
        "const strategyById = new Map(data.strategies.map((strategy) => [strategy.id, strategy]));\n", "", 1)
src = head + ext

# 4. roundDigits helper inside restored block
rep_anchor = "// ── local small helpers ──────────────────────────────────────────────────────"
idx = src.find(rep_anchor, ext_idx)
assert idx != -1
if "const roundDigits = (value: number, digits: number): number" not in src[idx:idx+400]:
    src = src[:idx] + rep_anchor + """
const roundDigits = (value: number, digits: number): number =>
  Number(value.toFixed(digits));
""" + src[idx + len(rep_anchor):]

# 5. connection status ACTIVE → CONNECTED
src = src.replace('status: index === 0 ? "ACTIVE" : "ACTIVE"', 'status: "CONNECTED"', 1)
src = src.replace('status: "ACTIVE",\n    autoImport: input.autoImport,', 'status: "CONNECTED",\n    autoImport: input.autoImport,', 1)
src = src.replace('connections.filter((c) => c.status === "ACTIVE").length', 'connections.filter((c) => c.status === "CONNECTED").length')

# 6. candle source "SIM" → "sim"
src = src.replace('return { symbol, timeframe, source: "SIM", candles };', 'return { symbol, timeframe, source: "sim", candles };', 1)

# 7. SocialTrader.following is boolean
src = src.replace('followers: 128, following: 41 }', 'followers: 128, following: true }', 1)
src = src.replace('followers: 342, following: 12 }', 'followers: 342, following: false }', 1)
src = src.replace('followers: 87, following: 66 }', 'followers: 87, following: false }', 1)
src = src.replace('followers: 219, following: 30 }', 'followers: 219, following: false }', 1)

# 8. SocialMe has no `following` field
src = src.replace("  followers: 12,\n  following: 34,\n", "  followers: 12,\n", 1)

# 9. Instrument literal in commitCsvImport needs full shape
src = src.replace(
    "        data.instruments.push({ id: instrumentId, userId: user.id, symbol: row.symbol, name: row.symbol, assetClass: \"FOREX\", digits: 5 } as Instrument);",
    """        data.instruments.push({
          id: instrumentId,
          userId: user.id,
          symbol: row.symbol,
          name: row.symbol,
          assetClass: "FOREX",
          quoteCurrency: mainAccount.currency,
          pipSize: "0.0001",
          digits: 5,
          contractSize: "1",
          isActive: true,
        });""", 1)

# 10. goalProgress rows → correct GoalProgressRow shape (+ availableMonths)
old_rows = """  const rows: GoalProgressRow[] = [
    { key: "monthlyPnl", label: "Monthly net P&L", target: num(goalSettingsState.monthlyPnlTarget), actual: round2(netPnl), progress: round2(Math.max(0, netPnl) / Math.max(1, num(goalSettingsState.monthlyPnlTarget))), status: statusFor(Math.max(0, netPnl) / Math.max(1, num(goalSettingsState.monthlyPnlTarget))) },
    { key: "winRate", label: "Win rate", target: goalSettingsState.winRateTargetPct, actual: round2(winRate), progress: round2(Math.min(1, winRate / Math.max(1, goalSettingsState.winRateTargetPct))), status: statusFor(winRate / Math.max(1, goalSettingsState.winRateTargetPct)) },
    { key: "avgR", label: "Average R", target: num(goalSettingsState.avgRTarget), actual: round2(avgR), progress: round2(Math.max(0, avgR) / Math.max(0.01, num(goalSettingsState.avgRTarget))), status: statusFor(Math.max(0, avgR) / Math.max(0.01, num(goalSettingsState.avgRTarget))) },
    { key: "greenDays", label: "Green days", target: goalSettingsState.greenDaysTarget, actual: greenDays, progress: round2(Math.min(1, greenDays / Math.max(1, goalSettingsState.greenDaysTarget))), status: statusFor(greenDays / Math.max(1, goalSettingsState.greenDaysTarget)) },
    { key: "discipline", label: "Discipline", target: goalSettingsState.disciplineTargetPct, actual: round2(discipline), progress: round2(Math.min(1, discipline / Math.max(1, goalSettingsState.disciplineTargetPct))), status: statusFor(discipline / Math.max(1, goalSettingsState.disciplineTargetPct)) },
    { key: "maxTradesPerDay", label: "Max trades / day", target: goalSettingsState.maxTradesPerDay, actual: worstDayTrades, progress: round2(Math.min(1, worstDayTrades / Math.max(1, goalSettingsState.maxTradesPerDay))), status: worstDayTrades > goalSettingsState.maxTradesPerDay ? "OFF_TRACK" : "ON_TRACK" },
  ];"""
new_rows = """  const ratio = (current: number, target: number): number =>
    target > 0 ? Math.min(1, Math.max(0, current) / target) : 0;
  const rows: GoalProgressRow[] = [
    { key: "monthlyPnl", label: "Monthly net P&L", note: null, target: num(goalSettingsState.monthlyPnlTarget), actual: round2(netPnl), pct: round2(ratio(netPnl, num(goalSettingsState.monthlyPnlTarget)) * 100), higherIsBetter: true, status: statusFor(ratio(netPnl, num(goalSettingsState.monthlyPnlTarget))) },
    { key: "winRate", label: "Win rate", note: null, target: goalSettingsState.winRateTargetPct, actual: round2(winRate), pct: round2(ratio(winRate, goalSettingsState.winRateTargetPct) * 100), higherIsBetter: true, status: statusFor(ratio(winRate, goalSettingsState.winRateTargetPct)) },
    { key: "avgR", label: "Average R", note: null, target: num(goalSettingsState.avgRTarget), actual: round2(avgR), pct: round2(ratio(avgR, num(goalSettingsState.avgRTarget)) * 100), higherIsBetter: true, status: statusFor(ratio(avgR, num(goalSettingsState.avgRTarget))) },
    { key: "greenDays", label: "Green days", note: null, target: goalSettingsState.greenDaysTarget, actual: greenDays, pct: round2(ratio(greenDays, goalSettingsState.greenDaysTarget) * 100), higherIsBetter: true, status: statusFor(ratio(greenDays, goalSettingsState.greenDaysTarget)) },
    { key: "discipline", label: "Discipline", note: null, target: goalSettingsState.disciplineTargetPct, actual: round2(discipline), pct: round2(ratio(discipline, goalSettingsState.disciplineTargetPct) * 100), higherIsBetter: true, status: statusFor(ratio(discipline, goalSettingsState.disciplineTargetPct)) },
    { key: "maxTradesPerDay", label: "Max trades / day", note: null, target: goalSettingsState.maxTradesPerDay, actual: worstDayTrades, pct: round2(goalSettingsState.maxTradesPerDay > 0 ? Math.min(100, (worstDayTrades / goalSettingsState.maxTradesPerDay) * 100) : 0), higherIsBetter: false, status: worstDayTrades > goalSettingsState.maxTradesPerDay ? "OFF_TRACK" : "ON_TRACK" },
  ];"""
assert old_rows in src, "goalProgress rows anchor missing"
src = src.replace(old_rows, new_rows, 1)
src = src.replace("    months: monthsWithData(),", "    availableMonths: monthsWithData(),", 1)

# 11. riskOverview events: RuleViolation fields (occurredAt, rule lookup)
old_events = """  const events: RiskOverviewResponse["events"] = [
    ...data.ruleViolations.slice(0, 6).map((violation) => ({
      id: violation.id,
      kind: "VIOLATION" as const,
      severity: violation.severity,
      title: `Rule violation — ${violation.ruleId.slice(0, 8)}`,
      message: violation.detail ?? "A standing risk rule was breached.",
      createdAt: violation.createdAt,
      acknowledgedAt: violation.acknowledgedAt,
    })),
    ...data.alerts
      .filter((alert) => alert.kind === "RISK")
      .slice(0, 4)
      .map((alert) => ({
        id: alert.id,
        kind: "ALERT" as const,
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        createdAt: alert.createdAt,
        acknowledgedAt: alert.readAt,
      })),
  ];"""
new_events = """  const ruleById = new Map(data.rules.map((rule) => [rule.id, rule]));
  const events: RiskOverviewResponse["events"] = [
    ...data.ruleViolations.slice(0, 6).map((violation) => ({
      id: violation.id,
      kind: "VIOLATION" as const,
      severity: ruleById.get(violation.ruleId)?.severity ?? ("WARN" as const),
      title: `Rule violation — ${ruleById.get(violation.ruleId)?.type ?? "risk rule"}`,
      message: violation.userNote ?? "A standing risk rule was breached.",
      createdAt: violation.occurredAt,
      acknowledgedAt: violation.acknowledgedAt,
    })),
    ...data.alerts
      .filter((alert) => alert.type === "RISK_BUDGET" || alert.type === "TILT_WARNING")
      .slice(0, 4)
      .map((alert) => ({
        id: alert.id,
        kind: "ALERT" as const,
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        createdAt: alert.createdAt,
        acknowledgedAt: alert.readAt,
      })),
  ];"""
assert old_events in src, "risk events anchor missing"
src = src.replace(old_events, new_events, 1)

# 12. coachWeeklyReport violations: use occurredAt
src = src.replace(
    "    const ts = Date.parse(`${toTradingDateKey(v.createdAt, USER_TZ)}T00:00:00Z`);",
    "    const ts = Date.parse(`${toTradingDateKey(v.occurredAt, USER_TZ)}T00:00:00Z`);", 1)

# 13. weeklyReport insights: disciplineAvg is a number already
src = src.replace(
    '        tone: num(String(disciplineAvg)) >= 70 ? "positive" : "negative",',
    '        tone: disciplineAvg >= 70 ? "positive" : "negative",', 1)

STORE.write_text(src)
print("store.ts round-3 patched OK")
