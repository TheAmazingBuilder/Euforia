import type { AuthoredCourse } from "./types";
import { text, tip, info, warn, risk, list, steps, formula, table, example, structure, riskDiagram, mc, tf, sc } from "./types";

/**
 * Strategies + Trade Management + Psychology + Advanced — the application
 * track. Strategy lessons share the template from spec §14: conditions,
 * setup, entry, stop, target, management, invalidation, mistakes, practice.
 */

export const STRATEGY_COURSES: AuthoredCourse[] = [
  {
    id: "crs-strategies-core",
    categoryId: "cat-strategies",
    title: "Core Strategy Playbook",
    description:
      "A consistent template for reading any strategy, then three families: trend-following, pullback, and breakout/retest.",
    level: "INTERMEDIATE",
    objectives: [
      "Evaluate any strategy through the 13-field template",
      "Execute trend-following and pullback models with rules",
      "Execute breakout and breakout-retest models",
    ],
    lessons: [
      {
        id: "lsn-strat-template",
        title: "How to Read a Strategy",
        summary: "The 13-field template — market conditions to practice — that turns strategy talk into checklists.",
        minutes: 8,
        objectives: [
          "Recite the 13 template fields",
          "Identify which fields are usually missing from 'strategy' content",
          "Rewrite a vague idea as a checkable plan",
        ],
        blocks: [
          text("Every strategy lesson in this Academy follows one template: overview, market conditions, required context, setup, entry conditions, stop loss, take profit, position management, invalidation, risk management, example, common mistakes, practice. The template is the product: a strategy you cannot state in these fields is a mood, not a plan."),
          list(
            "Conditions & context: WHEN is this strategy allowed to exist at all",
            "Setup → entry → stop → target: the four numbers of every trade",
            "Management & invalidation: what you do while in, and what kills the idea",
            "Risk: fixed %, sized from the stop — never from conviction",
            "Mistakes & practice: how it typically fails, and how you drill it",
          ),
          info("No strategy is guaranteed",
            "This Academy presents strategies as conditional frameworks — applicable under stated conditions, with stated limitations (spec §14). If you ever meet content that promises guaranteed profit, close the tab."),
        ],
        takeaways: [
          "13 fields or it isn't a strategy yet",
          "Conditions and invalidation are the fields beginners skip — and die from",
          "Every strategy below inherits this template",
        ],
      },
      {
        id: "lsn-strat-trend-pullback",
        title: "Trend-Following & Pullback",
        summary: "Ride what moves, join on the dip: the two faces of trend trading and their rule sets.",
        minutes: 10,
        objectives: [
          "State trend-following conditions and management",
          "Execute the pullback model step by step",
          "Respect the weaknesses of both",
        ],
        blocks: [
          text("Trend-following buys strength and sells weakness: conditions are an established trend (labeled HH/HL or LH/LL, ADX rising), the entry is a continuation trigger, the stop is structural, and management trails rather than targets — the trend's duration is unknowable, so the model lets winners run and cuts at structure."),
          structure("uptrend", "The trend-following habitat: persistent HH/HL sequence."),
          text("The pullback model is its patient sibling: wait for the retracement into a zone of interest (broken level, EMA, origin of the impulse), require refusal (rejection candle or micro-shift), then enter with the stop behind the pullback extreme. It trades some missed rockets for far better stop placement — the statistics usually favor it."),
          example("Pullback model — full checklist",
            "Conditions: 4H uptrend (HH/HL), price above the 50-EMA.",
            "Setup: pullback reaches the prior broken resistance (flip zone).",
            "Entry: bullish engulfing closing back above the zone.",
            "Stop: below the pullback low; size = fixed 1% risk.",
            "Target: prior swing high; management: half off at 1R, trail the rest.",
            "Invalidation: 4H close below the last HL — the trend argument dies.",
          ),
          warn("Chop is the killer",
            "Both models bleed in directionless markets. The regime filter (structure state, ADX) is not decoration — it is the difference between the model and its casino version."),
        ],
        takeaways: [
          "Trend models live and die by the regime filter",
          "Pullback entries buy better stops with patience",
          "Trail in trends: fixed targets cap what trend-following is for",
        ],
      },
      {
        id: "lsn-strat-breakout-retest",
        title: "Breakout & Breakout-Retest",
        summary: "Two execution styles for leaving the range: join the thrust, or buy the return.",
        minutes: 9,
        objectives: [
          "Grade breakouts before entry (quality checklist)",
          "Execute the retest variant with structural stops",
          "Handle false-break protocol",
        ],
        blocks: [
          text("The breakout model enters on the decisive leave of a defined area — with the quality checks from the Technical track: displacement (large bodies), location (a level everyone can see), participation (volume). Stops go back inside the range; the failed-break invalidation is close and honest."),
          text("The retest variant waits for price to return to the broken boundary and hold — turning the old resistance into new support. It misses the moves that never look back, in exchange for confirmation and a tighter, structural invalidation. Both are legitimate; the journal's statistics will tell you which style pays YOU."),
          riskDiagram("rr", "Breakout risk is close (back inside the range); reward is the measured move."),
          table(
            ["Aspect", "Breakout", "Breakout + retest"],
            [
              ["Entry", "On the break", "On the return to the level"],
              ["Stop", "Back inside the range", "Below the retest hold"],
              ["Misses", "Never retests — few", "Never retests — many"],
              ["Fills", "Contested, slippage-prone", "Calm, precise"],
            ],
          ),
        ],
        takeaways: [
          "Quality checks before entry — displacement, location, participation",
          "Retest = confirmation + tighter invalidation + missed runners",
          "False breaks are part of the model's cost — plan the protocol in advance",
        ],
      },
    ],
    quiz: {
      id: "qz-strategies-core",
      questions: [
        mc("q1", "Which fields does a 'strategy' MUST define to be checkable (spec template)?",
          ["Entry and target only", "Conditions, context, setup, entry, stop, target, management, invalidation, risk", "A chart screenshot"], 1,
          "The 13-field template exists so every plan is reviewable — conditions and invalidation are the usual missing pair."),
        sc("q2", "Price breaks a range high with large bodies and expanding volume. You prefer confirmation style. What do you do?",
          ["Enter immediately at market", "Wait for the retest of the broken level and enter on the hold", "Short the extreme"], 1,
          "The retest variant trades a few missed runners for confirmation and a structural stop."),
        tf("q3", "Trend-following works best with fixed profit targets.", false,
          "Trend-following's edge is the rare extended move — fixed targets cap exactly what the model is designed to catch. Management trails; structure decides."),
      ],
    },
  },
  {
    id: "crs-strategies-styles",
    categoryId: "cat-strategies",
    title: "Mean Reversion, Range & Styles",
    description:
      "Trading back to value, harvesting ranges, and choosing your style: scalping vs swing, then validating your own system.",
    level: "ADVANCED",
    objectives: [
      "Execute mean-reversion with regime filters",
      "Harvest ranges with defined extremes",
      "Match a trading style to your life and validate it",
    ],
    lessons: [
      {
        id: "lsn-strat-meanreversion",
        title: "Mean Reversion & Range Trading",
        summary: "Betting on the rubber band: fade extremes back to value — with regime filters that keep it alive.",
        minutes: 9,
        objectives: [
          "State mean-reversion conditions honestly",
          "Execute range fades with defined risk",
          "Recognize the failure mode: the break",
        ],
        blocks: [
          text("Mean reversion fades excess: when price stretches from its average (Bollinger stretch, RSI extreme IN A RANGE), the model bets on a return to value. Its conditions are the opposite of trend-following's: ranging regime, no expansion, extremes at established boundaries. The entry is the refusal candle at the extreme; the stop is beyond it; the target is the middle of the range."),
          structure("range", "Range harvesting: fade the edges, target the middle."),
          text("Range trading is the same family made structural: two accepted boundaries, fade the top toward the middle, fade the bottom toward the middle, stop beyond the boundary. Its fatal enemy is the transition — the day the range breaks. The regime filter and the daily news check are the model's airbags."),
          warn("The one-way train",
            "Mean reversion's failure mode is asymmetric: many small wins, then the rare large loss when the range dies. Without the regime filter and the stop, the strategy is a coin machine that occasionally detonates. This is exactly the profile the guardrail mode exists to interrupt."),
        ],
        takeaways: [
          "Fade extremes only in confirmed ranges",
          "Stop beyond the boundary, target the middle — always",
          "The break is the model's known, planned, non-negotiable cost",
        ],
      },
      {
        id: "lsn-strat-styles-validation",
        title: "Scalping vs Swing — and Validating Your System",
        summary: "Choosing a style that fits your life, then proving it with backtest → forward → statistics.",
        minutes: 10,
        objectives: [
          "Compare scalping, day trading and swing requirements",
          "Design a validation pipeline for your own system",
          "Compute the sample size before believing results",
        ],
        blocks: [
          text("Styles are lifestyles. Scalping demands hours of full attention, cheap execution and fast hands. Day trading demands a daily routine and hard session boundaries. Swing trading demands tolerance for overnight risk and multi-day patience, in exchange for a life away from the screen. The best strategy on paper that contradicts your calendar is a bad strategy for you."),
          table(
            ["Style", "Screen time", "Holding", "Main costs"],
            [
              ["Scalping", "Constant", "Seconds–minutes", "Spread, slippage, burnout"],
              ["Day trading", "Session-long", "Hours", "Spread, news gaps"],
              ["Swing", "Minutes daily", "Days–weeks", "Gaps, swap, overnight risk"],
            ],
          ),
          text("Validation pipeline for your own system: define it in the 13 fields → backtest honestly (same rules, no curve-fitting, include spread) → forward test on demo or minimum size → review statistics (expectancy, max drawdown, sample size). Thirty trades is a hint, a hundred is a voice. The journal is the pipeline's instrument panel — use it from trade one."),
          formula("Rough sample-size rule", "n ≈ 100 trades before you trust an edge claim", "Below that, noise dominates."),
        ],
        takeaways: [
          "Style fit beats strategy elegance",
          "Backtest → forward → statistics; no shortcuts",
          "Your journal IS the validation infrastructure",
        ],
      },
    ],
    quiz: {
      id: "qz-strategies-styles",
      questions: [
        sc("q1", "A strong downtrend is underway and price stretches 3 standard deviations below its mean band. A mean-reversion long is:",
          ["Automatic — stretched means snap-back", "Against the regime — the model's own conditions forbid it", "Safe with a wide stop"], 1,
          "Mean reversion's conditions require a ranging regime. In strong trends, 'stretched' keeps stretching — the model's known failure mode."),
        mc("q2", "Minimum honest sample before trusting a claimed edge?",
          ["10 trades", "30 trades", "~100 trades"], 2,
          "Below ~100 trades, variance dominates. Thirty is a hint; a hundred is a voice."),
      ],
    },
  },
];

