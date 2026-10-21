1. Principles
30 seconds flat for the minimal payload (timed). Everything else iscollapsible, never imposed.
One mental model: CAPTURE → JUDGE → REFLECT. Three acts, always inthat order.
Numbers first, words second. Psychology and notes come after.
The process is judged before the result is seen. The Decision Scorecontract — the UX enforces it physically.
Friction is dosed, not absent. Zero friction on numbers, deliberatefriction on judgment.
2. Two modes, one form
Mode	When	Feel
Prospective	During the session	"I'm tracking live" — exit section hidden, trade lives as OPEN in a dedicated panel
Retrospective	After the session	"Logging 6 trades fast" — exit section visible & focused
NOT two forms: the same form adapts. One mental model to learn.

3. Entry points
Permanent floating "+ Trade" button (sidebar desktop, bottom-bar mobile)
N shortcut from anywhere
Discreet ghost button: "Setup seen, not taken" (G)
From a playbook strategy: "Trade this setup" → pre-filled form
4. ACT 1 — Capture
Field spec
Field	Status	Detail
Instrument	Required	Search-first combobox ("eur" → EURUSD…). Recent/favorite chips. Synthetics searchable by "vol75", "boom"…
Direction	Required	Segmented control, pre-selected from last trade. ←/→
Entry / Exit	Required	Numeric, autofocus on Entry. Exit hidden in prospective mode
Time	Auto	Default = now, editable. tradingDate computed server-side
Size or Risk %	Required	The two respond to each other (see sizer)
Strategy	Recommended	Colored chips with grade badges. "Out of playbook" is a first-class 1-tap choice — never an ambiguous empty field
Planned SL/TP	Collapsible	Retrospective: "The Plan". Prospective: promoted to main block
Entry reason	Collapsible	One line, rotating placeholder
Fees	Collapsible	Default 0, single total field
Emotion before	Optional	1-tap chips — never a form
Position sizer (signature detail)
Entry + SL + Risk % → size computed automatically (and inverse mode).The planned size becomes the reference: if the actual size at close differs,the Discipline Engine flags over-sizing. The sizer IS a discipline sensor.

Discipline banner (prospective mode)
Thin live-updating strip: "Today: 2/3 trades · 0.8%/2% risk budget · 1 loss".Turns red near a threshold. If a LOCK-severity rule is violated, the savebutton turns amber with the reason — never a silent block.

Keyboard shortcuts (desktop)
Key	Action
N	New trade (from anywhere)
G	Ghost trade
←/→ or B/S	Direction
Tab	Logical order: entry → exit → size
Enter	Submit / next act
1–5	Grade A–F at the gate
Esc	Close (draft saved, always)
?	Shortcuts overlay
Asset-class adaptation
Labels driven by Instrument metadata: lots (forex), stake(synthetics), units (crypto). pipSize drives input decimals. Zero constantsin code — Boom/Crash users must feel at home.

Live calculation bar
Mono font: "R:R 1:2.4 · Risk $104 (1.0%) · Est. P&L +$255" — updated live.

5. ACT 2 — The Judgment Gate & The Reveal (signature moment)
The Gate
On saving a closed trade, the server computes P&L but does NOT return it.Modal: "Did you follow your plan?" [✓ Yes] [✗ No], then "Grade your decision— based only on what you knew at entry" [A][B][C][D][F]. Discreet "Skip —grade later". No P&L visible anywhere on this screen.

The Reveal (after grading)
Glowing star (constellation motif), summary line, large mono result("+0.8R · +$82 net"), a coaching line, a stats strip ("2 setups avoidedtoday = +1.4R saved"), then [Finish] / [New Trade].

Coaching matrix (4 quadrants)
Win	Loss
Decision A/B	"Solid process, deserved result."	"Good decision, unfavorable outcome — nothing to fix." (most important message in the app)
Decision D/F	"Lucky gain — this result does not reinforce the habit."	"The process failed, not luck."
Graceful degradation (no hostages)
Skip exists, 1 click, but must be sought — the gate stays the royal road
Ungraded trades are 100% functional; excluded only from decision/outcomeanalytics; they feed the "To grade" queue (navbar badge, gradeable later)
Reveal animation ≤ 500 ms, skippable, disable-able in settings
In prospective mode the gate fires at close time — naturally uncontaminated
API contract (the mechanism lives in the contract)
POST /trades (closed) responds { id, awaitingDecision: true } WITHOUT P&Lfields. Only POST /trades/:id/decision returns the full reveal payload.The client cannot accidentally cheat.

