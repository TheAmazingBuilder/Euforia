export { COSMOZ_VERSION } from "./version";

// ── Constants ────────────────────────────────────────────────────────────────
export {
  PLAYBOOK_COLOR_PALETTE,
  toMonthKey,
  ANALYTICS_HOUR_BUCKETS,
  ANALYTIC_SESSIONS,
  ANALYTICS_WEEKDAYS,
  EMOTION_LABELS,
} from "./constants";

// ── Enums (zod schemas + inferred TS types) ─────────────────────────────────
export * from "./enums";

// ── Schema primitives ────────────────────────────────────────────────────────
export * from "./schemas/primitives";

// ── Domain schemas ───────────────────────────────────────────────────────────
export * from "./schemas/instrument";
export * from "./schemas/account";
export * from "./schemas/strategy";
export * from "./schemas/trade";
export * from "./schemas/rule";
export * from "./schemas/alert";
export * from "./schemas/skippedTrade";
export * from "./schemas/dailyJournal";
export * from "./schemas/dailyStat";
export * from "./schemas/mistake";
export * from "./schemas/tag";
export * from "./schemas/eco-event";
export * from "./schemas/backup";
export * from "./schemas/api";
export * from "./schemas/market";
export * from "./schemas/broker";
export * from "./schemas/settings";
export * from "./schemas/integration";
export * from "./schemas/security";
export * from "./schemas/auth";
export * from "./schemas/monitoring";
export * from "./schemas/playbook";
export * from "./schemas/tradeReview";
export * from "./schemas/academy";
export * from "./schemas/nofy";
export * from "./schemas/sessionLive";
export * from "./schemas/trading-account";
export * from "./schemas/calculators";
export * from "./schemas/ocr";
export * from "./schemas/oryon";
export * from "./schemas/goal";
export * from "./schemas/metricAlerts";
// Phase 4/5/7+ domain contracts consumed by the NestJS API through
// src/shared/contracts (relative source re-export — see that file).
export * from "./schemas/trading-core";
export * from "./schemas/trade-planning";
export * from "./schemas/replay";
export * from "./replay/engine";
export * from "./schemas/plans";
// Phase 05 — deterministic performance-insights engine (API suite + MSW
// mirror share the ONE implementation so mock parity can never drift).
export * from "./analytics/insights";

// ── Pure utils ───────────────────────────────────────────────────────────────
export * from "./utils/money";
export * from "./utils/risk";
export * from "./utils/compounding";
export * from "./utils/risk-reward";
export * from "./utils/format";
export * from "./utils/dates";
export * from "./utils/rules";
export * from "./utils/integrations";

// Academy content — the single source of truth for the pedagogical corpus
// (categories, courses, lessons, quizzes, glossary, pattern exemplars,
// scenarios). Served by the NestJS module; the browser mock re-exports it.
export * from "./content/academy/catalog";
export { GLOSSARY_TERMS } from "./content/academy/glossary";
export type { PatternFamily, PatternBias, PatternExemplar } from "./content/academy/patterns";
export { PATTERN_EXEMPLARS } from "./content/academy/patterns";
export { SCENARIOS } from "./content/academy/scenarios";
export type { AuthoredLesson, AuthoredQuiz, AuthoredCourse, AuthoredCategory } from "./content/academy/types";
