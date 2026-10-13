import type { SectionInk } from "@/components/analytics/section";

/** The register's four inks — re-exported for nav items and consumers. */
export type { SectionInk };

/**
 * The Analytics Atlas registry — the module's whole tree in one place: 13
 * sections, each with a register ink, a one-line promise and the subsections
 * it unfolds into (the Academy's course-rooms grammar applied to statistics).
 * The hub tree renders from here; the section pages validate their route
 * param against it; the mock backend ships panels keyed by the same
 * subsection ids.
 *
 * `custom` marks subsections whose panel is one of the bespoke Phase 9
 * components (heatmap edge map, tilt timeline, sleep scatter, grade matrix,
 * strategy table, mistake ledger) — fed from the cached /stats/analytics
 * payload instead of the generic section response.
 */

export interface AtlasSubsection {
  id: string;
  title: string;
  /** What this subsection measures, one honest sentence. */
  blurb: string;
  custom?:
    | "edge-map"
    | "tilt"
    | "sleep"
    | "grades"
    | "strategy-table"
    | "ledger"
    | "overview-summary";
}

export interface AtlasSection {
  id: string;
  num: string;
  title: string;
  /** Short promise shown on the tree row. */
  tagline: string;
  /** Longer paragraph shown when the section unfolds. */
  description: string;
  ink: SectionInk;
  subsections: AtlasSubsection[];
}

