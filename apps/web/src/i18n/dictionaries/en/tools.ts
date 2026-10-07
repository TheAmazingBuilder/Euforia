import type { Dictionary } from "@/i18n/dictionaries/en";

/**
 * EN dictionary — TOOLS namespace (canonical). The standalone operational
 * calculators: Lot Size + Compounding. Values are STATIC strings — components
 * compose dynamic parts themselves (dict.* pattern, no {var} templates).
 *
 * Voice contract: these tools project and estimate — they never promise.
 * Result copy states what was computed from the given parameters; disclaimers
 * state that instrument specifications vary by broker. No performance claims.
 */

export type ToolsDict = Dictionary["tools"];

export const toolsDict = {
  lotSize: {
    overview: {
      kicker: "Tools · Position sizing",
      metaModes: "Inputs",
      metaModesValue: "Balance · Risk · Entry · Stop · Target",
      metaModel: "Model",
      metaModelValue: "Risk-budget sizing · floored to volume step",
      metaGuard: "Guard",
      metaGuardValue: "No silent clamping · explicit status",
    },
    form: {
      section: "Trade parameters",
      instrument: "Instrument",
      instrumentPlaceholder: "Select an instrument",
      custom: "Custom",
      currency: "Currency",
      direction: "Direction",
      long: "Long · Buy",
      short: "Short · Sell",
      balance: "Account balance",
      risk: "Risk",
      entry: "Entry price",
      stop: "Stop loss",
      takeProfit: "Take profit",
      optionalSuffix: "optional — used for R:R only",
      advanced: "Advanced parameters",
      advancedHint:
        "Instrument specifications vary by broker. Verify contract and tick specifications before placing a trade.",
      pipSize: "Pip size",
      contractSize: "Contract size",
      volumeStep: "Volume step",
      presets: "Risk presets",
      presetsNote: "Convenience presets — not advice.",
      calculate: "Calculate",
    },
    result: {
      title: "Recommended position size",
      lotsUnit: "lots",
      unitsUnit: "units",
      empty: "Enter the trade parameters to size the position.",
      riskAmount: "Risk amount",
      stopDistance: "Stop distance",
      stopPips: "Stop distance (pips)",
      riskReward: "Risk / Reward",
      rrUnit: "R:R",
      realizedRisk: "Realized risk",
      statusValid: "Within limits",
      statusBelowStep: "Below one volume step",
      statusBelowStepBody:
        "The risk budget cannot cover a single volume step — no tradeable size.",
      volumeAdjusted: "Floored to the volume step so realized risk stays within budget.",
      rrNegative: "Reward distance is non-positive for this take profit — the ratio is negative.",
    },
    breakdown: {
      title: "Calculation breakdown",
      balance: "Account balance",
      risk: "Risk",
      riskAmount: "Risk amount",
      stopDistance: "Stop distance",
      stopPips: "Stop distance",
      pipSize: "Pip size",
      pipValue: "Risk per lot",
      rawSize: "Calculated size",
      volumeStep: "Volume step",
      equivalent: "Equivalence",
      finalSize: "Position size",
    },
    validation: {
      required: "This field is required.",
      invalidNumber: "Enter a valid number.",
      mustBePositive: "Must be greater than zero.",
      riskRange: "Risk must be between 0% and 100% of the balance.",
      samePrice: "Stop loss must be different from entry price.",
      stopSideLong: "For a long position, the stop loss must be below the entry price.",
      stopSideShort: "For a short position, the stop loss must be above the entry price.",
    },
    disclaimer:
      "Calculator results are estimates based on the parameters provided. Instrument specifications may vary by broker. Verify contract, tick and pip values before executing a trade.",
    copy: {
      result: "Copy result",
      copied: "Copied",
    },
  },

  compounding: {
    overview: {
      kicker: "Tools · Growth projection",
      metaModel: "Model",
      metaModelValue: "A = P × (1 + r)ⁿ — gain per period, compounded",
      metaRange: "Range",
      metaRangeValue: "1–1 000 periods · −100% to +10 000%",
      metaGuard: "Guard",
      metaGuardValue: "Full-precision loop · overflow guard",
    },
    form: {
      section: "Projection parameters",
      startingBalance: "Starting balance",
      periods: "Periods",
      gainPerPeriod: "Gain per period",
      currency: "Currency",
      presetsBalance: "Balance presets",
      presetsGain: "Gain presets",
      presetsNote: "Convenience presets — not expected returns.",
      periodsHint: "1–1 000 periods",
      gainHint: "Negative rates model drawdowns.",
    },
    summary: {
      initialBalance: "Initial balance",
      finalBalance: "Final balance",
      totalProfit: "Total profit",
      totalGain: "Total gain",
    },
    chart: {
      title: "Account growth",
      xLabel: "Period",
      yLabel: "Balance",
    },
    table: {
      title: "Results",
      period: "Period",
      startingBalance: "Starting balance",
      endingBalance: "Ending balance",
      totalProfit: "Total profit",
      totalGain: "Total gain",
      empty: "Enter the projection parameters to build the schedule.",
    },
    validation: {
      required: "This field is required.",
      invalidNumber: "Enter a valid number.",
      balancePositive: "Starting balance must be greater than zero.",
      periodsRange: "Periods must be an integer between 1 and 1 000.",
      gainRange: "Gain per period must be between −100% and +10 000%.",
      overflow: "The projection exceeds the supported balance ceiling — reduce the rate or the periods.",
    },
    how: {
      title: "How it works",
      line1: "Each period's gain is added to the account balance.",
      line2: "The next period calculates its gain from the updated balance.",
      line3: "This creates compound growth because gains are reinvested.",
    },
    disclaimer:
      "Projected growth assumes the specified return occurs consistently and does not account for fees, slippage, losses or withdrawals unless included. This is a mathematical projection — not a performance promise.",
    copy: {
      summary: "Copy summary",
      copied: "Copied",
    },
  },
} as const;
