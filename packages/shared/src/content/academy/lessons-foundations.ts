import type { AuthoredCourse } from "./types";
import { text, tip, info, warn, risk, list, formula, table, example, riskDiagram, mc, tf, sc, num } from "./types";

/**
 * Trading Fundamentals + Risk Management — the foundations track.
 * Educational principle: probabilistic language everywhere; no guarantees.
 */

export const FUNDAMENTALS_COURSES: AuthoredCourse[] = [
  {
    id: "crs-fund-markets",
    categoryId: "cat-fundamentals",
    title: "Markets & Instruments",
    description:
      "What trading actually is, where it happens, and how prices are made. The vocabulary every later lesson assumes you know.",
    level: "BEGINNER",
    objectives: [
      "Explain the difference between trading and investing",
      "Describe the major asset classes and what moves them",
      "Read a quote: bid, ask, spread and liquidity",
      "Place orders consciously: market, limit, stop, pending",
    ],
    lessons: [
      {
        id: "lsn-fund-what-is-trading",
        title: "What Is Trading?",
        summary: "Trading vs investing, and what a trade really is: a probabilistic decision under uncertainty.",
        minutes: 8,
        objectives: [
          "Define trading and distinguish it from investing",
          "Explain why every trade is a probability statement",
          "Describe the learn → practice → trade → review loop",
        ],
        blocks: [
          text("Trading is buying and selling a financial instrument with the intent to profit from short-term price movements. Investing holds for years and profits from long-term growth; trading holds for minutes, hours or days and profits from price differences in either direction. Neither is superior — they are different professions that happen to share the same buildings."),
          text("A trade is not a prediction. When you go long, you are not saying “price will rise” — you are saying: “in conditions like this, historically, price rises often enough, and by enough, that risking a smaller loss to capture a larger gain is profitable over many repetitions.” That framing changes everything about how you manage a losing trade."),
          formula("Edge (per trade, R units)", "Edge = (Win% × AvgWin) − (Loss% × AvgLoss)", "Positive expectancy over MANY trades — a single outcome proves nothing."),
          tip("Think in series, not in trades",
            "A casino does not know how the next hand ends. It knows its edge over ten thousand hands. Your job is the same: execute a process whose statistics you track in the journal, and judge it only over meaningful samples (30–100+ trades)."),
          list(
            "Speculation: taking risk to profit from price change — what traders do",
            "Hedging: offsetting risk elsewhere — what companies do",
            "Arbitrage: profiting from price mismatches — mostly automated today",
            "Investing: long-horizon ownership — a different discipline",
          ),
        ],
        takeaways: [
          "A trade is a probabilistic decision, never a prediction",
          "Judge results over series of trades, not single outcomes",
          "Your journal exists to measure the process, not to judge luck",
        ],
      },
      {
        id: "lsn-fund-asset-classes",
        title: "Markets & Asset Classes",
        summary: "Forex, stocks, indices, commodities, crypto and futures — how they differ and what moves them.",
        minutes: 10,
        objectives: [
          "Name the major asset classes and their trading hours",
          "Explain what typically drives each class",
          "Choose an instrument class that fits your availability",
        ],
        blocks: [
          text("A financial market is any venue where buyers and sellers exchange instruments. Each class has its own rhythm, drivers and microstructure. Your choice matters less for profitability than for fit: a trader who can only watch the screen two hours a day should not choose instruments that demand constant attention."),
          table(
            ["Class", "Examples", "Typical drivers"],
            [
              ["Forex", "EUR/USD, GBP/JPY", "Interest rates, macro data, central banks"],
              ["Stocks", "AAPL, TSLA", "Earnings, guidance, sector news"],
              ["Indices", "US500, NAS100", "Economic cycle, rates, index constituents"],
              ["Commodities", "Gold, oil", "Supply/demand, geopolitics, USD"],
              ["Crypto", "BTC, ETH", "Flows, sentiment, regulation, 24/7 cycle"],
              ["Futures", "ES, CL, GC", "Same as underlying + roll/calendar effects"],
            ],
          ),
          text("CFDs (contracts for difference) are derivatives that mirror the underlying price without owning it — common with retail brokers, with leverage attached. Futures are standardized exchange-traded contracts. Both are tools; both amplify mistakes when misused."),
          info("Sessions matter",
            "Forex runs 24/5 but is not uniform: the London and New York sessions carry most of the volume. Crypto never closes — which is precisely why traders who never step away from it burn out. Map your instrument's active hours against your real availability."),
        ],
        takeaways: [
          "Pick instruments by fit with your schedule and temperament",
          "Know the drivers of your market — context beats indicators",
          "Derivatives (CFDs, futures) add leverage mechanics on top of price",
        ],
      },
      {
        id: "lsn-fund-bid-ask",
        title: "How Prices Are Made: Bid, Ask & Liquidity",
        summary: "Who is on the other side, why spread exists, and how slippage and volatility affect your fills.",
        minutes: 9,
        objectives: [
          "Define bid, ask, spread and the mid price",
          "Explain liquidity and why it varies by session and event",
          "Recognize slippage and its cost over 100 trades",
        ],
        blocks: [
          text("Every quote has two sides. The bid is the best price buyers will pay right now; the ask is the best price sellers will accept. You buy at the ask and sell at the bid. The gap between them — the spread — is the toll you pay every time you cross it. The last traded price is somewhere between and belongs to no one."),
          formula("Spread cost per trade", "Spread = Ask − Bid", "Round-trip cost; Scalpers pay it hundreds of times a day."),
          text("Liquidity is how much volume sits at and near the current price. Deep liquidity means large orders move the price little; thin liquidity means your own order can push it. Liquidity concentrates in session overlaps and evaporates around rollover, news and weekends. Volatility is the speed and size of price movement — high volatility widens spreads because market makers take on more risk."),
          text("Slippage is the difference between the price you expected and the price you got. It is normal around fast markets, and it is a real cost: a strategy that looks profitable on paper at 0.0 spread can be marginal after realistic slippage. The journal's trade log is where execution quality gets measured — compare your intended entry with your actual fill."),
          warn("News spreads are not your spreads",
            "In the seconds around major releases, spreads can widen 5–20×. If your plan requires entering exactly at release, size for the worst fill you have actually observed, not the average one."),
        ],
        takeaways: [
          "You always pay the spread — build it into every backtest",
          "Liquidity and volatility drive spread width and slippage",
          "Track intended vs actual fills to measure execution quality",
        ],
      },
      {
        id: "lsn-fund-orders",
        title: "Orders & Execution",
        summary: "Market, limit, stop and pending orders — what each one promises, and what each one cannot promise.",
        minutes: 10,
        objectives: [
          "Choose between market and limit orders deliberately",
          "Explain stop orders and stop-limit differences",
          "Describe the guarantee trade-off: certainty of fill vs certainty of price",
        ],
        blocks: [
          text("An order type is a promise about one thing at the cost of another. Market orders promise execution but not price. Limit orders promise price but not execution. Stop orders are conditional market orders — dormant until price touches the trigger. Master these three families and every broker platform becomes readable."),
          table(
            ["Order", "You get", "You risk"],
            [
              ["Market", "Immediate fill", "Slippage — price not guaranteed"],
              ["Limit", "Your price or better", "No fill if price never returns"],
              ["Stop (market)", "Entry once level triggers", "Slippage through the trigger"],
              ["Stop-limit", "Price control after trigger", "Triggered but unfilled in gaps"],
            ],
          ),
          text("Pending orders (buy limit, sell limit, buy stop, sell stop) let you pre-commit to a plan before emotion arrives. A buy limit below price waits for a pullback; a buy stop above price waits for a breakout. Defining the entry, stop and target before the candle closes is one of the cheapest discipline tools that exists."),
          tip("Pending orders are pre-written discipline",
            "The judgment gates in Session Live exist for the same reason: decisions made calmly in advance beat decisions made in a moving market. Use pending orders to let your plan execute without your finger on the button."),
          list(
            "Entry fill rules set by the broker: last, bid/ask or mid triggers",
            "Time-in-force: GTC (good till cancelled) vs day orders",
            "Partial fills: large orders in thin books fill in slices",
          ),
        ],
        takeaways: [
          "Every order type trades fill-certainty against price-certainty",
          "Pending orders execute the plan without live emotion",
          "Know your broker's trigger rules before relying on them",
        ],
      },
    ],
    quiz: {
      id: "qz-fund-markets",
      questions: [
        mc("q1", "You see EUR/USD quoted bid 1.0842 / ask 1.0844. You want to buy immediately. At which price can you buy, and what is the spread?",
          ["Buy at 1.0842, spread 2 pips", "Buy at 1.0844, spread 2 pips", "Buy at 1.0843, spread 0 pips"], 1,
          "You always buy at the ask (1.0844) and the spread is ask − bid = 0.0002 (2 pips on this quote scale)."),
        sc("q2", "A major interest-rate decision lands in 20 seconds. Which order type gives you price certainty but no fill certainty?",
          ["Market order", "Buy limit away from price", "Stop-limit order"], 2,
          "A stop-limit triggers only if price touches the level AND still fills at your limit or better — price certainty, but in fast markets it can be triggered and left unfilled. A market order is the opposite."),
        tf("q3", "Slippage means the difference between the price you intended and the price you actually received.", true,
          "Exactly. It is a normal execution cost, largest in fast, thin markets, and it belongs in your strategy math."),
      ],
    },
  },
  {
    id: "crs-fund-account",
    categoryId: "cat-fundamentals",
    title: "Account Mechanics: Leverage, Lots & Sessions",
    description:
      "How leverage and margin really work, how position size is measured, and what trading sessions mean for your schedule.",
    level: "BEGINNER",
    objectives: [
      "Compute margin requirements and understand leverage risk",
      "Convert lots, pips and contract sizes into real money",
      "Match your instruments to the sessions you can actually trade",
    ],
    lessons: [
      {
        id: "lsn-fund-leverage",
        title: "Leverage & Margin",
        summary: "Borrowed buying power: how margin is calculated and why leverage amplifies losses exactly as fast as wins.",
        minutes: 9,
        objectives: [
          "Compute required margin from leverage and notional",
          "Explain margin call and stop-out levels",
          "State why leverage changes risk of ruin, not edge",
        ],
        blocks: [
          text("Leverage lets you control a notional position larger than your balance. With 1:100 leverage, $1,000 of margin controls $100,000 of notional. Leverage does not create profit — it multiplies the P&L of whatever you do, wise or unwise. A 1% adverse move on $100,000 is $1,000: your whole margin."),
          formula("Required margin", "Margin = Notional ÷ Leverage", "$100,000 notional at 1:100 → $1,000 margin."),
          text("Brokers protect themselves with maintenance margin: if equity falls below a threshold (say 50–100% of required margin), a margin call asks for funds; below the stop-out level (often 20–50%), positions are force-closed at the market. Forced liquidation is the end state of unmanaged risk — it converts a losing trade into a lost account."),
          risk("Leverage is an account-killer, not an edge",
            "Two traders with identical strategies but 1:10 vs 1:100 sizing habits will diverge violently on drawdown, not on win rate. Professional usage is defined by risk per trade (the Risk Management track), never by maximum allowed leverage."),
        ],
        takeaways: [
          "Margin = notional ÷ leverage; leverage multiplies P&L both ways",
          "Stop-outs force-close positions — the terminal event of oversizing",
          "Set position size from risk %, then let leverage be whatever it is",
        ],
      },
      {
        id: "lsn-fund-lots-pips",
        title: "Lots, Pips & Position Size",
        summary: "Translating instrument jargon into dollars: lot sizes, pip values, ticks and contract specifications.",
        minutes: 8,
        objectives: [
          "Convert standard/mini/micro lots into pip value",
          "Read a contract specification sheet",
          "Compute P&L from entry, exit and pip value",
        ],
        blocks: [
          text("A pip is the conventional fourth-decimal move in most forex pairs (0.0001), the second decimal in JPY pairs (0.01). A standard lot is 100,000 units of base currency, so one pip on EUR/USD is $10 per standard lot; a mini lot (0.1) is $1; a micro lot (0.01) is $0.10. Indices, metals and crypto each define their own tick and contract size — always read the specification sheet."),
          formula("Position value of a move", "P&L = (Exit − Entry) × PipValue × Lots", "Direction-adjusted: longs profit when exit > entry."),
          example("Worked example",
            "Short EUR/USD at 1.0860, closed at 1.0830 → +30 pips.",
            "Position: 0.5 lots → pip value $5.",
            "P&L = 30 × $5 = +$150 before commissions and swap.",
          ),
          info("Swap/financing",
            "Held positions can pay or receive overnight financing depending on the rate differential. Day traders rarely feel it; swing traders must include it in the plan for multi-day holds."),
        ],
        takeaways: [
          "Pip value depends on lot size — memorize your instruments' specs",
          "P&L = move × pip value × lots, minus costs",
          "The position sizer in the app does this math for you — but understand it",
        ],
      },
      {
        id: "lsn-fund-sessions",
        title: "Trading Sessions & Market Participants",
        summary: "Sydney → Tokyo → London → New York: who trades when, why overlaps matter, and how to build a schedule.",
        minutes: 8,
        objectives: [
          "Place the four sessions on a clock in your timezone",
          "Explain why overlaps carry the most liquidity",
          "Design a sustainable weekly trading schedule",
        ],
        blocks: [
          text("The forex week rotates through Sydney, Tokyo, London and New York. London is the largest center; the London/New York overlap (roughly 13:00–17:00 UTC) carries the deepest liquidity and the strongest trends. Asia tends toward ranges in the majors; London often breaks them; New York either continues or reverses the London move."),
          list(
            "Sydney/Tokyo: JPY, AUD pairs — quieter, range-prone",
            "London: highest FX volume — European data at 08:00 UTC",
            "London/NY overlap: peak liquidity — US data at 13:30 UTC",
            "NY afternoon: momentum fades, spreads widen toward close",
          ),
          text("Participants matter as much as hours: banks and funds move size, corporations hedge flows, retail traders (you) ride waves. None of them cares about your position. Sessions also apply to your life: the best schedule is the one you can repeat 50 weeks a year — the journal's calendar view will quickly reveal which hours produce your best trades."),
        ],
        takeaways: [
          "Liquidity clusters in session overlaps — plan entries there",
          "Each session has a personality; log yours and verify in Analytics",
          "Sustainability beats optimization: a repeatable schedule wins",
        ],
      },
    ],
    quiz: {
      id: "qz-fund-account",
      questions: [
        num("q1", "Account balance $5,000, leverage 1:50. What is the maximum notional you can control?", 250000, "USD",
          "Notional = balance × leverage = 5,000 × 50 = $250,000."),
        mc("q2", "One standard lot EUR/USD. Price moves 25 pips in your favor. P&L?",
          ["+$25", "+$250", "+$2,500"], 1,
          "Standard lot pip value is $10 → 25 × $10 = $250."),
        tf("q3", "Higher leverage increases your win rate.", false,
          "Leverage changes exposure, not edge. It multiplies both wins and losses — and shortens the road to a stop-out when misused."),
      ],
    },
  },
];

