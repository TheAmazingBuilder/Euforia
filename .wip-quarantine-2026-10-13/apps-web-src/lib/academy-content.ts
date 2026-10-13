import type { LucideIcon } from "lucide-react";
import {
  BookCheck,
  Brain,
  ChartCandlestick,
  Puzzle,
  Scale,
  Sprout,
} from "lucide-react";

/**
 * Academy curriculum — the educational content of the /academy screen.
 * Static, typed content: no API involved. Lesson completion is persisted
 * locally (see lib/hooks/use-academy-progress.ts).
 */

export type AcademySection = {
  heading: string;
  body: string[];
};

export type AcademyLesson = {
  id: string;
  title: string;
  minutes: number;
  summary: string;
  sections: AcademySection[];
  takeaways: string[];
  /** How the lesson maps to a Cosmoz feature (the "do it now" pointer). */
  cosmozTip: { text: string; href?: string; linkLabel?: string };
};

export type AcademyTrack = {
  id: string;
  title: string;
  tagline: string;
  icon: LucideIcon;
  lessons: AcademyLesson[];
};

export const ACADEMY_TRACKS: AcademyTrack[] = [
  // ──────────────────────────────────────────────────────────────────────────
  // Track 1 — Foundations
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "foundations",
    title: "Foundations",
    tagline: "What trading really is, and why the journal — not the chart — is your edge.",
    icon: Sprout,
    lessons: [
      {
        id: "foundations-why-journal",
        title: "Why a journal is your real edge",
        minutes: 6,
        summary:
          "Your memory is a terrible analyst: it remembers the highlight reel, not the sample. A journal turns scattered impressions into a dataset you can actually coach yourself with.",
        sections: [
          {
            heading: "Memory keeps stories, markets produce data",
            body: [
              "Every trader carries an internal narrative: “I'm good at breakouts but bad at Fridays.” Most of the time that narrative was written by a handful of vivid memories — the huge win, the humiliating loss — rather than by the fifty other trades that quietly contradict it. Human memory over-weights recent and emotionally charged events, which is exactly the wrong filter for a probabilistic activity.",
              "A journal replaces that narrative with a record. Once every decision is captured with its context, reasoning and outcome, you can count things: how often your best setup actually works, what your average loss looks like on tilt days, whether Fridays really are different. Counting beats remembering, every single time.",
            ],
          },
          {
            heading: "The feedback loop professionals pay for",
            body: [
              "Improvement in trading is a loop: act, record, review, adjust. Without the record the loop is broken — you keep acting on the same habits for years while believing you are learning. With it, every week produces evidence about one specific behavior you can fix. The journal is not paperwork after the fact; it is the instrument that makes practice actually count.",
              "This is why Cosmoz asks you to grade decisions instead of only logging results. The grade captures the quality of the choice at the moment you made it, before the outcome was known. Over a sample, grades tell you whether your process is improving independently of whether luck was kind.",
            ],
          },
        ],
        takeaways: [
          "Memory is biased toward recent and emotional events; a journal is not.",
          "If it is not written down with context, it cannot be reviewed or counted.",
          "Grade the decision, not the outcome — outcomes carry too much noise.",
        ],
        cosmozTip: {
          text: "Your journal is already wired for this: each session pairs a pre-market plan with a post-market review, and every trade can be graded after the fact.",
          href: "/journal",
          linkLabel: "Open your journal",
        },
      },
      {
        id: "foundations-markets-costs",
        title: "Markets, costs and how money is actually made",
        minutes: 8,
        summary:
          "Prices are only half the picture. Spreads, commissions, slippage and funding quietly tax every trade — and most retail strategies die to costs long before they die to bad ideas.",
        sections: [
          {
            heading: "You pay to play, on both sides",
            body: [
              "Every position starts slightly against you: the spread between bid and ask, the commission your broker charges, and the slippage between your intended price and your fill. On liquid instruments these costs look trivial; compounded over hundreds of trades they routinely decide whether a year is green or red. A strategy that wins 55% of the time with symmetric wins and losses can be fully consumed by costs at higher frequency.",
              "This is why journaling your costs matters as much as journaling your entries. When your log includes fees and slippage, your analytics show the true net edge instead of a flattering gross one. Many traders discover their “edge” only existed before costs — better to learn that from data than from the account balance.",
            ],
          },
          {
            heading: "Where profit actually comes from",
            body: [
              "Sustainable profit is not prediction heroics; it is a small statistical advantage repeated with discipline. If your average winner is 2R and your average loser is 1R, you can be wrong more often than right and still grow — expectancy, not accuracy, is the goal. Understanding that reframes the job: you are managing a distribution of outcomes, not chasing certainty.",
              "It also reframes instrument choice. Fast markets with wide spreads demand bigger expected moves per trade; slow markets punish overtrading differently. Matching the instrument's noise, costs and your holding time is a foundation most traders skip and later pay for.",
            ],
          },
        ],
        takeaways: [
          "Spread, commission and slippage are a tax on every trade — track them.",
          "Expectancy (average win × rate − average loss × rate) is the real scoreboard.",
          "Fewer, better trades usually survive costs better than frequent small ones.",
        ],
        cosmozTip: {
          text: "Cosmoz records results in R (risk units) and net of costs, so your analytics reflect the edge you actually keep — not the one you had before fees.",
          href: "/analytics",
          linkLabel: "See your analytics",
        },
      },
      {
        id: "foundations-sessions",
        title: "Markets move in sessions",
        minutes: 7,
        summary:
          "Volatility has a schedule. Sessions overlap on the clock, news lands at published times, and the same setup behaves differently at 3 a.m. and at the London open. Trading with the clock beats trading against it.",
        sections: [
          {
            heading: "The market has a daily heartbeat",
            body: [
              "Liquidity is not constant: it pulses. In FX, Asia tends to build ranges, London expands them, and New York either continues or reverses the move — with the London/New York overlap carrying the deepest order flow of the day. Equities have their own rhythm around the open and close, futures layer the overnight on top, and even crypto, open around the clock, breathes with the US session and funding timestamps. The instrument you trade has a personality by hour, and pretending otherwise turns every surprise into a story about “bad luck”.",
              "Your job is not to memorize folklore but to observe where in the day your results live. Many traders discover their edge only exists in one or two windows — and that the rest of the day is where their drawdowns are manufactured. Once you see it, the disciplined move is uncomfortable but obvious: trade the window, watch the rest.",
            ],
          },
          {
            heading: "News is not a surprise, it is an appointment",
            body: [
              "Rate decisions, inflation prints and employment reports are published on a schedule anyone can read. The volatility they create is therefore not an accident you react to — it is a window you planned for, sized for, or deliberately sat out. Trading through a red-folder release with full size “to catch the move” is a strategy decision; doing it by habit because the platform was open is how accounts leak.",
              "The professional posture is boring and effective: know the calendar before the session, mark the windows, and decide in advance whether you are flat, reduced or running a defined news plan. Whatever you choose, it becomes auditable — the journal shows whether your news rules pay or cost, instead of leaving it to memory.",
            ],
          },
        ],
        takeaways: [
          "Sessions set the volatility regime; overlap hours carry the most liquidity.",
          "High-impact news is scheduled — plan the window, halve the size, or stand aside.",
          "Tag time-of-day in your journal; your best and worst hours are data, not folklore.",
        ],
        cosmozTip: {
          text: "Cosmoz timestamps every trade and flags high-impact releases ahead of time, and the By Time analytics tab shows which windows actually pay you.",
          href: "/calendar",
          linkLabel: "Check today's calendar",
        },
      },
      {
        id: "foundations-orders",
        title: "Order types and execution",
        minutes: 7,
        summary:
          "Between the idea and the position stands an order. Market, limit and stop each trade certainty of fill against certainty of price — and sloppy execution quietly taxes even a perfect plan.",
        sections: [
          {
            heading: "Three orders, three trades-offs",
            body: [
              "A market order buys immediacy: you are filled now, at whatever the book offers — spread and slippage included. A limit order buys price: you name your level, but the fill is never guaranteed, and the best-looking entries are exactly the ones that run without you. A stop order defers the decision: it sleeps until a price triggers it, then becomes a market order — which is why it powers both protective exits and breakout entries. None is “best”; each is the right tool for a different job, and misusing one shows up in your fills long before it shows up in your feelings.",
              "The practical mapping: entries at your level with patience → limit; exits and “I must be out at X” → stop; momentum you refuse to miss at any price → market, accepting the toll. What matters is that the choice was made for a reason you can write down, not by whichever button was closest.",
            ],
          },
          {
            heading: "Execution is part of the edge",
            body: [
              "Over hundreds of trades, execution quality is a measurable component of expectancy, not noise. Average a few tenths of a point of slippage per trade and you have quietly donated a full R over a month of trading. Stops placed inside spread noise get tagged by random wiggles; entries chased after the move start the trade already underwater. None of this feels dramatic in the moment — it accumulates like a bank fee you never notice.",
              "So measure it. Compare the price you planned with the price you got, and let the sample tell you whether your execution is an edge, a cost, or a leak. Traders who journal fills discover patterns: worse fills at session opens, worse fills when chasing, worse fills on fast instruments — each one fixable with a rule once it is visible.",
            ],
          },
        ],
        takeaways: [
          "Market buys immediacy, limit buys price, stop defers the decision — pick by job.",
          "Every fill pays spread and slippage; measure them instead of guessing.",
          "Record planned vs actual price; execution drift is a leak with a fix.",
        ],
        cosmozTip: {
          text: "The capture flow records your planned entry and stop next to the real fill, and ghost trades let you rehearse execution with zero account risk.",
          href: "/trades",
          linkLabel: "Review your fills",
        },
      },
      {
        id: "foundations-anatomy",
        title: "The anatomy of a trade",
        minutes: 7,
        summary:
          "A professional trade is not one decision — it is six small ones in sequence. Knowing each stage turns “trading” from a vibe into a checklist you can audit.",
        sections: [
          {
            heading: "Six stages, six auditable decisions",
            body: [
              "Every trade passes through the same stages: watch for a setup you have defined, qualify it against your criteria, size it from your risk and stop distance, enter with a plan, manage it (hold, scale, trail), and exit. Each stage can fail independently — a great entry with an arbitrary stop is still a broken trade. Naming the stages is the first step toward seeing which one actually leaks money for you.",
              "When you journal, tag which stage you executed well and which you improvised. Over time you will find your leaks are concentrated: most traders have one or two stages that cause the majority of damage. Fixing a single stage with a rule is infinitely easier than “becoming more disciplined” in general.",
            ],
          },
          {
            heading: "The exit was decided before the entry",
            body: [
              "The defining habit of professionals: the stop and the invalidation are decided before the position exists. If you cannot articulate what would prove the idea wrong, you do not have a trade — you have an opinion. Pre-committing converts the exit from a live emotional negotiation into an execution detail.",
              "The same applies to targets and management. “I'll take it off if it feels heavy” is not management. “I move to break-even at 1R and scale half at 2R” is. Write the management plan while flat, when you are objectively smarter about the position than you will ever be while in it.",
            ],
          },
        ],
        takeaways: [
          "Setup → qualify → size → enter → manage → exit: six stages, six decisions.",
          "Your leaks are probably concentrated in one or two stages — find them in the data.",
          "No invalidation criterion means no trade, only an opinion.",
        ],
        cosmozTip: {
          text: "Cosmoz mirrors these stages literally: the capture flow walks setup, sizing, entry and grading, and the judgment gate asks for your conviction before the reveal.",
          href: "/session",
          linkLabel: "Run a session",
        },
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Track 2 — Risk Management
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "risk",
    title: "Risk Management",
    tagline: "Survive first. The mathematics of staying in the game while the edge plays out.",
    icon: Scale,
    lessons: [
      {
        id: "risk-one-percent",
        title: "Risk per trade and the 1% rule",
        minutes: 8,
        summary:
          "Risking a small, fixed fraction of the account per trade is what makes a losing streak an inconvenience instead of an ending.",
        sections: [
          {
            heading: "Why percentages, not amounts",
            body: [
              "Risking a fixed dollar amount means your risk silently grows as the account grows and becomes ruinous as it shrinks. Risking a fixed fraction — typically 0.5% to 1% per trade — scales automatically: you bet less in drawdowns and more from strength, which flattens the equity curve precisely when you are most vulnerable.",
              "The 1% rule is not superstition, it is arithmetic about survival. At 1% per trade, twenty consecutive losses — a level of bad luck almost nobody experiences — still leaves roughly 82% of the account. At 10% per trade, the same streak leaves barely 12%. The small fraction buys you the one thing every edge requires: enough samples for the statistics to show up.",
            ],
          },
          {
            heading: "Calibrate to your worst realistic run",
            body: [
              "Your risk per trade should be set so that your worst plausible losing streak is a dull month, not a catastrophe. A system that loses 60% of the time will routinely produce streaks of 6–8 losses; size so that eight in a row is survivable and emotionally boring. If a losing week makes you trade differently, the fraction is too high regardless of the math.",
              "Also account for execution reality: gaps, slippage and stops filled beyond their level mean your true loss is occasionally larger than planned. Traders near dense sizing discover that “1% planned” is sometimes 2% realized — another reason the fixed fraction stays conservative.",
            ],
          },
        ],
        takeaways: [
          "Fixed fractional risk (0.5–1%) beats fixed dollar amounts at every point of the curve.",
          "Survival math: small risk keeps losing streaks boring and recoverable.",
          "Size for your worst realistic streak, not your average one.",
        ],
        cosmozTip: {
          text: "Set your default risk % once in Settings; every capture then sizes itself from it automatically.",
          href: "/settings",
          linkLabel: "Set your risk default",
        },
      },
      {
        id: "risk-position-sizing",
        title: "Position sizing: from stop distance to lot size",
        minutes: 10,
        summary:
          "Sizing is a formula, not a feeling: risk amount ÷ stop distance. Learning it by hand once makes every future position a two-second decision.",
        sections: [
          {
            heading: "The only sizing formula you need",
            body: [
              "Position size = (account × risk %) ÷ (entry − stop). If your account is 10,000, you risk 1% (100), and your stop is 50 ticks away, each tick of size costs you 2. That is the whole formula — everything else (lots, contracts, units, leverage) is unit conversion on top of it.",
              "Notice what this makes obvious: size and stop distance are inversely locked. A wider stop means a smaller position for the same risk, which is why “giving the trade more room” by arbitrarily widening stops while keeping size constant is quietly doubling your risk. Professionals widen the stop and shrink the size in the same motion.",
            ],
          },
          {
            heading: "R: the unit that normalizes everything",
            body: [
              "Once size comes from risk, every outcome can be measured in R — multiples of what you planned to lose. A +2.4R trade and a −1R loss mean the same thing on a 5,000 account and a 500,000 account. R strips out account size and instrument noise, which is what lets you compare setups, days and months honestly.",
              "This is also why journaling in R accelerates learning: “I made 400” tells you nothing about quality; “I closed at +0.8R against a planned 3R target” immediately raises the question of exits. The Cosmoz sizer computes the lot from your stop and risk % live, and every logged trade stores its R multiple for exactly this reason.",
            ],
          },
        ],
        takeaways: [
          "Size = risk amount ÷ stop distance — do it before the entry, always.",
          "Wider stop ⇒ smaller size. Never widen the stop without shrinking size.",
          "Measure outcomes in R so results are comparable across time and accounts.",
        ],
        cosmozTip: {
          text: "The capture sizer does this math live: enter risk % and stop, read the lot — and the trade is stored in R from day one.",
          href: "/trades",
          linkLabel: "Open trades & sizer",
        },
      },
      {
        id: "risk-drawdowns",
        title: "Drawdowns and the math of recovery",
        minutes: 7,
        summary:
          "Losses and gains are not symmetric: the deeper the hole, the harder the climb out. Daily limits and circuit breakers exist to keep you on the gentle part of that curve.",
        sections: [
          {
            heading: "The asymmetric climb",
            body: [
              "A 10% drawdown needs an 11% gain to recover. A 50% drawdown needs 100%. A 90% drawdown needs 900%. Recovery requirements grow non-linearly, which is the mathematical argument for aggression in protecting capital and patience in growing it. Two traders with identical systems can have wildly different years purely based on how deep their worst hole was.",
              "Drawdown also attacks the mind. Research and lived experience agree: decision quality degrades in drawdown — cutting winners early, widening stops, oversized revenge trades. The cost of a drawdown is rarely just the percentage; it is the two weeks of degraded decisions that follow it.",
            ],
          },
          {
            heading: "Circuit breakers: pre-committing to stop",
            body: [
              "Daily and weekly loss limits are not signs of weakness; they are pre-committed circuit breakers that fire while you are still rational. Decide once — “three losses or −2R in a day and I'm done” — and the decision no longer depends on willpower at 2pm after two stop-outs. The rule makes the choice you already know is right.",
              "Treat the limit like a hard risk-management boundary, not a suggestion to renegotiate mid-session. In Cosmoz, discipline is scored partly on how rarely your limits even get touched, and settling a day over limit costs you more than the money did — by design, because the habit is worth more than any single session.",
            ],
          },
        ],
        takeaways: [
          "Recovery math is asymmetric: protect capital before chasing returns.",
          "Decision quality degrades in drawdown — the real cost is what happens next.",
          "Daily/weekly loss limits convert willpower problems into non-decisions.",
        ],
        cosmozTip: {
          text: "Your daily loss limit lives on the Discipline screen and is enforced during live sessions — the day ends before the hole gets deep.",
          href: "/discipline",
          linkLabel: "Check your limits",
        },
      },
      {
        id: "risk-portfolio-heat",
        title: "Portfolio heat and correlated exposure",
        minutes: 8,
        summary:
          "Three positions that look separate can be one trade wearing three costumes. Portfolio heat — total open risk — is the honest measure of how much you actually have on.",
        sections: [
          {
            heading: "Correlation is the hidden position",
            body: [
              "Long EUR/USD, short USD/CHF, long gold: three tickets, arguably one position — short the dollar. When the dollar rips, all three stops are hit in the same hour, and your “diversified” book takes one large loss wearing three masks. Risk is not counted per ticket; it is counted per independent outcome.",
              "The practical habit is to group open positions by their shared driver — same currency, same sector, same macro factor — and treat the group's summed risk as one trade. If that combined number would be an uncomfortable single position, it is an uncomfortable portfolio, whatever the ticket count says.",
            ],
          },
          {
            heading: "Heat: the number that keeps you honest",
            body: [
              "Portfolio heat is the sum of risk across all open positions if every stop is hit. Capping heat (commonly 2–3% for single-account retail trading) converts an invisible accumulation into a visible budget: every new trade spends some of it, and when the budget is spent, the answer to “should I add one more?” is already written.",
              "Heat discipline also fixes the pyramiding question. Adding to winners is fine when total heat stays inside the cap and the additions are sized by the same formula from their own stops. It is ruinous when each add quietly stacks more risk onto one correlated outcome. Same rule covers both: the budget decides, not the excitement.",
            ],
          },
        ],
        takeaways: [
          "Count risk per independent driver, not per ticket.",
          "Portfolio heat = total open risk if all stops hit. Cap it in advance.",
          "Pyramiding is safe only while the heat budget says yes.",
        ],
        cosmozTip: {
          text: "Cosmoz computes your open heat from live positions during a session, so the budget is visible before you approve the next trade.",
          href: "/session",
          linkLabel: "Open session live",
        },
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Track 3 — Trading Psychology
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "psychology",
    title: "Trading Psychology",
    tagline: "The market is a machine for producing feelings. Your job is to trade the plan anyway.",
    icon: Brain,
    lessons: [
      {
        id: "psych-process-outcome",
        title: "Judge decisions, not outcomes",
        minutes: 7,
        summary:
          "A good decision can lose and a terrible one can win. If outcomes are the only scoreboard, you will train yourself into exactly the habits that destroy accounts.",
        sections: [
          {
            heading: "The outcome bias trap",
            body: [
              "When a reckless trade pays, your brain files “reckless works.” When a textbook trade stops out, it files “the process failed.” Both lessons are wrong, and over hundreds of repetitions they quietly rewrite your behavior toward whatever feels best in the moment. This is outcome bias, and trading — a noisy, probabilistic environment — is its perfect breeding ground.",
              "The fix is grading decisions at the moment they are made. You knew, before the reveal, whether the setup matched your criteria, the size followed the formula, and the plan was written. That grade reflects the only thing you control. Outcomes are a collaboration between your decision and the market's mood; grades are yours alone.",
            ],
          },
          {
            heading: "Gaming the process, never the P&L",
            body: [
              "Once grades exist, a subtle trap appears: chasing the grade instead of the process — logging tidy justifications after the fact to make past decisions look planned. The journal only coaches you if it stays honest; a flattering journal is a mirror painted over. Write what you actually did, especially when it was sloppy. The data exists to serve next month's you, not to impress today's you.",
              "This is why Cosmoz separates celebration from judgment: streaks and scores reward process behaviors (limits respected, trades graded, rules followed) and deliberately never the P&L. You can have a red month and a green discipline score — and if that month was a chop-fest you navigated calmly, the score is the truthful one.",
            ],
          },
        ],
        takeaways: [
          "Outcome bias rewards recklessness after lucky wins — grade at decision time.",
          "You control the decision; the market controls the result. Score accordingly.",
          "Keep the journal honest: it coaches the future you, not flatters the current one.",
        ],
        cosmozTip: {
          text: "Every Cosmoz trade can be graded through the judgment gate — conviction before the reveal, review after — building a decision-quality dataset no spreadsheet gives you.",
          href: "/trades",
          linkLabel: "Grade a trade",
        },
      },
      {
        id: "psych-tilt",
        title: "Tilt: recognize, interrupt, recover",
        minutes: 8,
        summary:
          "Tilt is not anger — it is any state where the next trade serves your feelings instead of your plan. The skill is catching it early enough that a rule, not a mood, ends the session.",
        sections: [
          {
            heading: "What tilt actually is",
            body: [
              "Tilt is any deviation of decision-making caused by emotion rather than plan: rage after a loss, euphoria after a win, numbness after an hour of chop. The common signature is that trades start serving the feeling — get it back, get more, feel something — instead of the criteria. Nobody tilts on purpose; everyone tilts, including people who “don't have emotions.”",
              "It has a physical fingerprint before it has a financial one: faster clicking, leaning into the screen, checking the P&L every few seconds, narrating the market defensively. Learning your personal early tells is worth more than any indicator, because by the time the behavior reaches the order ticket the session is usually already lost.",
            ],
          },
          {
            heading: "Interrupt, then recover on purpose",
            body: [
              "The interrupt must be pre-committed: a hard rule like “two consecutive losses or one rule violation → mandatory 20-minute break, platform closed.” In the moment you will not want to obey it; that is precisely the point — it was written by the rational version of you for the compromised version of you.",
              "Recovery is also mechanical, not motivational: step away from screens, move, breathe slowly, write two sentences about what triggered it, and return only with a written reason to trade at all. If no reason survives the writing, the day is done — and logging it in Cosmoz as a settled violation turns a bad hour into a data point that protects the next twenty sessions.",
            ],
          },
        ],
        takeaways: [
          "Tilt = feelings steering trades. It includes euphoria, not just anger.",
          "Learn your physical tells — they arrive before the financial damage.",
          "Breaks and session-end rules must be pre-committed, not negotiated live.",
        ],
        cosmozTip: {
          text: "Cosmoz tracks tilt signals — violations, overtrading days, post-loss behavior — on the Discipline screen, so your patterns are visible instead of guessed.",
          href: "/discipline",
          linkLabel: "See tilt signals",
        },
      },
      {
        id: "psych-leaks",
        title: "FOMO, revenge and overtrading",
        minutes: 8,
        summary:
          "Three classic leaks, three different fuels, three specific counters. Find yours in the data — they are far more predictable than they feel in the moment.",
        sections: [
          {
            heading: "FOMO: paying retail for someone else's entry",
            body: [
              "Fear of missing out buys you the top of a move someone else planned from the bottom: late entry, worst price, no invalidation, maximum crowd. The feeling is seductive precisely because the market is moving without you — but a move that started without your setup ending inside your risk window is, by definition, not your trade.",
              "The counter is a rule about lateness, not about courage: “if price has already traveled X beyond my level, the setup is invalid.” Write the distance in advance. Chasing is also a sizing problem — late entries get smaller, never bigger, because the invalidation point is necessarily further away and the edge is necessarily thinner.",
            ],
          },
          {
            heading: "Revenge and overtrading: quantity as a feeling",
            body: [
              "Revenge trading wants one thing: the loss back, quickly, with size — it converts your stop-out into the market's problem. Overtrading is its quieter cousin: same boredom, less drama, a slow drip of B-grade setups until the day's expectancy is negative. Both share one tell — trade frequency and quality decouple from the plan.",
              "Counters are mechanical: a hard cap on trades per session, a cooling-off interval after every loss, and a rule that re-entry after a stop requires the setup to be fully valid again, not “close enough because I already lost once.” Your journal will show exactly which days these rules would have saved — that evidence is what makes the rule feel like freedom instead of handcuffs.",
            ],
          },
        ],
        takeaways: [
          "FOMO is a lateness problem — predefine when the setup is invalid.",
          "Revenge = the loss back; overtrading = the boredom numbed. Same leak, different volume.",
          "Caps on trades per session and cool-downs after losses beat willpower every time.",
        ],
        cosmozTip: {
          text: "Session Live enforces per-session trade caps and shows your heat before every approval — the counters are built into the flow, not left to memory.",
          href: "/session",
          linkLabel: "Set session caps",
        },
      },
      {
        id: "psych-confidence",
        title: "Confidence, slumps and sample size",
        minutes: 7,
        summary:
          "Confidence that comes from last week's results is fragile by construction. Confidence that comes from trusting your sample survives any streak.",
        sections: [
          {
            heading: "Why streaks lie",
            body: [
              "A coin flipped ten times lands on one side six or seven times often enough that a 70% hot streak means nothing. Ten trades is not a sample — it is noise wearing a suit. Yet those ten trades will move your confidence, your mood and often your sizing more than the thousand-trade statistics that actually describe your edge. Traders in slumps are usually experiencing arithmetic they would never misread in a casino.",
              "The mature response to a losing streak is to ask exactly two questions: am I still executing my process (check the grades, the violations, the journal), and is my edge still statistically intact (check the analytics over a real sample)? If both answers are yes, the streak is weather. If the first answer is no, the fix is execution, not despair.",
            ],
          },
          {
            heading: "Slump protocol: smaller, cleaner, shorter",
            body: [
              "Professionals respond to slumps by shrinking: smaller size, fewer setups (often just the single best one), shorter days. This is not timidity — it is reducing the cost of the slump while its cause is investigated, the same way a pilot reduces workload during an abnormal situation. Scaling down is a skill; scaling up after repairs is the reward.",
              "Confidence is rebuilt the same way it was first earned: by stacking clean executions, not by stacking wins. Cosmoz's discipline streaks exist for exactly this — they make “I respected every limit for 12 sessions” visible and gamified, which is the only streak worth chasing. The P&L version will follow it, on its own schedule.",
            ],
          },
        ],
        takeaways: [
          "Short streaks are noise; only a real sample says anything about your edge.",
          "Slump protocol: shrink size, narrow setups, shorten days.",
          "Rebuild confidence with clean executions — the process streak, not the P&L.",
        ],
        cosmozTip: {
          text: "Discipline streaks reward consecutive clean sessions — the process scoreboard that stays green even when the market disagrees.",
          href: "/discipline",
          linkLabel: "View your streaks",
        },
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Track 4 — Technical Analysis
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "technical",
    title: "Technical Analysis",
    tagline: "Reading price as a map of decisions — structure first, indicators last.",
    icon: ChartCandlestick,
    lessons: [
      {
        id: "ta-structure",
        title: "Candles, structure and context",
        minutes: 9,
        summary:
          "A candle is a sentence about who won a timeframe's argument. Structure — highs, lows and their sequence — is the grammar that turns candles into a story.",
        sections: [
          {
            heading: "Read the auction, not the shapes",
            body: [
              "Each candle summarizes an auction: where price opened, how far buyers and sellers pushed, and where it settled. A long lower wick means sellers pushed and buyers rejected; a doji means neither side won. Alone, one candle means little — the mistake beginners make is memorizing patterns (“hammer = bullish”) without asking where and when the pattern appeared.",
              "Context is what upgrades pattern recognition into analysis. The same hammer at a support level after a decline, in an uptrend's pullback, means something entirely different than the identical candle mid-range on low volume. Before any pattern: where are we (trend, range, after a big move), and whose turn is it to be trapped?",
            ],
          },
          {
            heading: "Structure: the sequence that defines the regime",
            body: [
              "Markets are always in one of two regimes: trending (higher highs and higher lows, or the inverse) or ranging (levels holding, rotations between edges). The sequence of swing highs and lows is how you tell them apart — and the regime dictates the playbook. Breakout strategies die in ranges; fade-the-edge strategies die in trends.",
              "A practical habit: before every session, write one sentence — “price is in an X making Y” (“uptrend making higher lows into daily support”). If you cannot write the sentence, you do not have a read, and trading without a read is donating. The sentence also sets your default posture: with the trend on pullbacks, or at range edges, or flat.",
            ],
          },
        ],
        takeaways: [
          "One candle is a sentence; context decides whether it matters.",
          "Identify the regime first — trend or range — then pick the matching playbook.",
          "No one-sentence read of the chart means no trade.",
        ],
        cosmozTip: {
          text: "Write your regime read in the pre-market plan; after the close, the journal asks whether the market honored it — that's how reads get calibrated.",
          href: "/journal",
          linkLabel: "Plan tomorrow's read",
        },
      },
      {
        id: "ta-levels",
        title: "Support, resistance and liquidity",
        minutes: 8,
        summary:
          "Levels hold because orders cluster there — and break for the same reason. Knowing whose stops live where turns lines on a chart into a map of intent.",
        sections: [
          {
            heading: "Why levels exist",
            body: [
              "Support and resistance are not magic lines; they are price zones where one side previously demonstrated commitment — prior swing points, session extremes, high-volume nodes. Orders cluster near them: breakout traders above, value buyers below, protective stops beyond. The level is a memo about where decisions were last made, and markets revisit decisions.",
              "The first test of a level is the most honest; each subsequent touch usually weakens it as the easy liquidity gets consumed. A level that has bounced five times is closer to breaking than a fresh one — everyone who “bought the low” is now defensive, and the trade becomes crowded precisely because it is obvious.",
            ],
          },
          {
            heading: "Stops belong beyond the noise, not at the obvious line",
            body: [
              "Obvious levels attract stop clusters just beyond them — below the low, above the high. Price routinely sweeps those stops before the real move (“stop hunt”, or less conspiratorially, liquidity seeking). If your stop sits exactly where everyone else's is, you are donating to the sweep even when your directional idea was right.",
              "Practical placement: beyond the level plus a buffer for noise (ATR-based or structure-based), at a price that would genuinely invalidate the idea — not merely “the line minus a tick.” Then let the sizing formula tell you the position size that buffer allows. Invalidations are chosen for correctness; size adapts to them, never the reverse.",
            ],
          },
        ],
        takeaways: [
          "Levels are decision zones with order clusters — fresh tests beat worn ones.",
          "Assume stops just beyond obvious levels will be swept; add a real buffer.",
          "Pick invalidation for correctness, then size to it — never resize the risk after.",
        ],
        cosmozTip: {
          text: "When you capture a trade, the stop and its distance feed the sizer directly — structure-based invalidation and correct sizing stay coupled.",
          href: "/trades",
          linkLabel: "Capture with a stop",
        },
      },
      {
        id: "ta-confluence",
        title: "Confluence: building the A+ setup",
        minutes: 7,
        summary:
          "One reason to trade is a coin flip with fees. Stacked, independent reasons — level, structure, context — are how a setup earns the A grade.",
        sections: [
          {
            heading: "Stack independent reasons, not repeated ones",
            body: [
              "Confluence means multiple independent signals pointing the same way at the same place: a daily support level, inside an uptrend's pullback, at a session timing window, with a momentum shift on the entry timeframe. Each factor adds expectancy because each answers a different failure mode — level answers “where”, structure answers “which side”, timing answers “when”.",
              "The word that matters is independent. Three momentum indicators all derived from closing prices are one opinion said three times; they will fail together. Real confluence mixes different kinds of evidence — location, structure, volatility state, session context — so that the setup surviving three different questions is genuinely rare.",
            ],
          },
          {
            heading: "Grade setups before you take them",
            body: [
              "Write down, in advance, what makes your A+ setup: the two or three factors that must all be present. Then grade live setups against that definition — A, B, C — and let the grade drive size (A full, B half, C zero). This single habit converts “should I take this?” from a mood into a lookup.",
              "Your journal is where the definition gets calibrated. After a real sample, the analytics will show whether your A setups actually outperform your B setups — sometimes they don't, and that discovery is pure profit. The playbook is a living document precisely because grades and outcomes keep auditing each other.",
            ],
          },
        ],
        takeaways: [
          "Confluence = independent factors (where / which side / when) agreeing.",
          "Derived-from-the-same-data indicators are one opinion, not three.",
          "Predefine the A setup; let the grade drive size. Audit it with data.",
        ],
        cosmozTip: {
          text: "Your playbook stores each setup's criteria and grade — the capture flow makes you pick the setup, so grading happens before entry, not after regret.",
          href: "/playbook",
          linkLabel: "Define your A+ setups",
        },
      },
      {
        id: "ta-timeframes",
        title: "Timeframes and top-down analysis",
        minutes: 8,
        summary:
          "Higher timeframes decide the side and the zone; lower timeframes decide the moment. Mixing those jobs in one chart is how traders buy tops in uptrends.",
        sections: [
          {
            heading: "Each timeframe has one job",
            body: [
              "Top-down analysis assigns roles: the higher timeframe (daily/4H) answers “which side should I even consider, and where are the zones that matter?” The mid timeframe frames the setup; the execution timeframe (5–15min) answers “when, precisely, do I act, and where does the stop go?” Problems start when one chart is asked to do all three jobs — it can't, and the compromise it produces is usually the worst of each.",
              "Counter-trend trades that “keep failing” are often just execution-timeframe entries against a daily that never gave permission. The fix is procedural, not analytical: no setup counts unless the higher-timeframe sentence supports it. If daily says uptrend, you are looking for longs at zones — everything else is entertainment.",
            ],
          },
          {
            heading: "The bias → zone → trigger routine",
            body: [
              "A repeatable routine beats chart-flipping: (1) write the higher-timeframe bias in one sentence; (2) mark two or three zones where that bias says to act; (3) drop to execution timeframe only when price reaches a zone, and wait for your trigger there. The routine keeps you out of the middle of ranges and out of trades that exist only because you were watching.",
              "It also structures the journal: bias, zone, trigger, outcome. Over a sample you learn which of the three layers leaks — biases wrong, zones misplaced, or triggers early. Each has a different fix, and no fix is possible until the failure is localized to a layer.",
            ],
          },
        ],
        takeaways: [
          "HTF picks side and zones; LTF picks the moment. Keep the jobs separate.",
          "No entry unless the higher-timeframe sentence supports it.",
          "Journal bias → zone → trigger → outcome to localize your leak.",
        ],
        cosmozTip: {
          text: "Session Live's pre-market plan mirrors this routine — bias and zones written before the open, triggers checked during the session.",
          href: "/session",
          linkLabel: "Start with a plan",
        },
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Track 5 — Strategy & Playbook
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "strategy",
    title: "Strategy & Playbook",
    tagline: "An edge is a hypothesis. The playbook is how you run experiments on yourself.",
    icon: Puzzle,
    lessons: [
      {
        id: "edge-expectancy",
        title: "What an edge really is",
        minutes: 8,
        summary:
          "An edge is a positive expectancy repeated enough times — not a feeling, not a pattern you once saw work. The formula is simple; the honesty it demands is not.",
        sections: [
          {
            heading: "The expectancy formula, without romance",
            body: [
              "Expectancy = (win rate × average win) − (loss rate × average loss), measured in R. A 40% win rate with 2.5R average winners is a strong business: 0.4×2.5 − 0.6×1 = +0.4R per trade. A 70% win rate with 0.3R winners and 1R losers is a slow leak: 0.7×0.3 − 0.3×1 = −0.09R. Win rate alone tells you almost nothing — the market is full of high-win-rate strategies that die on one bad month.",
              "Edge also has a frequency dimension: +0.4R per trade taken twice a month is a hobby; +0.1R taken daily is a business. And it has a decay dimension — edges erode as they get crowded or as regimes shift. This is why the journal's sample matters: it is the only instrument that can tell you whether the edge is still there this quarter.",
            ],
          },
          {
            heading: "Small samples flatter everyone",
            body: [
              "Ten trades cannot distinguish a real edge from luck — the variance of a 50%-win-rate system over ten trades routinely produces 70%+ hot streaks and 30% cold ones. The uncomfortable implication: most of your strong opinions about your trading are currently based on noise. The number of trades needed for confidence is larger than intuition says — hundreds, not dozens, for tight estimates.",
              "The professional stance is humility plus data: act as if the edge exists, but let the running sample keep voting. When Cosmoz shows a setup's win rate, it also shows how many trades that rate is built on — a rate always carries its n. A 65% win rate on 8 trades is a curiosity; the same rate on 90 trades is a fact you can size up against.",
            ],
          },
        ],
        takeaways: [
          "Expectancy (in R) is the only scoreboard — win rate alone is meaningless.",
          "Frequency × expectancy = the business; decay is normal, keep auditing.",
          "A rate always carries its sample size — respect the n before you size up.",
        ],
        cosmozTip: {
          text: "The By Strategy analytics tab shows each setup's expectancy and its sample size side by side — exactly the audit this lesson asks for.",
          href: "/analytics",
          linkLabel: "Audit your setups",
        },
      },
      {
        id: "edge-rules",
        title: "Writing rules you will actually follow",
        minutes: 8,
        summary:
          "A rule that can be argued with mid-session does not exist. Playbook rules work when they are binary, written in advance, and boring enough to execute at 2pm.",
        sections: [
          {
            heading: "Binary beats vibes",
            body: [
              "“Enter when the market looks strong” is not a rule; it is a mood with ambitions. “”Enter on a 15-minute close above the level, after a pullback that held it, with the daily in an uptrend“ is a rule — every element is yes/no, observable by anyone. The test for every line in your playbook: could a stranger execute it from your description and get the same trades? If yes, it can be followed, measured and improved. If no, it will be negotiated live, and live-negotiation always resolves to feelings.",
              "Every setup needs the same skeleton: location (where the idea lives), trigger (what confirms), invalidation (what kills it — a price, not a feeling), target or management plan, and size bucket (A/B/C). Missing skeleton parts are where discretion leaks in — and discretion under adrenaline is the most expensive software you will ever run.",
            ],
          },
          {
            heading: "Rules are for the version of you under pressure",
            body: [
              "You write rules while calm, rested and flat; you execute them while adrenalized, invested and watched by your own P&L. Those are different people. The playbook is a letter from your best self to your worst one — which is why the rules should slightly embarrass you with their simplicity. If a rule needs interpretation at 2pm, rewrite it until it doesn't.",
              "Expect the rules to feel restrictive exactly when they are saving you: the day you most want to skip the checklist is statistically the day the checklist earns its keep. Cosmoz's discipline score measures how rarely you even needed to bend a rule — the meta-goal is a playbook so clear that following it is easier than breaking it.",
            ],
          },
        ],
        takeaways: [
          "Every rule must be binary and stranger-executable.",
          "Setup skeleton: location, trigger, invalidation, management, size bucket.",
          "Rules are letters from your calm self to your pressured self — keep them simple.",
        ],
        cosmozTip: {
          text: "Each playbook entry in Cosmoz has exactly this skeleton — criteria, invalidation, checklist — and trades must reference a setup at capture.",
          href: "/playbook",
          linkLabel: "Open your playbook",
        },
      },
      {
        id: "edge-testing",
        title: "Test before you trust: backtest, ghost, scale",
        minutes: 8,
        summary:
          "A new idea goes through three gates — backtest, ghost trades, live at reduced size — before it earns full risk. Skipping gates is how accounts pay for tuition twice.",
        sections: [
          {
            heading: "Gate 1: backtest — does it ever work?",
            body: [
              "A backtest answers one narrow question: did this rule-set have positive expectancy historically, over a sample big enough to matter? It does not promise the future, and it is easily fooled (overfitting to one instrument, one regime, or one glorious year). But if the idea cannot survive history, live capital teaches the same lesson at a thousand times the cost.",
              "Keep it honest: define the rules completely before testing (or the rules will quietly mutate to fit the answers), include costs, and count the sample. A backtest that required perfect fills at the high or the low is fiction. The output is not “this works” but “this deserves the next gate”.",
            ],
          },
          {
            heading: "Gates 2 and 3: ghost, then scale",
            body: [
              "Ghost trading — logging trades you would have taken, without money — tests the part backtests can't: your ability to execute the rules in real time. Twenty to thirty ghost trades in live market conditions tell you whether the setup is actually capturable and whether you actually follow it. Cosmoz has this mode built in: setup seen, not taken, settled honestly against what the market did.",
              "Only then does the idea go live — at reduced size (a quarter or half risk) until a real sample accumulates and the live expectancy resembles the tested one. Scaling up is earned by data, not by excitement after three winners. Each gate costs a little time; skipping gates costs the account. You choose the currency.",
            ],
          },
        ],
        takeaways: [
          "Backtest with complete, pre-written rules and honest costs — it buys the next gate only.",
          "Ghost trades test real-time execution, which backtests cannot.",
          "Live at reduced size until live data resembles tested data — then scale.",
        ],
        cosmozTip: {
          text: "The “Setup seen, not taken” button logs ghost trades that settle against real outcomes — tuition-free evidence for your playbook.",
          href: "/session",
          linkLabel: "Log a ghost trade",
        },
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Track 6 — Journaling & Review
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "journaling",
    title: "Journaling & Review",
    tagline: "Data is only coaching if someone reads it. The daily and weekly loops are where the learning happens.",
    icon: BookCheck,
    lessons: [
      {
        id: "loop-daily",
        title: "The daily loop: plan, execute, review",
        minutes: 7,
        summary:
          "A trading day has three distinct acts with three distinct documents. Collapsing them into one blur is why most journals die by February.",
        sections: [
          {
            heading: "Act 1 — the plan (before the open)",
            body: [
              "The pre-market plan is short and written: bias in one sentence, the two or three zones that matter, which playbook setups qualify, the day's risk budget and session boundaries (max trades, max loss, hard stop time). Writing it takes five minutes and does two jobs: it clarifies your read while you are calm, and it gives the session an objective referee — later disagreements go to the document, not to the mood.",
              "The plan is also the baseline for honesty. After the close, “did I follow it?” has a real answer only because the plan exists in writing. Without it, every day gets retrofitted as “basically as planned” — and the journal becomes fiction with timestamps.",
            ],
          },
          {
            heading: "Acts 2 and 3 — execute, then review while it's fresh",
            body: [
              "Execution is the session itself: capture trades as they happen (or within minutes), because memory of reasoning decays in hours. The grade you give at capture time — before the outcome — is the most honest data point of the whole system.",
              "The review is the same evening, ten minutes: what the plan got right and wrong, each trade's grade versus outcome, any rule bends and what triggered them, and one sentence of intention for tomorrow. Ten minutes, not an essay — the loop must be sustainable to be valuable. The review feeds the weekly; the weekly is where patterns graduate into playbook changes.",
            ],
          },
        ],
        takeaways: [
          "Three acts, three documents: plan, session, review. Keep them distinct.",
          "Grade at capture time — pre-outcome grades are the honest ones.",
          "Ten minutes of evening review beats a Sunday marathon every time.",
        ],
        cosmozTip: {
          text: "The journal screen pairs each day's pre-market plan with its post-market review on one ledger — the loop is the default, not a discipline stunt.",
          href: "/journal",
          linkLabel: "Open today's entry",
        },
      },
      {
        id: "loop-weekly",
        title: "The weekly review that changes behavior",
        minutes: 8,
        summary:
          "Daily reviews spot incidents; the weekly review spots trends. Its output is never a mood — it is one specific, testable change for next week.",
        sections: [
          {
            heading: "The agenda: thirty honest minutes",
            body: [
              "Same slot every week, thirty minutes, a fixed agenda so the review can't drift into vibes: (1) the numbers — net R, expectancy, discipline score, limits respected; (2) the leaks — which stage of the anatomy failed most (entry timing, sizing, management, exits); (3) the wins — process wins especially, the ones you want repeated; (4) the market note — regime shifts that may explain behavior changes.",
              "The point of the fixed agenda is comparability: twelve weeks of reviews become a timeline of your development, and patterns across weeks become visible — the Friday problem, the post-green-day problem, the shrink-size-in-drawdown success. Weekly is also the natural cadence for sample sizes: enough new trades for a signal, few enough weeks that fixes stay attributable.",
            ],
          },
          {
            heading: "One fix at a time — the rule that makes reviews work",
            body: [
              "The weekly review ends with exactly one behavioral change for the coming week, written as a rule with a success metric: “no trades in the first 15 minutes; metric: zero openings before 9:45.” One, because attention is the scarce resource — five simultaneous fixes guarantee five half-fixes. The change is written where you plan, and next week's review grades it first.",
              "This is also the correct pipeline for playbook edits: data → weekly review → proposed rule change → one week of focused execution → keep, adjust or discard. Changes stop being impulsive rewrites after every bad day and become a versioned experiment log. Your playbook slowly becomes the most expensive consulting document you own.",
            ],
          },
        ],
        takeaways: [
          "Fixed weekly agenda: numbers, leaks, wins, market note. Same slot, every week.",
          "Output = one rule with a success metric. One.",
          "Playbook changes are experiments the weekly review grades — never day-driven rewrites.",
        ],
        cosmozTip: {
          text: "The Coach screen generates your weekly review from real journal data — numbers, leaks and one suggested focus, ready to argue with.",
          href: "/coach",
          linkLabel: "Get your weekly report",
        },
      },
      {
        id: "loop-data",
        title: "Reading your own data like a coach",
        minutes: 9,
        summary:
          "Your journal already contains the answers — if you know which questions to ask. Four reads of the same data, from vanity metrics to the ones that actually change behavior.",
        sections: [
          {
            heading: "From vanity to diagnosis",
            body: [
              "The vanity read is net P&L and win rate: true, but nearly useless for coaching — they mix decision quality, luck and market regime into one number. The first diagnostic cut is by setup: which playbooks carry the expectancy, and which are guests at the table? Most traders find one or two setups produce everything and the rest merely produce activity. That discovery alone, acted on, is a career upgrade.",
              "The second cut is by context: day of week, session time, pre-market mood, sleep. This is where journal context fields earn their keep — “my B setups only work in trends” or “my loss rate doubles on under five hours of sleep” are exactly the kind of findings that never appear in a P&L column but change everything once seen.",
            ],
          },
          {
            heading: "The two reads professionals live by",
            body: [
              "MAE/MFE — how far trades went against and for you before closing — audit your exits. Winners regularly reaching +2.5R MFE but closing at +0.8R means management is leaving money on the table; losers consistently dipping −1.3R before the stop means stops are slightly too tight for the instrument's noise. Excursion data is the closest thing to watching your trades breathe.",
              "The R-distribution read audits risk honesty: losers clustered at −1R with a tail beyond −1.5R mean slippage or stop-widening is happening; winners at +0.4R against +3R plans mean exits are fear-driven. And the mistake ledger — each error priced in R — turns “discipline” into a budget item: fix the mistake that costs the most R first. That's how a coach reads; now you can too.",
            ],
          },
        ],
        takeaways: [
          "Cut the data by setup and by context — vanity metrics coach no one.",
          "MAE/MFE audits exits; the R-distribution audits risk honesty.",
          "Price every mistake in R and fix the most expensive one first.",
        ],
        cosmozTip: {
          text: "Analytics ships all four reads: By Strategy, By Time, the MAE/MFE lab and What-If, and the Mistake Ledger priced in R.",
          href: "/analytics",
          linkLabel: "Read your data",
        },
      },
    ],
  },
];

/** Total lesson count across all tracks (for progress headers). */
export const ACADEMY_TOTAL_LESSONS = ACADEMY_TRACKS.reduce(
  (sum, track) => sum + track.lessons.length,
  0,
);

/** Total reading minutes across all tracks. */
export const ACADEMY_TOTAL_MINUTES = ACADEMY_TRACKS.reduce(
  (sum, track) => sum + track.lessons.reduce((s, l) => s + l.minutes, 0),
  0,
);