6. ACT 3 — Reflect (optional, 1 minute, all skippable)
Block	Format	Note
Detected mistakes	Auto chips: ⚠ Stop moved, ⚠ Out of hours, ⚠ Size > plan (+40%)	Each chip: confirm / dismiss in 1 tap. Trains the detector + creates awareness at maximum receptivity
Emotion after	1-tap chips	The reaction to the result
MFE / MAE	2 numeric fields	"How far it went for/against you" — optional, feeds the "cutting winners early" analysis
Tags	Existing chips + inline creation	
Note / lesson	One textarea	Rotating placeholder: "What would you do differently?"
Screenshots	Upload / paste (Ctrl+V) / camera (mobile)	Before/after, annotation later
7. Fast loop (evening batch)
At the reveal: Enter = finish, N = new trade
New form retains context: same instrument, strategy, session — only priceschange. Default entry time = previous trade's exit time
Target: < 15 seconds per additional trade
8. Ghost Trade — 10-second capture
Minimal card: instrument combobox, direction (▲ / ▼ / —), single-selectreason chips (Fear, Discipline, Out of playbook, No valid setup, Missedexecution), [Log it].

Deferred settlement: next day or week, a soft notification — "YourTuesday BOOM500, how did it play out?" → 2 taps: would have won / lost /don't know (+ optional estimated R). This settlement feeds Discipline Savedand Hesitation Cost. Without it, ghost trades stay vague intentions.

9. Open trades panel (Session Live)
Compact cards: instrument, direction badge, open duration, entry, initialSL/TP, potential R:R, actions [Close] [Modify SL] [emotion quick-log] [Note].

[Modify SL] creates a TradeEvent server-side (fuel for "stop widened")
In-trade emotion taps = live tilt biomarker
V1 honesty: no live prices (no market feed, no provider cost). COSMOZis not an execution platform and never will be. Consequence, documentedin-app: real-time interception is proportional to live logging. Retrologgers get pre-mortems and evening analysis instead.
10. Mobile / PWA
Aspect	Desktop	Mobile
Container	Wide modal	Bottom sheet, 3 snap points
Numeric fields	Physical keyboard	inputMode="decimal" pads, large touch targets
Speed	Shortcuts	Oversized chips, thumb-zone buttons
Screenshots	Upload / Ctrl+V	Camera + gallery
Reveal	Skippable animation	Same + haptic feedback
Resilience	Draft localStorage	Offline queue: POSTs replay when network returns
Ghost trade	G	Dedicated button in bottom bar
11. Validations (amber, non-blocking, auto-dismiss on fix)
"Exit beyond your SL — stop moved?"
"Size 10× your usual — confirm?" (active after ~20 trades of history)
"R:R 1:0.3 — intended?"
"Risk 2.5% > your 2% limit" → NOT just a warning: Discipline Engine hook,rule severity decides (notify → warn → alert → lock)
Drafts: permanent autosave, restored on reopen, visible "Draft saved" badge.A crash must never cost a capture.

12. Screen → endpoint matrix
Screen / action	Endpoint	Contract notes
Instrument autocomplete	GET /instruments?q=	Client cache + local "recents" chips
Discipline banner	GET /rules/status?accountId=	Daily aggregate; refetched after each mutation
Templates / "Trade this setup"	GET /strategies	Client-side prefill
Create (retrospective, closed)	POST /trades	Body includes exits. Response WITHOUT P&L: { id, awaitingDecision: true }
Create (prospective, open)	POST /trades	No exits → status OPEN
Close	POST /trades/:id/close	Simple or multiple exits → awaitingDecision: true
Judgment gate	POST /trades/:id/decision	{ grade, followedPlan } → full reveal payload (P&L, R, duration, detected mistakes, triggered alerts)
Modify SL/TP (open trade)	PATCH /trades/:id/plan	TradeEvent created SERVER-side — client never forges events
In-trade emotion	PATCH /trades/:id/psychology	
Reflect screen	GET /trades/:id/review	Detected mistakes + similar past trades (V2)
Confirm/dismiss mistake	PATCH /trades/:id/mistakes/:mistakeId	{ confirmed: bool }
"To grade" queue	GET /trades?graded=false	Navbar badge
Ghost trade	POST /skipped-trades	+ PATCH /skipped-trades/:id/settle
CSV import (V2)	POST /imports	Idempotent via existing externalRef
13. API invariants
The client NEVER sends pnl, rMultiple, computed MFE — server computes.
The Decision Score mechanism lives in the API contract (P&L withhelduntil grading), not in front-end goodwill.
Every trade mutation triggers Discipline Engine evaluation; generatedalerts travel in the response (V1), then push/SSE (V2).
14. Rejected decisions (do not reintroduce)
Multi-step wizard (1/2/3/4): slower, anxious, administrative. Theadaptive single screen wins.
Many required fields: every required field beyond the core loses users.Incomplete-but-present data beats perfect-never-entered data.
Chart video replay in this flow: needs a market data provider — V3,separate module.
Unlimited post-close edits: editing a closed trade stays possible(soft-delete, audit log) but after the gate, the grade is locked toexplicit grade-edit only — otherwise users rewrite history and statsbecome lies.
15. Success criteria (measure from day 1)
Median capture time (retrospective core form): < 25 s (PostHog)
Gate completion rate: > 70 % — THE behavioral KPI
% trades with emotion-before: > 50 %
D30 retention of active users — the only metric that truly matters