import type { AcademyScenario } from "../../../shared/contracts";

/**
 * Scenario library — self-paced decision sequences. Each step puts the
 * learner inside a market situation and asks for the next professional
 * action. Full content is served to the client (this is a learning tool,
 * not a test); every decision is logged to the practice ledger.
 *
 * Pedagogical red line: every correct answer trades the SAME edge —
 * pattern + context + location + structure + confirmation + risk = potential
 * setup. No step ever implies a guaranteed outcome.
 */
export const SCENARIOS: AcademyScenario[] = [
  {
    id: "scn-breakout-retest",
    title: "Breakout, or trap?",
    categoryId: "cat-technical",
    context: "Daily chart. Price has compressed under a level tested three times over two months.",
    steps: [
      {
        id: "step-1",
        narrative:
          "Price closes decisively above the level on the widest range in six weeks. Volume is elevated. You have no position yet. What is the professional read?",
        options: [
          { id: "a", label: "The level is broken — buy at market immediately, momentum confirms itself" },
          { id: "b", label: "A breakout candidate — but wait for the retest or a confirming close before committing risk" },
          { id: "c", label: "Levels that break after three tests always fail — fade the move" },
        ],
        correctOptionId: "b",
        feedback:
          "A decisive break is information, not a command. The retest (or a confirming hold above the level) is where risk is smallest and invalidation is clear. Chasing invites the widest stop; fading invites fighting a live move.",
      },
      {
        id: "step-2",
        narrative:
          "Two sessions later price pulls back to the broken level, which now acts as support. The candle closes with a long lower wick. What is your plan?",
        options: [
          { id: "a", label: "Enter long with a stop below the retest low — level, structure and confirmation align" },
          { id: "b", label: "Wait for price to return to the old range high first — cheaper entry" },
          { id: "c", label: "Enter with no stop — the level 'holding' is confirmation enough" },
        ],
        correctOptionId: "a",
        feedback:
          "Pattern (breakout) + context (trend attempt) + location (retest of the flipped level) + confirmation (wick rejection) — a potential setup, sized so the stop below the retest low costs a defined fraction of the account.",
      },
      {
        id: "step-3",
        narrative:
          "You are long from the retest. Where does the trade idea die — the point at which your reason for being in no longer holds?",
        options: [
          { id: "a", label: "If price closes back below the broken level — the flip failed" },
          { id: "b", label: "Never — breakouts from multi-month levels rarely reverse" },
          { id: "c", label: "After a fixed distance regardless of structure — exits must be mechanical" },
        ],
        correctOptionId: "a",
        feedback:
          "Invalidation lives at structure: a close back below the level means the flip did not survive and the thesis is gone. Exits anchored to structure keep the loss honest; 'never' is not a stop.",
      },
      {
        id: "step-4",
        narrative:
          "The trade runs 2R in your favor, then stalls under the next resistance and prints a bearish engulfing candle. What now?",
        options: [
          { id: "a", label: "Hold through everything — you 'felt' this breakout was different" },
          { id: "b", label: "Take partial profit or move the stop to breakeven — protect the edge the market gave you" },
          { id: "c", label: "Reverse short at market — one candle always means reversal" },
        ],
        correctOptionId: "b",
        feedback:
          "A stall under resistance with a reversal candle is a reason to manage, not to flip. Locking breakeven or banking partials converts a hopeful trade into a professional one — no outcome is owed to you either way.",
      },
    ],
  },
  {
    id: "scn-support-invalidation",
    title: "The support that must hold",
    categoryId: "cat-risk",
    context: "Swing account, maximum 1% risk per trade. You are flat.",
    steps: [
      {
        id: "step-1",
        narrative:
          "A stock you have traded well pulls back into a support band that has produced three bounces. Buyers have not confirmed yet — the candle is mid-range inside the band. What do you do?",
        options: [
          { id: "a", label: "Buy now — three bounces means the level cannot break" },
          { id: "b", label: "Set an alert and wait for buyers to confirm at the band before risking anything" },
          { id: "c", label: "Short it — if it bounced three times it is due to break" },
        ],
        correctOptionId: "b",
        feedback:
          "'Cannot break' is not a thing levels do. Inside the band there is no confirmation — entering early means paying for information you do not have yet. Alerts cost nothing; premature risk does.",
      },
      {
        id: "step-2",
        narrative:
          "Price sweeps below the band on a fast wick, then reclaims it within the hour and closes back above. How is this sequence best read?",
        options: [
          { id: "a", label: "A failed breakdown — resting stops below the band were consumed; the reclaim is the confirmation" },
          { id: "b", label: "A clean breakdown — the band broke, the thesis is dead forever" },
          { id: "c", label: "Market noise — unverifiable, ignore everything" },
        ],
        correctOptionId: "a",
        feedback:
          "The sweep-reclaim is a liquidity event: stops below an obvious level got consumed, then buyers showed up. It is confirmation of the band from the sharp side — with the invalidation now defined at the sweep extreme.",
      },
      {
        id: "step-3",
        narrative:
          "You go long on the reclaim. Account $10,000, stop is $0.50 below entry, and your 1% rule caps loss at $100. What size keeps the rule intact?",
        options: [
          { id: "a", label: "200 units — $0.50 × 200 = $100 at the stop" },
          { id: "b", label: "1,000 units — the band has held four times, size up" },
          { id: "c", label: "500 units — halfway is conservative enough" },
        ],
        correctOptionId: "a",
        feedback:
          "Size = risk budget ÷ stop distance: $100 ÷ $0.50 = 200 units. Confidence never scales size — the stop distance and the account rule do. 500 units would lose $250, 1,000 would lose $500: both break the only rule that keeps you in the game.",
      },
      {
        id: "step-4",
        narrative:
          "The trade goes against you and your stop is hit. Same setup appears again two days later. What is the professional response?",
        options: [
          { id: "a", label: "Double the size to win the $100 back — the setup owes you" },
          { id: "b", label: "Skip it entirely — a stopped-out setup is broken" },
          { id: "c", label: "Take the next one at standard risk — one loss was one experiment, the edge lives across many attempts" },
        ],
        correctOptionId: "c",
        feedback:
          "The 1% rule exists so that a losing experiment costs exactly what it should. Revenge sizing and sulking are the same error in opposite directions: both treat one outcome as the verdict on a probabilistic edge.",
      },
    ],
  },
  {
    id: "scn-sweep-reversal",
    title: "Equal lows and a violent wick",
    categoryId: "cat-structure",
    context: "Intraday, liquid index futures. You are flat, watching an obvious level.",
    steps: [
      {
        id: "step-1",
        narrative:
          "Price has printed two nearly identical lows over four hours. Open interest data is unavailable. What is the most defensible observation about those equal lows?",
        options: [
          { id: "a", label: "Resting stop orders likely accumulate just below obvious equal lows" },
          { id: "b", label: "Institutions have secret orders there — price must reverse there" },
          { id: "c", label: "Equal lows mean strong support — sell below them" },
        ],
        correctOptionId: "a",
        feedback:
          "Stick to what is observable: obvious levels attract stop orders. Predicting intent beyond that is interpretation. 'Likely', not 'certainly' — the language of the trade is probability.",
      },
      {
        id: "step-2",
        narrative:
          "Price pierces below the equal lows by a few ticks, stalls, and within two candles reclaims the level entirely. What event just happened?",
        options: [
          { id: "a", label: "A confirmed breakdown — now short the retest" },
          { id: "b", label: "A liquidity sweep — the move below consumed stops and immediately failed" },
          { id: "c", label: "A data error — the exchange would have halted this" },
        ],
        correctOptionId: "b",
        feedback:
          "Pierce → stall → reclaim is the sweep sequence: the stops below the lows got filled, and with no follow-through selling the market snapped back. The reaction, not the pierce, is the information.",
      },
      {
        id: "step-3",
        narrative:
          "You consider a long. Where does this idea have the clearest invalidation?",
        options: [
          { id: "a", label: "Below the sweep extreme — if price trades under it, the sweep failed" },
          { id: "b", label: "Above the equal lows — a long is wrong when it profits" },
          { id: "c", label: "Nowhere — reversals after sweeps always run" },
        ],
        correctOptionId: "a",
        feedback:
          "The sweep extreme is the line: beyond it, the liquidity story is over and you are simply long in a falling market. Defined invalidation is what separates a setup from an opinion.",
      },
      {
        id: "step-4",
        narrative:
          "You take the long with a stop under the sweep low. Which target logic best matches the structure you just traded?",
        options: [
          { id: "a", label: "First objective at the recent swing high / range high — liquidity and structure above" },
          { id: "b", label: "Hold until the close of the week no matter what" },
          { id: "c", label: "Target = exactly 10 ticks because round numbers are lucky" },
        ],
        correctOptionId: "a",
        feedback:
          "Targets, like entries, come from structure: the next pool of resting orders and prior highs. Anything else is superstition wearing a chart.",
      },
    ],
  },
  {
    id: "scn-trend-pullback",
    title: "Buying strength, or buying pullbacks?",
    categoryId: "cat-price-action",
    context: "H4 chart, clear uptrend with repeating HH/HL. No news for six hours.",
    steps: [
      {
        id: "step-1",
        narrative:
          "The market has just printed its largest bullish candle in days after breaking the last swing high. A colleague says 'buy the strong candle'. What does the structure suggest instead?",
        options: [
          { id: "a", label: "The pullback that follows is the lower-risk participation point — enter where invalidation is near" },
          { id: "b", label: "The largest candle marks the exact end of trends — sell it" },
          { id: "c", label: "Structure is irrelevant; the candle color is the signal" },
        ],
        correctOptionId: "a",
        feedback:
          "In trends, entry quality comes from buying retracements into value, not chasing expansion. The pullback lets the stop sit behind structure instead of behind hope.",
      },
      {
        id: "step-2",
        narrative:
          "Price pulls back to the area of the last higher low and the previous breakout level — two reasons to care about the same price. What is this confluence called in practice?",
        options: [
          { id: "a", label: "A demand zone / flipped level where multiple pieces of structure agree" },
          { id: "b", label: "Double jeopardy — structure that agrees twice must fail" },
          { id: "c", label: "A dead zone where no trades are ever valid" },
        ],
        correctOptionId: "a",
        feedback:
          "When a prior breakout level and a higher low overlap, the band gathers orders from two audiences. Confluence narrows risk: invalidation is one clear line below the band.",
      },
      {
        id: "step-3",
        narrative:
          "Inside the zone, price prints a hammer followed by a bullish close above the hammer's high. How do you act on this sequence?",
        options: [
          { id: "a", label: "Enter on the confirming close, stop under the hammer low, size from the stop distance" },
          { id: "b", label: "Buy the hammer the second it prints — confirmation is for the patient and the poor" },
          { id: "c", label: "Wait for three more candles — any entry after confirmation is invalid" },
        ],
        correctOptionId: "a",
        feedback:
          "Candle → confirmation → entry is the sequence that respects both sides: it avoids anticipating (the hammer alone is not a signal) and avoids paralysis (three candles later, risk is tripled).",
      },
      {
        id: "step-4",
        narrative:
          "You are long. The trend continues with higher lows, but momentum is visibly decaying — candles are overlapping, volume fading. How do you manage?",
        options: [
          { id: "a", label: "Trail the stop under each new higher low and tighten as decay grows — the trend is still the structure until it breaks" },
          { id: "b", label: "Exit immediately — decaying momentum means reversal has already happened" },
          { id: "c", label: "Add size on every candle — decay is when positions are cheapest" },
        ],
        correctOptionId: "a",
        feedback:
          "Overlap and fading volume are warnings, not verdicts. The higher lows remain the objective line: trail beneath them, tighten as they compress, and let the CHoCH — not a feeling — take you out.",
      },
    ],
  },
  {
    id: "scn-news-spike",
    title: "The candle that ate the chart",
    categoryId: "cat-psychology",
    context: "You are long from the London open. A scheduled release hits in two minutes.",
    steps: [
      {
        id: "step-1",
        narrative:
          "You did not check the calendar and the release catches you in the trade. Price spikes violently against you before you can blink. What is the first correct action?",
        options: [
          { id: "a", label: "Whatever your pre-defined risk says: if the stop is intact, let it do its job — do not widen it" },
          { id: "b", label: "Move the stop further away — the move must come back after news" },
          { id: "c", label: "Add size — post-news spikes mean the level is free" },
        ],
        correctOptionId: "a",
        feedback:
          "The only unforgivable error here is the one that turns a planned 1% loss into a 10% one: widening a stop converts a defined-risk trade into a prayer. Stops exist precisely for the moments you cannot think.",
      },
      {
        id: "step-2",
        narrative:
          "You are stopped out. Price then reverses and runs in your original direction. The feeling in your chest says 're-enter NOW, double size'. What do you actually do?",
        options: [
          { id: "a", label: "Nothing yet — journal the sequence, and only re-enter if the market presents a fresh, standard-risk setup" },
          { id: "b", label: "Re-enter double — the market just showed you were right all along" },
          { id: "c", label: "Revenge short — the market personally wronged you and must pay" },
        ],
        correctOptionId: "a",
        feedback:
          "Being right early and being stopped out are the same event seen from two chairs. Re-entry is legitimate only when a new setup — pattern, context, location, risk — exists. Adrenaline is not a setup.",
      },
      {
        id: "step-3",
        narrative:
          "Later you review: the entry was fine, the stop was fine, the only flaw was not knowing the calendar. What is the durable fix?",
        options: [
          { id: "a", label: "Make the economic calendar a pre-session checklist item — process fix, not willpower fix" },
          { id: "b", label: "Promise yourself to 'focus harder' tomorrow" },
          { id: "c", label: "Stop using stops on news days" },
        ],
        correctOptionId: "a",
        feedback:
          "Every mistake is either a process gap or a discipline gap. A missing calendar check is process: it gets a checklist line, an alert, a routine — systems beat intentions, especially at 8:30 sharp.",
      },
      {
        id: "step-4",
        narrative:
          "End of day. You are down exactly your planned risk on a well-executed rule. How do you grade the session?",
        options: [
          { id: "a", label: "A-process day: the loss was the cost of a defined experiment — grade execution, not P&L" },
          { id: "b", label: "F — red numbers are failure, full stop" },
          { id: "c", label: "Incomplete — a session only counts if it ends green" },
        ],
        correctOptionId: "a",
        feedback:
          "In a probabilistic discipline, well-executed losing days and badly-executed winning days are the two traps. Grade what you control: process, sizing, adherence. P&L follows over samples, not sessions.",
      },
    ],
  },
  {
    id: "scn-trade-management",
    title: "Winner in hand, what now?",
    categoryId: "cat-trade-management",
    context: "You are +1.8R on a swing long. The original target sits at +3R.",
    steps: [
      {
        id: "step-1",
        narrative:
          "The position hit +1.8R faster than expected on a strong impulse. The original plan says +3R. What is within professional playbooks here?",
        options: [
          { id: "a", label: "Hold toward the target while trailing the stop under structure — or bank partials per plan; both are plans" },
          { id: "b", label: "Close it all — +1.8R never survives" },
          { id: "c", label: "Remove the stop — it is a winner now, winners do not need exits" },
        ],
        correctOptionId: "a",
        feedback:
          "Management is choosing among plans made BEFORE the trade: trail under higher lows, bank partials at predefined R, or hold to target with a structural stop. Improvised exits are how plans die.",
      },
      {
        id: "step-2",
        narrative:
          "You decide to bank half and trail the rest under the last higher low. What does this accomplish?",
        options: [
          { id: "a", label: "It decouples the remaining position from your entry anxiety — realized R plus a free-rolling runner" },
          { id: "b", label: "Nothing — partial exits are mathematically identical to full exits" },
          { id: "c", label: "It guarantees the runner reaches target" },
        ],
        correctOptionId: "a",
        feedback:
          "Partials convert variance into choices: some R is banked, the runner can express the tail without risking the win. It does not 'guarantee' anything — it restructures what you are emotionally exposed to.",
      },
      {
        id: "step-3",
        narrative:
          "The runner's trailing stop is hit at +2.4R, well before the +3R target. Honest accounting: how do you score this trade?",
        options: [
          { id: "a", label: "A win — the plan was executed; the market simply ended the trend early" },
          { id: "b", label: "A failure — anything short of the target means the plan was wrong" },
          { id: "c", label: "Neutral — trades only count at round numbers" },
        ],
        correctOptionId: "a",
        feedback:
          "The plan defined success as 'manage to structure, extract R'. It extracted 2.4R. Judging trades by whether the final tick touched the target is outcome bias — the exact thinking that erodes discipline.",
      },
      {
        id: "step-4",
        narrative:
          "Journaling time. Which line best describes what this trade teaches for the NEXT one?",
        options: [
          { id: "a", label: "'Partial + structural trail executed as planned; consider whether decaying volume mid-trade warrants tighter trail' — a management hypothesis" },
          { id: "b", label: "'Got out early again, pathetic' — an identity statement" },
          { id: "c", label: "'Won, nothing to learn' — a closed file" },
        ],
        correctOptionId: "a",
        feedback:
          "Notes that survive contact with the next trade are behavioral and testable. 'Early' and 'pathetic' are verdicts; 'tighten trail when volume decays' is an experiment you can run.",
      },
    ],
  },
];