export const RISK_COURSES: AuthoredCourse[] = [
  {
    id: "crs-risk-fundamentals",
    categoryId: "cat-risk",
    title: "Risk Management Fundamentals",
    description:
      "The survival course. Risk per trade, stops, position sizing with real numbers, and the R-multiple language used across the whole journal.",
    level: "BEGINNER",
    objectives: [
      "Define risk per trade and apply the 1% framework",
      "Place stops logically and compute position size from them",
      "Speak in R multiples and understand expectancy",
    ],
    lessons: [
      {
        id: "lsn-risk-why",
        title: "Why Capital Preservation Comes First",
        summary: "The asymmetry of losses: why recovering a 50% drawdown requires a 100% gain.",
        minutes: 7,
        objectives: [
          "Compute the gain required to recover a drawdown",
          "Explain why survival is the prerequisite of any edge",
          "Describe risk of ruin in plain words",
        ],
        blocks: [
          text("Losses compound against you asymmetrically. Lose 10% and you need 11.1% to recover. Lose 50% and you need 100% just to break even. Lose 90% and you need 900%. This asymmetry is the mathematical reason professionals treat capital preservation as the primary objective and profit as its by-product."),
          riskDiagram("drawdown", "Required recovery gain grows faster than the drawdown itself."),
          text("Risk of ruin is the probability of losing so much that you stop trading — mathematically or psychologically. It rises steeply as risk per trade grows and as edge shrinks. There is no strategy so good that oversized risk cannot destroy it, and no strategy so bad that correct risk cannot make survivable to improve."),
          tip("The 1% rule of thumb",
            "Risking 1% of the account per trade means ~100 consecutive full losses to ruin — statistically near-impossible for any coherent strategy. At 10% per trade, ten losses in a row (a normal bad month) erase the account. Choose your survival margin before your profit target."),
        ],
        takeaways: [
          "Drawdown recovery is nonlinear — protect the account first",
          "Risk of ruin explodes with risk per trade",
          "Small consistent risk keeps you in the game long enough for edge to appear",
        ],
      },
      {
        id: "lsn-risk-stop-tp",
        title: "Risk Per Trade, Stop Loss & Take Profit",
        summary: "The three numbers that define every trade before entry: what you risk, where you're wrong, where you take.",
        minutes: 9,
        objectives: [
          "Set risk per trade as a % of account",
          "Place stops at invalidation, not at pain thresholds",
          "Choose targets from structure, not from hope",
        ],
        blocks: [
          text("Every trade is defined by three numbers: the amount you will lose if wrong (risk), the price that proves you wrong (stop), and the price where you take profit (target). The correct order of operations is: find the invalidation level first — where the idea is objectively failed — then size the position so that a stop-out costs your fixed risk budget."),
          list(
            "Stop placement: beyond structure (below the swing low, outside the range) — not at an arbitrary dollar amount",
            "Target placement: before opposing structure, at a level price can realistically reach",
            "Risk per trade: fixed % (0.25–1% typical for professionals) decided in cold blood",
          ),
          warn("A stop is not a wish",
            "Moving a stop away from price “to give it room” converts a planned 1R loss into an unplanned 3R loss — the single most common way disciplined systems die. If the stop feels too tight, the entry is too early; fix the entry, never widen the loss."),
          text("Take profit can be a single level, or a scale (half at 1R, trail the rest). What matters is that exits are written before entry and their statistics are reviewed honestly. The journal's decision grades will show you quickly whether your targets are structurally realistic."),
        ],
        takeaways: [
          "Invalidation first, position size second, target third",
          "Never widen a stop — re-enter or accept the loss instead",
          "Targets come from structure and measured moves, not hope",
        ],
      },
      {
        id: "lsn-risk-sizing",
        title: "Position Sizing Workshop",
        summary: "The complete calculation with a $10,000 account: from risk % to lots, step by step.",
        minutes: 12,
        objectives: [
          "Compute dollar risk from account and percent",
          "Derive position size from stop distance",
          "Apply the full pipeline to real instruments",
        ],
        blocks: [
          text("Position sizing is the bridge between your risk budget and the market. The pipeline never changes: define dollar risk, measure stop distance, divide. Do it in this order for every single trade and oversizing becomes structurally impossible."),
          formula("Position size", "Units = Dollar Risk ÷ Stop Distance (per unit)", "Works for FX, indices, crypto — once units are consistent."),
          example("The $10,000 account — EUR/USD",
            "Risk budget: 1% → $10,000 × 0.01 = $100 maximum loss.",
            "Setup: long 1.0850, invalidation below the swing low at 1.0800 → 50 pips.",
            "Pip value needed: $100 ÷ 50 pips = $2/pip → 0.2 lots (micro math: $10/pip per lot).",
            "A stop-out costs exactly $100 = 1R. No emotion required.",
          ),
          example("Same account — US500 CFD",
            "Risk: $100. Stop: 20 index points → $5 per point allowed.",
            "If the CFD is $1/point per contract → 5 contracts.",
          ),
          tip("The app computes this for you",
            "The position sizer in Session Live and the trade form implements exactly this pipeline, including pip-value lookup. Learn the math here so you can audit the tool there."),
        ],
        takeaways: [
          "Dollar risk = account × risk% — computed before entry, always",
          "Size = risk ÷ stop distance — stops define size, never the reverse",
          "Fix the loss first; the profit takes care of itself",
        ],
      },
      {
        id: "lsn-risk-r-multiples",
        title: "R Multiples & Expectancy",
        summary: "The journal's native language: measuring every trade in units of risk, and computing your real edge.",
        minutes: 10,
        objectives: [
          "Express outcomes as R multiples",
          "Compute expectancy from win rate and R distribution",
          "Explain why a 40% win rate can be excellent",
        ],
        blocks: [
          text("An R multiple expresses a trade's outcome in units of its planned risk. A trade planned at $100 risk that loses $100 is −1R; one that gains $300 is +3R; one stopped at half distance is −0.5R. Speaking in R normalizes trades across account sizes and setups — it is the language the whole journal uses for grading and goals."),
          formula("Expectancy", "E = WinRate × AvgWinR − (1 − WinRate) × AvgLossR", "Positive E over a large sample = an edge."),
          example("Two profitable systems",
            "System A: 70% winners, avg win 1R, avg loss 1R → E = 0.7×1 − 0.3×1 = +0.40R per trade.",
            "System B: 35% winners, avg win 4R, avg loss 1R → E = 0.35×4 − 0.65×1 = +0.75R per trade.",
            "B wins less often and earns more — win rate alone is meaningless.",
          ),
          text("The Analytics module computes these statistics from your graded trades: win rate, average R, expectancy by setup and session. The Academy quizzes will ask you to reason in R — once you internalize it, P&L anxiety tends to drop, because one loss becomes just the cost line of a statistical business."),
        ],
        takeaways: [
          "Think in R: normalized risk units across every trade",
          "Expectancy = the only verdict that matters, over samples",
          "Low win rate + high R winners is a perfectly healthy profile",
        ],
      },
    ],
    quiz: {
      id: "qz-risk-fundamentals",
      questions: [
        num("q1", "Account $10,000, risk 1%. Stop distance 50 pips, pip value $10 per lot. How many lots?", 0.2, "lots",
          "Dollar risk $100; $100 ÷ (50 × $10) = 0.2 lots."),
        num("q2", "You lose 25% of your account. What % gain returns you to break even?", 33.33, "%",
          "0.75 → 1.00 requires ×1.3333 → +33.33%. (Accept 33–34%.)", 0.03),
        sc("q3", "System: 45% win rate, avg winner +2.5R, avg loser −1R. Expectancy per trade?",
          ["+0.575R", "+0.125R", "−0.100R"], 0,
          "E = 0.45×2.5 − 0.55×1 = 1.125 − 0.55 = +0.575R."),
        tf("q4", "A stop loss should be placed at the closest price so the position size can be biggest.", false,
          "The stop belongs at structural invalidation; size follows from it. Tightening a stop to enlarge size raises the odds of being stopped by noise."),
      ],
    },
  },
  {
    id: "crs-risk-advanced",
    categoryId: "cat-risk",
    title: "Advanced Risk & Drawdown",
    description:
      "Daily and weekly loss limits, drawdown mechanics and recovery, correlation and portfolio exposure, and the honest math of risk of ruin.",
    level: "INTERMEDIATE",
    objectives: [
      "Configure daily/weekly loss limits that actually trigger",
      "Model drawdown duration and recovery requirements",
      "Recognize correlation and concentration risk",
    ],
    lessons: [
      {
        id: "lsn-risk-limits",
        title: "Daily & Weekly Loss Limits",
        summary: "Circuit breakers for the trader: why hard stops on the day protect the month.",
        minutes: 8,
        objectives: [
          "Set a daily loss limit consistent with risk per trade",
          "Understand weekly limits and loss-streak probabilities",
          "Use the app's discipline engine to enforce them",
        ],
        blocks: [
          text("A daily loss limit is the maximum the account may lose before trading stops for the day — typically 2–3× your per-trade risk (e.g. 3% with 1% trades, meaning three full stops). Its purpose is not mathematical elegance; it is behavioral containment: it cuts the day before revenge trading does."),
          formula("Suggested daily limit", "DailyLimit = 2–3 × RiskPerTrade", "Weekly limit ≈ 5–6 × risk, or ~2 daily limits."),
          text("Loss streaks are normal: even a 55%-win-rate system faces multi-loss days regularly. The limit converts those days from account-threatening to routine. In this app, rules of type MAX_DAILY_LOSS are evaluated live by the discipline engine — breaches become violations, and the guardrail mode can soft-lock new entries after repeated breaches."),
          info("Also cap the winners' day",
            "Many professionals stop after a large winning day too: it locks in a good session and prevents the “hot hand” overtrading that follows. Consider a daily profit target as a stop-trading signal, not a license to press."),
        ],
        takeaways: [
          "Daily limits = 2–3R; weekly ≈ 2 daily limits",
          "Loss streaks are statistics, not character flaws",
          "Let the engine enforce what willpower cannot",
        ],
      },
      {
        id: "lsn-risk-drawdown",
        title: "Drawdown & Recovery Math",
        summary: "What drawdown really costs — in percent, in time, and in psychology — and how professionals plan for it.",
        minutes: 9,
        objectives: [
          "Define max drawdown precisely (peak-to-trough on equity)",
          "Compute recovery requirements and realistic durations",
          "Plan behavior rules that survive a drawdown",
        ],
        blocks: [
          text("Drawdown is the decline from the highest equity point to the lowest point that follows. Maximum drawdown is the worst such decline over the period — the number every strategy evaluation should include, because it is the number your psychology must survive. Two systems with equal returns can differ enormously in drawdown; the shallower one is usually the more implementable."),
          riskDiagram("drawdown", "Peak → trough → recovery: the shape every equity curve takes."),
          table(
            ["Drawdown", "Gain to recover", "Time at +2%/month"],
            [
              ["10%", "11.1%", "~6 months"],
              ["25%", "33.3%", "~15 months"],
              ["50%", "100%", "~3 years"],
            ],
          ),
          text("Recovery also takes time and trades: at a realistic +0.3R expectancy and 15 trades a week, recovering 20% of a $10,000 account ($2,000) at $100 risk means ~67 net winning trades — months, not days. Planning this arithmetic before it happens is what separates professionals from gamblers: they reduce size in drawdowns, cut risky experiments, and let statistics work."),
          tip("Pre-commit your drawdown protocol",
            "Write it now, while calm: at −X% reduce risk per trade by half; at −Y% stop live trading and review the journal with fresh eyes. The Trade Review module's goals are the natural home for these commitments."),
        ],
        takeaways: [
          "Max drawdown is the strategy statistic your psychology must survive",
          "Recovery gain grows nonlinearly — the deep hole is expensive",
          "Pre-committed protocols beat in-the-moment courage",
        ],
      },
      {
        id: "lsn-risk-correlation",
        title: "Correlation, Exposure & Risk of Ruin",
        summary: "Three longs is not three trades when they are the same trade: portfolio-level risk for single traders.",
        minutes: 9,
        objectives: [
          "Explain correlation and give FX/metal/index examples",
          "Compute aggregate exposure across positions",
          "State the levers that reduce risk of ruin",
        ],
        blocks: [
          text("Correlated positions share a common driver: long EUR/USD + long GBP/USD is substantially one short-dollar trade; long gold and long silver is one “weak dollar, risk-on” trade; three tech longs is one sector bet. The account experiences them as a single position wearing three costumes — and your true risk is the sum, not the per-trade slice."),
          list(
            "Sum the R risk of open positions → true portfolio heat (cap it: 3–6% typical)",
            "Group by driver (USD, sector, index beta) — not by ticker",
            "When correlated, halve per-position size or take the best setup only",
          ),
          text("Risk of ruin pulls together everything in this track: per-trade risk (oversizing), edge (negative systems), correlation (hidden stacking) and limits (absent circuit breakers). The levers that reduce it are unglamorous and effective: small fixed risk, positive expectancy verified over samples, hard daily/weekly limits, and honest exposure accounting across correlated positions."),
          risk("The stacking trap",
            "Five positions × 1% risk that are all USD-shorts = a 5% bet on one idea. If it fails, that is not “a bad trade”, that is a third of a typical monthly drawdown in an afternoon."),
        ],
        takeaways: [
          "Aggregate risk by driver, not by instrument count",
          "Cap total portfolio heat explicitly",
          "Ruin is prevented by boring, stacked safeguards — not by one big rule",
        ],
      },
    ],
    quiz: {
      id: "qz-risk-advanced",
      questions: [
        mc("q1", "Which set of positions carries the highest hidden correlation risk?",
          ["Long gold, long JPY, short US500", "Long EUR/USD, long GBP/USD, short USD/CHF", "Long AAPL, short gold"], 1,
          "All three are effectively short-USD positions — one driver, triple exposure."),
        num("q2", "Risk 1% per trade, daily loss limit 3%, account $20,000. Max daily dollar loss?", 600, "USD",
          "3% × 20,000 = $600."),
        tf("q3", "Reducing position size during a drawdown delays recovery and is therefore wrong.", false,
          "Reducing size in drawdown lowers risk of deepening the hole and protects psychology — the recovery is slower but far more probable."),
      ],
    },
  },
];