export const TRADE_MANAGEMENT_COURSES: AuthoredCourse[] = [
  {
    id: "crs-trademgmt",
    categoryId: "cat-trade-management",
    title: "Managing the Position",
    description:
      "Everything after entry: break-even moves, partial profits, scaling, trailing stops, and exit criteria that end trades with reasons.",
    level: "INTERMEDIATE",
    objectives: [
      "Manage trades by plan instead of by feeling",
      "Apply break-even, partials and trailing deliberately",
      "Define exit criteria for winners and losers",
    ],
    lessons: [
      {
        id: "lsn-tm-after-entry",
        title: "The Trade Isn't Over at Entry",
        summary: "Stop and target discipline, and the management map written before the position exists.",
        minutes: 8,
        objectives: [
          "Write a management map per trade",
          "Honor stops as pre-committed decisions",
          "Know when NOT to manage at all",
        ],
        blocks: [
          text("Entry gets the attention; management decides the career. A management map is three lines written before entry: what you do at +1R (nothing / partial / trail), what you do at structure (target / trail beyond), and what you do at invalidation (nothing — the stop does it). The map's purpose is behavioral: every decision is pre-made while you were calm."),
          list(
            "Set-and-forget: valid for swing trades and tested plans — managing is not mandatory virtue",
            "Active management: valid for intraday plans with defined milestones",
            "Forbidden always: widening stops, doubling to 'average down' outside plan, removing targets out of greed",
          ),
          tip("Decisions while calm, execution while busy",
            "The judgment gates in Session Live verify your entries; the management map is the same idea applied to exits. Write it, then obey yourself."),
        ],
        takeaways: [
          "Three-line management map, written pre-entry",
          "Set-and-forget is a legitimate style — not a failure of attention",
          "No map = no management, only reactions",
        ],
      },
      {
        id: "lsn-tm-breakeven-partials",
        title: "Break-Even & Partial Take Profits",
        summary: "The two most-used (and most-misused) management tools — when they help and when they strangle.",
        minutes: 9,
        objectives: [
          "Move to break-even with rules, not fear",
          "Set partial exits that fit the system's R profile",
          "Diagnose when partials destroy expectancy",
        ],
        blocks: [
          text("Moving a stop to break-even after +1R converts a loser into a scratch and is psychologically soothing. Its cost: normal pullbacks re-take entry constantly, scratching trades that would have hit target. Rules help: move to break-even only after structure confirms (a new HL forms), not at an arbitrary R level chosen for comfort."),
          text("Partials — taking half at 1R, trailing the rest — trade average winner size for win-rate stability. For a system whose edge lives in the rare 3R–5R runner, early partials can delete the entire expectancy: taking 0.5R at 1R and trailing the rest to 2R average converts a +0.75R system into a +0.3R system. Compute your system's R distribution before adopting partials as default."),
          formula("Partials vs expectancy", "E stays positive only if the trail pays for the early exit", "Measure: avg full-exit R vs partial-exit R."),
        ],
        takeaways: [
          "Break-even after structural confirmation, not after fear",
          "Partials stabilize psychology; they can starve expectancy",
          "Your journal's R distribution decides, not your feelings",
        ],
      },
      {
        id: "lsn-tm-scaling-trailing",
        title: "Scaling In/Out & Trailing Stops",
        summary: "Adding to winners, slicing exits, and the three trailing methods with their trade-offs.",
        minutes: 9,
        objectives: [
          "Scale in only with planned adds",
          "Choose a trailing method that matches the strategy",
          "Avoid the martingale mirror",
        ],
        blocks: [
          text("Scaling in — adding to a winner at planned levels (e.g. at the next HL confirmation) — concentrates risk into strength when done by rule. Each add carries its own stop and its own size from the same risk budget; total exposure is capped by portfolio heat, not by courage. Scaling into LOSERS is the martingale mirror: adding to a thesis the market is currently rejecting."),
          text("Trailing methods: structural (stop behind each new swing — the trend decides), ATR-based (stop = k×ATR behind price — volatility decides), and indicator trails (e.g. 20-EMA — consensus decides). Structural trails fit swing and trend systems; ATR trails fit volatile instruments; EMA trails fit fast momentum. Choose one per system, in writing, before the trade."),
          warn("Averaging down is not scaling",
            "Scaling in goes WITH the trade's thesis as it confirms. Averaging down adds risk exactly when the thesis weakens — the classic route from a 1R plan to a 4R loss. The journal's decision grades treat it accordingly."),
        ],
        takeaways: [
          "Scale into confirmed strength, never into losers",
          "One trailing method per system, chosen in advance",
          "Portfolio heat caps total exposure, not optimism",
        ],
      },
      {
        id: "lsn-tm-exits",
        title: "Managing Winners & Losers — Exit Criteria",
        summary: "Endings with reasons: the exit checklist that closes trades by plan, and closes weeks without regrets.",
        minutes: 8,
        objectives: [
          "Define exit criteria for both outcomes",
          "Honor time stops for dead trades",
          "Close the loop in the journal",
        ],
        blocks: [
          text("Winners end at target, at trailing stop, or at structural change (a CHoCH against the trade). Losers end at the stop — full stop. The gray zone is the DEAD trade: neither advancing nor invalidating, eating attention and swap. Time stops fix it: 'if the trade hasn't reached +0.5R within N candles/sessions, exit and redeploy'. Dead capital has a real cost."),
          steps(
            "Write the exit criteria with the entry (target / trail / structural exit / time stop)",
            "Log every exit reason in the journal — target, trail, structure, time, or (the honest one) 'panic'",
            "Review exit reasons monthly in Analytics — patterns in exits hide more edge than patterns in entries",
          ),
          tip("Exit data is an edge mine",
            "Most traders optimize entries forever. Your exit-reason distribution — how many trades die by time stop, how many trail to 4R — is where the next real improvement usually hides."),
        ],
        takeaways: [
          "Losers: the stop. Winners: target, trail or structure. Dead: time stop.",
          "Log the exit reason every time — it is reviewable data",
          "Exit statistics are the most neglected edge in retail trading",
        ],
      },
    ],
    quiz: {
      id: "qz-trademgmt",
      questions: [
        sc("q1", "Your long is +1R. No new HL has formed; price is chopping under entry. You move the stop to break-even. Assessment?",
          ["Perfect discipline", "Fear-driven move — normal pullbacks will scratch a valid trade", "Should add to the position"], 1,
          "Break-even moves belong after structural confirmation, not at comfort milestones chosen in-flight."),
        mc("q2", "Which system type is most damaged by taking half off at 1R?",
          ["A range-fade system", "A trend-following system whose edge lives in rare 4R runners", "A scalping system"], 1,
          "Early partials amputate the fat right tail that trend systems live on."),
        tf("q3", "Adding size to a losing position to improve the average entry is a legitimate scaling technique.", false,
          "That is averaging down — adding risk as the thesis weakens. Scaling in belongs with confirmed strength."),
      ],
    },
  },
];

