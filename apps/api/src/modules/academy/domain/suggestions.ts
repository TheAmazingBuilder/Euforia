/**
 * Academy journal suggestions — evidence-based course recommendations derived
 * from the user's CLOSED trades (Phase 11 §65–§67: Academy stays a pure
 * consumer of the journal through public repository contracts; the rules are
 * deliberately readable so an Analytics-driven engine can replace them later
 * at the same seam).
 *
 * HONEST SEAMS (Phase 11 §8/§54 honesty + Phase 8 §36 documented gaps): the
 * mock rules also used trade.mfeR and trade.emotionAfter. The canonical
 * backend Trade has NO excursion (mfeR/maeR) and NO emotion columns — those
 * two rules CANNOT be evaluated and are therefore absent, never fabricated.
 * The remaining rules run on REAL backend data: rMultiple (Trade),
 * plannedRR (review.planSnapshot.rrRatio ?? plan.rrRatio) and strategy
 * attribution (review.originTradePlanId → plan.strategyId — the Phase 8
 * chain). "Outside playbook" = trade with NO resolvable strategyId.
 *
 * Parity source: mocks/academy-engine.ts academySuggestions() — thresholds
 * and course ids verbatim.
 */
import type { AcademySuggestion } from "../../../shared/contracts";
import { courseById } from "./catalog";

/** Normalized closed-trade row the service feeds from public repositories. */
export interface SuggestionTradeRow {
  rMultiple: number | null;
  plannedRR: number | null;
  /** Resolved strategy attribution (Phase 8 chain) — null = outside playbook. */
  strategyId: string | null;
}

interface Rule {
  courseId: string;
  weight: number;
  reason: string;
}

const COURSE_TRADE_MGMT = "crs-trademgmt";
const COURSE_RISK_FUNDAMENTALS = "crs-risk-fundamentals";
const COURSE_STRATEGIES_CORE = "crs-strategies-core";
const COURSE_ADVANCED_EXECUTION = "crs-advanced-execution";

export function suggestionRules(closed: readonly SuggestionTradeRow[]): Rule[] {
  const rules: Rule[] = [];

  // Full-stop losses: closed at or beyond −1R.
  const fullLosses = closed.filter((trade) => (trade.rMultiple ?? 0) <= -1).length;
  if (fullLosses >= 2) {
    rules.push({
      courseId: COURSE_RISK_FUNDAMENTALS,
      weight: fullLosses,
      reason: `${fullLosses} closed trades hit −1R or worse — worth revisiting stop placement and position sizing in Risk Management.`,
    });
  }

  // Outside the playbook.
  const noStrategy = closed.filter((trade) => trade.strategyId === null).length;
  if (noStrategy >= 2) {
    rules.push({
      courseId: COURSE_STRATEGIES_CORE,
      weight: noStrategy,
      reason: `${noStrategy} trades sat outside your playbook — the 13-field strategy template turns loose setups into testable systems.`,
    });
  }

  // Plan/outcome drift: planned ≥ 2R but closed negative.
  const planDrift = closed.filter(
    (trade) => (trade.plannedRR ?? 0) >= 2 && (trade.rMultiple ?? 0) < 0,
  ).length;
  if (planDrift >= 2) {
    rules.push({
      courseId: COURSE_ADVANCED_EXECUTION,
      weight: planDrift,
      reason: `${planDrift} trades planned ≥2R but closed red — Advanced Execution covers the entry-to-exit gap.`,
    });
  }

  return rules;
}

/** Top-3 rules by weight, resolved to deep-link suggestions (first lesson). */
export function suggestions(closed: readonly SuggestionTradeRow[]): AcademySuggestion[] {
  if (closed.length === 0) return [];
  return suggestionRules(closed)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((rule) => {
      const course = courseById(rule.courseId);
      const lesson = course?.lessons[0];
      if (!course || !lesson) return null;
      return {
        courseId: course.id,
        courseTitle: course.title,
        categoryId: course.categoryId,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        reason: rule.reason,
      };
    })
    .filter((pick): pick is AcademySuggestion => pick !== null);
}

// Reference note for the deferred rules (kept next to the seam they belong to):
// "Winners given back" (mfeR ≥ +2R but closed < +1R → Trade Management) and
// "Emotional exits" (emotionAfter ∈ FOMO/REVENGE/FRUSTRATED/EUPHORIC →
// Trading Psychology) activate automatically when Trade gains excursion and
// emotion columns (TradeManagement/Behavioral evolution — NOT in Phase 11).
export const DEFERRED_RULE_COURSES = [COURSE_TRADE_MGMT] as const;
