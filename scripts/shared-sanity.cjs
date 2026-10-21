// Temporary sanity checks for @cosmoz/shared (Phase 2 verification).
// Run after compiling: tsc src/index.ts --outDir .sanity --module commonjs ...
const assert = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra ? " → " + extra : ""}`);
  if (!cond) process.exitCode = 1;
};

const s = require("../.sanity-shared/index.js");

// NOTE: Node ICU uses NARROW NO-BREAK SPACE (U+202F) in fr-FR formatting → match with \s
// money
assert("formatMoney USD", /^1\s234,50\s\$US$/.test(s.formatMoney("1234.5", "USD")), s.formatMoney("1234.5", "USD"));
assert("formatSignedMoney neg", s.formatSignedMoney("-150.25", "USD").startsWith("-150,25"), s.formatSignedMoney("-150.25", "USD"));
assert("formatSignedMoney zero", s.formatSignedMoney("0", "EUR").startsWith("+0"), s.formatSignedMoney("0", "EUR"));
assert("parseDecimal ok", s.parseDecimal("12.34") === 12.34);
assert("parseDecimal junk", s.parseDecimal("abc") === null);
assert("parseDecimal exponent rejected", s.parseDecimal("1e5") === null);
assert("parseDecimal empty", s.parseDecimal("") === null);
assert("toDecimalString artifact", s.toDecimalString(0.1 + 0.2) === "0.3", s.toDecimalString(0.1 + 0.2));
assert("toDecimalString -0", s.toDecimalString(-0) === "0");

// risk
const rrBuy = s.computeRR("1.1000", "1.0950", "1.1150", "BUY");
assert("computeRR BUY 1:3", rrBuy !== null && Math.abs(rrBuy - 3) < 1e-9, String(rrBuy));
assert("computeRR SELL stop below entry → null", s.computeRR("1.1000", "1.0950", "1.1150", "SELL") === null);
assert("computeRR SELL bad target → negative", s.computeRR("1.1000", "1.1050", "1.1150", "SELL") < 0, String(s.computeRR("1.1000", "1.1050", "1.1150", "SELL")));
assert("computeRiskAmount 250$ (50 pips × 0.5 lot)", s.computeRiskAmount("1.1000", "1.0950", "0.5", "100000") === "250", s.computeRiskAmount("1.1000", "1.0950", "0.5", "100000"));
const sps = s.suggestPositionSize("1.1000", "1.0950", "1", "10000", { pipSize: "0.0001", contractSize: "100000" });
assert("suggestPositionSize 0.2 lots", sps !== null && sps.quantity === "0.2", JSON.stringify(sps));
assert("suggestPositionSize riskAmount 100", sps !== null && sps.riskAmount === "100", JSON.stringify(sps));
assert("suggestPositionSize stopPips 50", sps !== null && sps.stopPips === "50", JSON.stringify(sps));
assert("suggestPositionSize risk ≤ budget", sps !== null && Number(sps.riskAmount) <= 100, JSON.stringify(sps));
assert("pnlForExit BUY", s.pnlForExit({ entry: "1.1000", exit: "1.1050", direction: "BUY", quantity: "0.5", contractSize: "100000", fees: "3.2" }) === "246.8", s.pnlForExit({ entry: "1.1000", exit: "1.1050", direction: "BUY", quantity: "0.5", contractSize: "100000", fees: "3.2" }));
assert("pnlForExit SELL", s.pnlForExit({ entry: "1.1000", exit: "1.0950", direction: "SELL", quantity: "1", contractSize: "100000", swap: "-0.5" }) === "500.5", s.pnlForExit({ entry: "1.1000", exit: "1.0950", direction: "SELL", quantity: "1", contractSize: "100000", swap: "-0.5" }));

// format
assert("formatR +1.20R", s.formatR("1.2") === "+1.20R");
assert("formatR -0.85R", s.formatR("-0.85") === "-0.85R");
assert("formatR junk", s.formatR("x") === "-");
assert("formatPrice digits", /^2\s450,12$/.test(s.formatPrice("2450.123", 2)), s.formatPrice("2450.123", 2));
assert("formatDuration 2h14", s.formatDuration("2026-01-01T10:00:00Z", "2026-01-01T12:14:00Z") === "2h14");
assert("formatDuration 45m", s.formatDuration("2026-01-01T10:00:00Z", "2026-01-01T10:45:00Z") === "45m");
assert("formatPercent ratio", /^55,4\s%$/.test(s.formatPercent("0.554")), s.formatPercent("0.554"));

// dates
assert("tradingDate Toronto", s.toTradingDateKey("2026-09-17T03:30:00Z", "America/Toronto") === "2026-09-16", s.toTradingDateKey("2026-09-17T03:30:00Z", "America/Toronto"));
assert("tradingDate Paris", s.toTradingDateKey("2026-09-17T23:30:00Z", "Europe/Paris") === "2026-09-18", s.toTradingDateKey("2026-09-17T23:30:00Z", "Europe/Paris"));

// schemas
const uuidA = "0b8b8f6a-1c1d-4c4e-9a2b-3d4e5f6a7b8c";
const uuidB = "0b8b8f6a-1c1d-4c4e-9a2b-3d4e5f6a7b8d";
const closedOk = s.createTradeInputSchema.safeParse({
  variant: "closed", accountId: uuidA, instrumentId: uuidB, direction: "BUY",
  entryPrice: "1.1000", entryAt: "2026-09-17T09:00:00Z",
  size: { mode: "risk_percent", riskPercent: "1" }, outOfPlaybook: true,
  exitPrice: "1.1050", exitAt: "2026-09-17T10:00:00Z", exitReason: "TP",
});
assert("createTradeInput closed parses", closedOk.success, closedOk.success ? "" : JSON.stringify(closedOk.error.issues.slice(0, 2)));
assert("createTradeInput closed has no P&L fields", closedOk.success && !("pnlNet" in closedOk.data));
const noStrategy = s.createTradeInputSchema.safeParse({
  variant: "open", accountId: uuidA, instrumentId: uuidB, direction: "SELL",
  entryPrice: "1.1000", size: { mode: "quantity", quantity: "0.5" },
});
assert("createTradeInput XOR strategy enforced", !noStrategy.success);
const bothStrategy = s.createTradeInputSchema.safeParse({
  variant: "open", accountId: uuidA, instrumentId: uuidB, direction: "SELL",
  entryPrice: "1.1000", size: { mode: "quantity", quantity: "0.5" },
  strategyId: uuidA, outOfPlaybook: true,
});
assert("createTradeInput both-set rejected", !bothStrategy.success);
const reveal = s.revealPayloadSchema.safeParse({
  tradeId: uuidA, pnlNet: "82.10", rMultiple: "0.8", durationSeconds: 5400,
  coachingKey: "win_ab", detectedMistakes: [], triggeredAlerts: [], savedRToday: null,
});
assert("revealPayload parses", reveal.success);
const tradeEntity = s.tradeSchema.safeParse({
  id: uuidA, userId: uuidB, accountId: uuidA, instrumentId: uuidB,
  strategyId: null, status: "CLOSED", direction: "BUY",
  entryPrice: "1.1000", entryAt: "2026-09-17T09:00:00.000Z", quantity: "0.5",
  initialStop: null, initialTP: null, plannedRR: null, riskAmount: null,
  finalStop: null, exitPrice: "1.1050", exitAt: "2026-09-17T10:05:00.000Z",
  exitReason: "TP", fees: "0", swap: "0",
  pnlGross: "250", pnlNet: "246.80", rMultiple: "2.46",
  mfePrice: null, maePrice: null, mfeR: null, maeR: null,
  emotionBefore: null, emotionAfter: null, confidence: null,
  decisionGrade: "A", followedPlan: true, checklistSnap: null,
  notes: null, lessons: null, tradingDate: "2026-09-17", externalRef: null,
  importBatchId: null, createdAt: "2026-09-17T09:00:00.000Z", updatedAt: "2026-09-17T10:05:00.000Z", deletedAt: null,
});
assert("trade entity parses", tradeEntity.success, tradeEntity.success ? "" : JSON.stringify(tradeEntity.error.issues.slice(0, 3)));

console.log("done");