export const PSYCHOLOGY_COURSES: AuthoredCourse[] = [
  {
    id: "crs-psychology",
    categoryId: "cat-psychology",
    title: "The Emotional Ledger",
    description:
      "FOMO, revenge, tilt, fear and greed — how emotional states become trade decisions, and how process reclaims control.",
    level: "BEGINNER",
    objectives: [
      "Name the emotional patterns and their trade signatures",
      "Interrupt the state → decision → trade chain",
      "Build the routine that makes discipline cheap",
    ],
    lessons: [
      {
        id: "lsn-psy-fomo-revenge",
        title: "FOMO & Revenge Trading",
        summary: "The two fastest account-leaks: chasing what already moved, and attacking the market that hurt you.",
        minutes: 9,
        objectives: [
          "Recognize FOMO's trade signature in your log",
          "Recognize revenge's signature and its escalation",
          "Install the interruption protocol",
        ],
        blocks: [
          text("FOMO is entry driven by absence: the move is happening without you, and being-out feels worse than being-wrong. Its signature in the journal is unmistakable — entries late in extended moves, stops too wide for structure, grades of C or below on plan adherence, comments that say “couldn't miss it”. FOMO trades carry the market's emotion, not your plan's."),
          text("Revenge trading is loss converted into anger converted into immediate re-entry, usually bigger, usually in the same instrument, usually without a setup. It escalates: the second loss demands a third trade twice as large. One revenge session can erase weeks of patient edge. The guardrail mode in this app exists precisely for its N-violation soft-lock."),
          tip("The interruption protocol",
            "State → pause → name → decide. Feel the urge, take 3 breaths, write the emotion name in the journal entry field, and only then choose. Naming the state (“this is revenge”) measurably weakens it — and the emotion log builds the data the Discipline module's emotion matrix displays."),
        ],
        takeaways: [
          "FOMO = absence-driven entries; revenge = anger-driven re-entries",
          "Both have recognizable journal signatures — review finds them",
          "Name the state before the decision; let the data confront the feeling",
        ],
      },
      {
        id: "lsn-psy-fear-greed",
        title: "Fear, Greed & Loss Aversion",
        summary: "The two dials of risk perception — and why losses hurt twice as much as gains please.",
        minutes: 8,
        objectives: [
          "Explain loss aversion in trading terms",
          "Recognize fear's management mistakes",
          "Recognize greed's sizing mistakes",
        ],
        blocks: [
          text("Loss aversion is the measured human tendency to feel a loss roughly twice as intensely as an equivalent gain. Its trading fingerprints: cutting winners at +0.5R while letting losers run to −1.5R, refusing to take the next valid setup after a loss, and closing trades at break-even out of pure dread. The pain is real — the responses are trainable."),
          text("Fear and greed are the same dial in opposite directions: fear shrinks risk perception of opportunity (missing trades you planned) and magnifies risk of exposure (managing winners too early). Greed reverses it — sizing creeps up after wins, targets stretch “just a bit more”, and the position that paid the month gives it back in an afternoon."),
          list(
            "Fear fix: fixed risk % makes every loss identical and survivable — dread shrinks when stakes are pre-decided",
            "Greed fix: written limits (max trades/day, max size) checked before entry, not after",
            "Both: the weekly review in Trade Review — patterns of under-management show up in the grades fast",
          ),
        ],
        takeaways: [
          "Losses hurt ~2× — plan the stakes so they never surprise",
          "Fear mis-manages winners; greed mis-sizes them",
          "Pre-committed limits convert emotion into arithmetic",
        ],
      },
      {
        id: "lsn-psy-tilt",
        title: "Overtrading, Tilt & Impatience",
        summary: "Volume as a symptom: when activity stops being edge-work and starts being medication.",
        minutes: 8,
        objectives: [
          "Define tilt operationally",
          "Detect overtrading in your own statistics",
          "Design circuit breakers before tilt arrives",
        ],
        blocks: [
          text("Tilt is degraded decision-making under emotional load — borrowed from poker, where it is studied honestly. Its signature: trade frequency spikes, plan adherence collapses, sizes drift up, and every trade has a story. Overtrading is its volume symptom; impatience its timing symptom (entering before the trigger 'because it's close enough')."),
          text("Detection is statistical, which is why it belongs in a journal: compare your last 10 trades against your baseline — frequency, average grade, size, instruments. Deviation beyond your normal band is the alarm. Willpower in-tilt is unreliable; the fixes are structural: daily trade cap, the app's guardrail soft-lock, and the pre-committed rule that after 2 consecutive losses, the next setup must be graded A before entry."),
          risk("Tilt's cost is nonlinear",
            "Tilt rarely costs one bad trade. It costs the recovery trades taken with a damaged process — the streak after the streak. Circuit breakers protect the NEXT ten decisions, which is where the real money lives."),
        ],
        takeaways: [
          "Tilt is detectable in statistics before it is detectable in feelings",
          "Structural breakers beat in-the-moment resolve",
          "Protect the next ten trades, not the current one",
        ],
      },
      {
        id: "lsn-psy-process",
        title: "Process Over Outcome: Routine, Plan & Journal",
        summary: "The identity shift that makes trading survivable: judge decisions, not outcomes — and let the routine carry it.",
        minutes: 9,
        objectives: [
          "Adopt outcome vs process framing",
          "Build a daily routine with journaling at its center",
          "Set expectations that survive losing weeks",
        ],
        blocks: [
          text("The core psychological skill of trading is separating decision quality from outcome quality. A perfect setup that loses was still a good decision; a rules-breaking trade that won was still a liability. Traders who internalize this stop chasing their P&L and start auditing their process — which is the only variable they control."),
          text("Routine is how process survives bad days: pre-market review (levels, news, the plan's A-setups), session execution with gates, post-market journal (grades, emotions, lessons), weekly review (statistics, the lesson kept). The journal is not paperwork — it is the ledger that converts experience into evidence. The Trade Review module's streak exists to make this habit structural."),
          example("The daily loop",
            "State → Decision → Trade → Journal → Review → (next) State.",
            "Every loop either compounds process or leaks it — the grades tell you which.",
          ),
        ],
        takeaways: [
          "Grade decisions, not outcomes — luck is not skill in either direction",
          "Routine carries discipline on the days discipline is absent",
          "The journal is the evidence engine of the whole ecosystem",
        ],
      },
    ],
    quiz: {
      id: "qz-psychology",
      questions: [
        sc("q1", "You take 4 trades in one hour after a stop-out, doubling size, in instruments you never trade. What is this?",
          ["Diversification", "Revenge tilt — and it needs a circuit breaker, not resolve", "Opportunistic flexibility"], 1,
          "Frequency spike + size escalation + unfamiliar instruments after a loss: the classic revenge tilt signature."),
        tf("q2", "A rules-breaking trade that ends in profit is still a process failure worth grading honestly.", true,
          "Outcome ≠ decision quality. Profitable rule-breaks build the habits that eventually produce large losses."),
        mc("q3", "The most reliable anti-tilt tool is:",
          ["Stronger willpower during the session", "Pre-committed structural breakers (trade caps, guardrails, A-grade-only rule)", "Bigger stops"], 1,
          "In-tilt willpower is unreliable by definition. Structure decided in calm beats resolve decided in storm."),
      ],
    },
  },
];