export const ATLAS_SECTIONS: AtlasSection[] = [
  {
    id: "overview",
    num: "01",
    title: "Overview",
    tagline: "The cockpit — five ratios and the shape of your equity",
    description:
      "The five numbers that define an edge, then the two curves that never lie: where your edge lives on the clock, and what the equity line has been doing while you worked.",
    ink: "accent",
    subsections: [
      {
        id: "summary",
        title: "Summary ratios",
        blurb: "Win rate, profit factor, expectancy, payoff, max drawdown — the cockpit band.",
        custom: "overview-summary",
      },
      {
        id: "edge-map",
        title: "The edge map",
        blurb: "Weekday × UTC hour heatmap, colored by average R with low samples flagged.",
        custom: "edge-map",
      },
      {
        id: "equity",
        title: "Equity & daily flow",
        blurb: "The equity curve after every closed trade, then net P&L per active day.",
      },
    ],
  },
  {
    id: "performance",
    num: "02",
    title: "Performance",
    tagline: "P&L, equity, R-multiples and the shape of the distribution",
    description:
      "The money view of the ledger: monthly P&L, the equity staircase, the R-multiple histogram and the win/loss mix with its streaks. This is the section that answers 'is the year working?'",
    ink: "profit",
    subsections: [
      { id: "pnl", title: "P&L", blurb: "Net profit and loss by calendar month, with the trades count." },
      { id: "equity", title: "Equity", blurb: "Account equity staircase after every closed trade." },
      { id: "r-multiple", title: "R-Multiple", blurb: "Every closed trade dropped into an R bucket." },
      { id: "distribution", title: "Distribution", blurb: "Outcome mix and the streaks behind it." },
    ],
  },
  {
    id: "risk",
    num: "03",
    title: "Risk",
    tagline: "Exposure, drawdown and the risk-adjusted block",
    description:
      "How much you risk, what it costs at the worst moment, and the ratios that adjust returns for that pain. The tilt timeline lives here — risk size is behavior too.",
    ink: "loss",
    subsections: [
      {
        id: "exposure",
        title: "Risk exposure",
        blurb: "Every closed trade in order, sized by its risk, tilt spikes in carmine.",
        custom: "tilt",
      },
      { id: "drawdown", title: "Drawdown", blurb: "The underwater curve — distance from the cumulative-R peak." },
      { id: "metrics", title: "Risk metrics", blurb: "Sharpe, Sortino, drawdowns and tilt spikes in one table." },
    ],
  },
  {
    id: "execution",
    num: "04",
    title: "Execution",
    tagline: "Entry, exit, slippage and how much of the move you kept",
    description:
      "The quality of the hands, not the plan: confidence at entry, the reason every trade closed, the gap between planned and realized, and how much of the best excursion was banked.",
    ink: "warning",
    subsections: [
      { id: "entry", title: "Entry", blurb: "Average R by the confidence you logged at entry." },
      { id: "exit", title: "Exit", blurb: "Average R per exit reason — TP, SL, trailing, manual." },
      { id: "slippage", title: "Slippage", blurb: "Planned R:R versus realized R, dot per trade." },
      { id: "efficiency", title: "Trade efficiency", blurb: "How much of the MFE each trade actually captured." },
    ],
  },
  {
    id: "strategy",
    num: "05",
    title: "Strategy",
    tagline: "Each playbook setup, under the light",
    description:
      "The playbook measured: the dense decay table the coach watches, per-setup averages, and whether following the plan actually paid this window.",
    ink: "profit",
    subsections: [
      {
        id: "performance",
        title: "Strategy performance",
        blurb: "Per-strategy R barcodes and the sortable decay table.",
        custom: "strategy-table",
      },
      { id: "setup", title: "Setup performance", blurb: "Average R per playbook setup, each with its n." },
      { id: "adherence", title: "Rule adherence", blurb: "Followed versus deviated — and what each earned." },
    ],
  },
  {
    id: "market",
    num: "06",
    title: "Market",
    tagline: "Symbol, asset class and the regime you were right in",
    description:
      "Where your edge actually lives: per symbol, per asset class, per market regime. A green average on one symbol says nothing about the rest — until this page says it does.",
    ink: "accent",
    subsections: [
      { id: "symbol", title: "Symbol", blurb: "Average R per traded symbol, best first." },
      { id: "asset-class", title: "Asset class", blurb: "The mix of classes you trade and how each pays." },
      { id: "regime", title: "Market regime", blurb: "Trend, range and reversal days under the same R lens." },
    ],
  },
  {
    id: "time",
    num: "07",
    title: "Time Analysis",
    tagline: "Hour, day, session and timeframe",
    description:
      "The clock view of the edge. Every bucket carries its n because an edge claimed on three trades is a rumor — this is the page that finds the hours worth protecting.",
    ink: "warning",
    subsections: [
      { id: "hour", title: "Hour", blurb: "Average R per UTC hour bucket." },
      { id: "day", title: "Day", blurb: "Average R per weekday, Monday first." },
      { id: "session", title: "Session", blurb: "Asia, London, New York under the same R lens." },
      { id: "timeframe", title: "Timeframe", blurb: "Average R per the chart timeframe you played." },
    ],
  },
  {
    id: "psychology",
    num: "08",
    title: "Psychology",
    tagline: "Emotions, behaviors and the discipline line",
    description:
      "The mind measured: what each pre-trade emotion earned, how sleep colored the P&L, and the daily dance between fear skips and discipline skips.",
    ink: "accent",
    subsections: [
      { id: "emotions", title: "Emotions", blurb: "Average R per pre-trade emotion, worst first." },
      {
        id: "behaviors",
        title: "Behaviors",
        blurb: "Sleep duration against net P&L — the body's fingerprint.",
        custom: "sleep",
      },
      { id: "discipline", title: "Discipline", blurb: "Fear versus discipline skips over the last 30 days." },
    ],
  },
  {
    id: "quality",
    num: "09",
    title: "Trade Quality",
    tagline: "Plan versus execution, pain endured, gains captured",
    description:
      "The hindsight test and the excursion pairs: did A-grades out-earn F-grades, how deep you had to sit in pain, and how much of the offered move you actually kept.",
    ink: "profit",
    subsections: [
      {
        id: "plan",
        title: "Plan vs Execution",
        blurb: "Decision grade × realized outcome — the poker-logic proof.",
        custom: "grades",
      },
      { id: "mae", title: "MAE", blurb: "Maximum adverse excursion against the realized result." },
      { id: "mfe", title: "MFE", blurb: "Maximum favorable excursion against the capture diagonal." },
    ],
  },
  {
    id: "mistakes",
    num: "10",
    title: "Mistakes & Rules",
    tagline: "Violations, their price list, and the monthly trend",
    description:
      "The ledger of leaks: how often each mistake happens, exactly how many R it cost, and whether the trend is shrinking. The most expensive chart in the building.",
    ink: "loss",
    subsections: [
      {
        id: "violations",
        title: "Violations",
        blurb: "The all-time mistake ledger — frequency, category, R cost.",
        custom: "ledger",
      },
      { id: "cost", title: "Cost of mistakes", blurb: "Σ R per mistake, most expensive first." },
      { id: "adherence", title: "Rule adherence", blurb: "Occurrences per month — the shrinking bar." },
    ],
  },
  {
    id: "events",
    num: "11",
    title: "Economic Events",
    tagline: "Before, during and after the releases that move you",
    description:
      "Your trades sliced by distance to high and medium impact releases: the drift before, the chaos of the day, the continuation or hangover after.",
    ink: "warning",
    subsections: [
      { id: "before", title: "Before event", blurb: "Average R on T-2 and T-1 days." },
      { id: "during", title: "During event", blurb: "Recent releases with your same-day statistics." },
      { id: "after", title: "After event", blurb: "Average R on T+1 and T+2 days." },
    ],
  },
  {
    id: "advanced",
    num: "12",
    title: "Advanced Statistics",
    tagline: "t-stats, rolling expectancy, correlation and Monte Carlo",
    description:
      "For the skeptic in you: the distribution's vital signs, the rolling expectancy line, the symbol × session correlation grid, and your R series resampled 300 times.",
    ink: "accent",
    subsections: [
      { id: "metrics", title: "Statistical metrics", blurb: "Mean, std dev, t-stat, Sharpe, Sortino, skew." },
      { id: "distribution", title: "Distribution", blurb: "Rolling 20-trade expectancy over the ledger." },
      { id: "correlation", title: "Correlation", blurb: "Symbol × session heatmap of average R." },
      { id: "monte-carlo", title: "Monte Carlo", blurb: "300 resampled paths, percentile bands over 50 trades." },
    ],
  },
  {
    id: "reports",
    num: "13",
    title: "Reports",
    tagline: "Daily, weekly, monthly — and the honest 30-vs-30",
    description:
      "The ledger folded into readable windows: ten days, six weeks, six months, and the rolling 30-day comparison that answers 'am I getting better?' without drama.",
    ink: "profit",
    subsections: [
      { id: "daily", title: "Daily", blurb: "The last ten trading days, one row each." },
      { id: "weekly", title: "Weekly", blurb: "Six Monday-anchored weeks with net P&L and averages." },
      { id: "monthly", title: "Monthly", blurb: "Six months — the quietest lens of the suite." },
      { id: "custom", title: "Custom window", blurb: "Last 30 days against the previous 30." },
    ],
  },
];

export function atlasSection(sectionId: string): AtlasSection | undefined {
  return ATLAS_SECTIONS.find((section) => section.id === sectionId);
}

/** Ink helper classes for the tree spines and section headers. */
export const ATLAS_SPINE = {
  accent: "bg-accent",
  profit: "bg-profit",
  warning: "bg-warning",
  loss: "bg-loss",
} as const;