export const ADVANCED_COURSES: AuthoredCourse[] = [
  {
    id: "crs-advanced-systematic",
    categoryId: "cat-advanced",
    title: "Systematic Trading",
    description:
      "Multi-timeframe top-down work, market and volatility regimes, correlation across the book, and the discipline of system development.",
    level: "ADVANCED",
    objectives: [
      "Run a full top-down analysis with written conclusions",
      "Classify regimes and adapt tactics",
      "Design and validate a trading system end to end",
    ],
    lessons: [
      {
        id: "lsn-adv-mtf",
        title: "Multi-Timeframe Analysis, Systematized",
        summary: "From the daily narrative to the execution trigger — a written, repeatable top-down routine.",
        minutes: 9,
        objectives: [
          "Execute a 3-frame top-down in under 10 minutes",
          "Write conclusions per frame before descending",
          "Resolve frame conflicts by rule, not mood",
        ],
        blocks: [
          text("Top-down analysis is a pipeline, not a vibe: frame 1 (weekly/daily) answers 'what is the market doing and where are the levels that matter'; frame 2 (4H/1H) answers 'where is the interesting zone inside that'; frame 3 (15m/5m) answers 'what is my trigger and my invalidation'. Each frame's conclusion is written before descending — the writing is what prevents drift."),
          steps(
            "Frame 1 conclusion: “Daily uptrend, price at prior-week high resistance; no fresh supply signal.”",
            "Frame 2 conclusion: “1H compressing under the high — ascending structure; watch for break or rejection.”",
            "Frame 3 plan: “Long on 15m close above compression with stop under the last HL; skip if the break is on news.”",
          ),
          text("Conflicts resolve by pre-written rule: higher frame wins direction, lower frame wins timing — or the trade doesn't exist. What is forbidden is re-reading the higher frame mid-trade to manufacture permission for a lower-frame impulse."),
        ],
        takeaways: [
          "Write each frame's conclusion before descending",
          "Higher frame = direction; lower frame = timing; conflicts = skip",
          "The pipeline is fast once it is written — 10 minutes, same order, daily",
        ],
      },
      {
        id: "lsn-adv-regimes",
        title: "Market & Volatility Regimes",
        summary: "Trend vs range, high vs low volatility: classifying the weather before choosing the boat.",
        minutes: 9,
        objectives: [
          "Classify regime with simple measurable tools",
          "Adapt strategy family per regime",
          "Handle regime transitions",
        ],
        blocks: [
          text("A regime is the market's current answering pattern to two questions: is price trending or ranging, and is volatility high or low? The matrix gives four weathers, each favoring a different family: trending+calm rewards pullback entries; trending+wild rewards reduced size and wider (ATR) stops; ranging+calm rewards fades; ranging+wild rewards standing aside or trading only the extremes with reduced risk."),
          table(
            ["Regime", "Favors", "Punishes"],
            [
              ["Trend + calm vol", "Pullback/trend-follow", "Mean reversion"],
              ["Trend + high vol", "Reduced-size trend trades, ATR stops", "Tight stops"],
              ["Range + calm vol", "Range fades", "Breakout chasing"],
              ["Range + high vol", "Patience (or extreme fades, small)", "Everything mid-range"],
            ],
          ),
          text("Transitions are where accounts bleed: strategies applied one regime late. Practical tells — ADX direction, band width, structure state — reviewed daily in the same top-down pass. When the regime is unclear, the professional answer is smaller size or no size; 'unclear' is actionable information."),
        ],
        takeaways: [
          "Two axes — trend/range, high/low vol — classify the weather",
          "Match strategy family to regime, adapt stops to volatility",
          "Unclear regime = reduced size, not reduced caution",
        ],
      },
      {
        id: "lsn-adv-system-development",
        title: "System Development, Backtesting & Statistics",
        summary: "From hypothesis to validated system: definition, honest backtest, forward test, statistical verdict.",
        minutes: 11,
        objectives: [
          "Specify a system so precisely it can be tested by a stranger",
          "Avoid the four classic backtest sins",
          "Read performance statistics without lying to yourself",
        ],
        blocks: [
          text("A system is a hypothesis with an implementation manual: instruments, timeframe, regime filter, setup definition, entry trigger, stop rule, exit rule, risk model, and the metrics that will judge it. If a stranger cannot execute your document identically to you, it is not specified — it is improvised."),
          list(
            "Backtest sin 1 — curve fitting: parameters tuned until history flatters you",
            "Backtest sin 2 — survivorship of ideas: keeping only the rules that worked",
            "Backtest sin 3 — fantasy fills: entries at the wick, no spread, no slippage",
            "Backtest sin 4 — tiny samples: 40 trades is an anecdote",
          ),
          text("Forward testing (demo or minimum size) is where execution reality enters: fills, psychology, schedule. Then statistics: expectancy, win rate, average R, max drawdown, and the shape of the equity curve (steady grind vs cliff-riding). Only after all three stages does the size dial move up — and it moves in steps, never leaps."),
          formula("The validation bar", "Positive expectancy + survivable maxDD + n ≥ 100 → scale in steps", "Any leg missing = stay small."),
        ],
        takeaways: [
          "Specify so a stranger could execute it",
          "Four sins: fit, selection, fantasy fills, tiny n",
          "Scale in steps only after expectancy + drawdown + sample all pass",
        ],
      },
    ],
    quiz: {
      id: "qz-advanced-systematic",
      questions: [
        mc("q1", "Trending regime with unusually high volatility. The professional adaptation:",
          ["Tighten stops to protect gains", "Reduce size and widen stops per ATR", "Switch to scalping"], 1,
          "High vol punishes tight stops with random stop-outs — adapt size down, stops out to ATR scale."),
        tf("q2", "A backtest with 40 trades and a beautiful equity curve is sufficient evidence to scale up.", false,
          "Forty trades is an anecdote. Sample, curve-fitting and fill realism all fail before the beauty of the curve counts."),
      ],
    },
  },
  {
    id: "crs-advanced-execution",
    categoryId: "cat-advanced",
    title: "Execution & Statistical Thinking",
    description:
      "Execution quality and slippage accounting, market microstructure essentials, and evaluating performance like a statistician.",
    level: "ADVANCED",
    objectives: [
      "Measure and reduce execution cost",
      "Explain microstructure basics that affect fills",
      "Evaluate performance with statistical honesty",
    ],
    lessons: [
      {
        id: "lsn-adv-execution",
        title: "Execution Quality & Slippage",
        summary: "The invisible tax: intended vs achieved price, and the habits that shrink the gap.",
        minutes: 8,
        objectives: [
          "Measure slippage per entry and exit",
          "Choose order types that fit each context",
          "Compute execution cost against strategy edge",
        ],
        blocks: [
          text("Execution quality is the gap between the trade you planned and the trade you got: intended entry vs actual fill, intended stop vs actual stop fill (including gaps), spread paid, and swap. Averaged over a year this invisible tax can consume a thin edge entirely — which is why the journal's intended-vs-actual fields exist."),
          list(
            "Limit entries where the plan allows — pay spread by choice, not by habit",
            "Avoid market orders in the first seconds after major releases",
            "Trade the liquid sessions for your instrument — thin books tax everyone",
            "Review slippage monthly; a degrading feed or widening broker is data",
          ),
          text("Microstructure in one paragraph: price is an order book — resting bids and asks; market orders cross the spread and consume the book; large orders walk it (that's your slippage on size); stops cluster beyond obvious levels (that's the liquidity lesson again). Understanding the machine demystifies the fills and makes execution choices deliberate."),
        ],
        takeaways: [
          "Measure intended vs achieved — the tax you never see is still paid",
          "Order type per context: limits where allowed, patience around news",
          "A thin edge dies by a thousand fills",
        ],
      },
      {
        id: "lsn-adv-statistics",
        title: "Performance Evaluation & Statistical Thinking",
        summary: "Reading your own results like a quant: sample sizes, variance, drawdowns and the honesty of small numbers.",
        minutes: 10,
        objectives: [
          "Interpret win rate alongside R distribution",
          "Expect realistic losing streaks from any win rate",
          "Run a monthly review that finds real signal",
        ],
        blocks: [
          text("Statistical thinking starts with humility about samples. A 55% system will still produce streaks of 5–7 losses regularly — the arithmetic of streaks is deterministic, not a character flaw. Expect them, budget them (loss limits, drawdown protocol), and never conclude from a handful of trades that 'the system stopped working'."),
          table(
            ["Win rate", "P(loss streak ≥ 5) over 100 trades"],
            [
              ["60%", "very likely (~50%+)"],
              ["50%", "expected (~80%)"],
              ["40%", "near certain"],
            ],
          ),
          text("The monthly review that finds signal: expectancy and average R per setup family; execution cost trend; grade distribution (are A-grades actually your best trades? — if not, your grading is lying); exit-reason distribution; mistake ledger Pareto. Then one decision: the single process change for next month. One. The journal exists to make this conversation with yourself possible."),
          tip("Connect the loop",
            "Analytics finds the weakness → Trade Review writes the lesson → Academy has a course for it. Learn → practice → trade → journal → analyze → learn again: the loop this whole app is built around."),
        ],
        takeaways: [
          "Streaks are arithmetic — budget for them before they arrive",
          "Grade your grading: A-trades must outperform C-trades, or the rubric is noise",
          "One process change per month, chosen from evidence",
        ],
      },
    ],
    quiz: {
      id: "qz-advanced-execution",
      questions: [
        mc("q1", "A 50% win-rate system trades 100 times. A losing streak of at least 5 is:",
        ["Virtually impossible", "Expected — near certain at some point", "Proof the system broke"], 1,
        "Streak arithmetic makes 5-loss streaks expected at 50% — budget them."),
        mc("q2", "Which is the strongest sign your decision grades are meaningful?",
        ["C-grades outperform A-grades", "A-grades outperform C-grades materially", "All grades have equal P&L"], 1,
        "The rubric is honest only when A-decisions statistically outperform C-decisions."),
      ],
    },
  },
];
