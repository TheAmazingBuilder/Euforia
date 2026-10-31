#!/usr/bin/env node
/**
 * Regenerates docs/audits/records/t19..t31 from real audit data.
 * The data array below is the single source of truth - edit it and re-run
 * `node scripts/gen-audit-records.mjs` to refresh the archive records.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const outDir = join(root, "docs", "audits", "records");
mkdirSync(outDir, { recursive: true });

/** @type {Array<Record<string, string | string[]>>} */
const records = [
  {
    pass: "t19",
    date: "2026-09-26",
    title: "Sidebar sections (Overview / Trading / Tools / System) + collapsible Academy",
    verdict: "RE-APPLIED - PASS",
    commit: "9f2bae8",
    scope: [
      "lib/navigation.ts restructured: NavSection type + NAV_SECTIONS (overview / trading / tools / system / academy collapsible) + flattened SIDEBAR_ITEMS keeping getPageTitle, getBreadcrumb, getNavItem and the ⌘K palette unchanged.",
      "SidebarNav: discreet uppercase section labels (11px, tracking-widest, muted/70); ghost button 'Setup seen, not taken' grouped under Overview after Dashboard; Academy fold row (GraduationCap + rotating chevron, aria-expanded) with honest empty state 'Modules coming soon - new tabs will land here.'; collapsed mode = h-px w-6 separators between groups, icon-only rows.",
      "CosmozMark recreated after rollback loss (cobalt gradient tile 2E6BF6→1B3FB8→0A1745, equity curve with honest dip, emerald sparkle, useId-scoped gradient ids - the one sanctioned hex exception).",
      "coach/goals pages re-removed (earlier user decision preserved); /reports nav link dropped (page lost to rollback - returned with t21).",
    ],
    fixes: [
      "E2E: redundant 'ACADEMY' label above the fold row removed - the row already carries its name.",
      "Rollback damage discovered mid-pass (imports broken) was repaired in the same scope to keep the build coherent.",
    ],
    checks:
      "tsc 0 errors, eslint 0 warnings · Desktop 1440 light: sections rendered, Academy unfolds, collapsed mode with separators · Dark: tokens adapt, zero hex · Mobile 390 sheet: sections + Academy unfold · scrollWidth = innerWidth everywhere · Ghost modal opens from Overview · /trades + /discipline navigation OK · console clean.",
    evidence: [
      "apps/web/scripts/shots/t19/desktop-light-sidebar-sections.png",
      "apps/web/scripts/shots/t19/desktop-light-academy-unfolded.png",
      "apps/web/scripts/shots/t19/desktop-light-collapsed.png",
      "apps/web/scripts/shots/t19/desktop-dark-sidebar-sections.png",
      "apps/web/scripts/shots/t19/desktop-light-ghost-modal.png",
      "apps/web/scripts/shots/t19/mobile-dark-sheet-academy.png",
      "apps/web/scripts/shots/t19/mobile-light-trades.png",
    ],
    notes:
      "Re-delivered on the restored base 47cb98e after the workspace rollback; original commit 9f2bae8-era work re-executed from scratch.",
  },
  {
    pass: "t20",
    date: "2026-09-26",
    title: "Session toolbar mobile wrap fix (11px horizontal overflow at 390)",
    verdict: "RE-APPLIED - PASS",
    commit: "eacc941",
    scope: [
      "session-toolbar.tsx: the Marked price block switches from min-w-0 flex-1 to w-full min-w-0 sm:w-auto sm:flex-1 - full row below sm, flex from sm up.",
      "Desktop (1440) verified unchanged.",
    ],
    checks:
      "tsc 0, eslint 0 · 390: scrollWidth = innerWidth (overflow gone) · 1440: scrollWidth = innerWidth · 0 page errors · console clean.",
    evidence: ["apps/web/scripts/shots/t20/ (2 PNG)"],
    notes:
      "Faithful re-application of the lost commit 3e4d57b (destroyed by the rollback).",
  },
  {
    pass: "t21",
    date: "2026-09-26",
    title: "Auto weekly report - /reports page + /stats/weekly contract",
    verdict: "RE-APPLIED - PASS",
    commit: "ad9c267",
    scope: [
      "Shared contract packages/shared/src/schemas/weeklyReport.ts: days[7] zero-filled, totals (netPnl/trades/winRate/rEarned/disciplineAvg), best/worst spot, byInstrument sorted, insights ≤4 toned, generatedAt, isCurrent, currency.",
      "Mock: store.weeklyReport(start?) - Monday..Sunday window (pure UTC math, parseKey/addDaysKey/mondayKeyOf, base-0 bug avoided), aggregates from closedTrades + disciplineScore, best day 'Fri, Sep 25', insights (winrate, best day, Cosmoz Index adherence, avg R). MSW GET /stats/weekly?start=.",
      "Client: endpoints.statsWeekly, queryKeys.statsWeekly(start), useWeeklyReport(start).",
      "UI: (app)/reports + weekly-report.tsx - week navigation (prev/next, next disabled + THIS WEEK badge on current week), 5 KPIs, daily P&L bar EChart (profit/loss gradients + getChartTheme), best/worst trades, per-instrument table, insights panel, skeletons, error/empty states.",
      "Navigation: Reports (CalendarRange) back in TOOLS between Discipline and Calendar.",
    ],
    checks:
      "tsc app 0, tsc shared 0, eslint 0 · Desktop 1440 dark + full page: KPIs (+171.73 USD / 5 trades / 60% / +2.44R / 73–100), week navigation validated both directions (Sep 14–20 ↔ Sep 21–27, next disabled + THIS WEEK) · Mobile 390 dark + light sw=iw · console clean.",
    evidence: ["apps/web/scripts/shots/t21/ (4 PNG)"],
    notes: "Re-application of the lost commit 9c22d6e.",
  },
  {
    pass: "t22",
    date: "2026-09-26",
    title: "Auth improvement - split layout, two-step verification, reset flow, password confirmation",
    verdict: "RE-APPLIED - PASS",
    commit: "cc3b69d",
    scope: [
      "lib/auth/demo.ts: simulateLatency, maskEmail, emailIssue, passwordIssue (min 8), passwordsMatch - shared rules, honest 'demo build' framing.",
      "Split layout (auth)/layout + auth-brand.tsx: aside bg-surface border-r with CosmozMark + wordmark + ThemeToggle, eyebrow 'Le Registre', headline, 3 feature rows (token icons), SVG decor with named tokens + accent equity curve; AuthMobileHeader lg:hidden; form column centered max-w-sm. All tokens - adapts to all 3 themes.",
      "Login: email + password (reveal eye via PasswordInput), forgot link, inline validation with clearError on edit, submit → toast + /two-step?mode=verify&email=.",
      "Register: name/email/password + CONFIRM with MatchIndicator aria-live ('Passwords match' profit / 'don't match' loss), 'Good password' hint from 8 chars, invalid submits blocked, → /two-step?mode=setup.",
      "Two-step: 6-box OTP (auto-advance, backspace to previous box, arrows, paste-fill, select-on-focus), disabled until complete, verify/setup modes (copy + masked email), resend cooldown 30s with cleaned timer, demo hint 'any 6-digit code accepted', → dashboard. Anti-overflow: grid-cols-6 minmax(0,1fr) + size={1} + w-full min-w-0 inputs.",
      "Forgot-password: email → 'Check your inbox' state (MailCheck, email shown) → 'Open the reset link' (honest simulation) → /reset-password?token=demo-reset-token + 'Use a different email'.",
      "Reset-password: no token → 'This link has expired' (Link2Off, warning); with token → new password + confirm → 'Password updated' (KeyRound, profit) → sign in.",
      "5 routes (login, register rewritten; two-step, forgot-password, reset-password created); useSearchParams under Suspense; getPageTitle extended.",
    ],
    checks:
      "tsc 0, eslint 0 · Desktop 1440: split layout dark + light, login→2FA(verify)→dashboard (keyboard auto-advance), register mismatch → correction → 'Passwords match' → 2FA setup, forgot→inbox→reset→updated, tokenless link → 'expired', resend 30s→29s · Mobile 390 all pages sw=iw · console clean.",
    evidence: ["apps/web/scripts/shots/t22/ (10 PNG)"],
    notes: "Re-application of the lost commit 1a8447f. File of re-applications completed here.",
  },
  {
    pass: "t23",
    date: "2026-09-26",
    title: "Journal - searchable written log (entries CRUD, tags, mood, two-step delete)",
    verdict: "PASS*",
    commit: "d22e238",
    scope: [
      "Shared contract journalEntry.ts: JournalEntry (date/title/body/tags≤6/mood nullable/relatedTradeId nullable), JournalListResponse, Create/Update inputs (z.input).",
      "Mock: store.journalEntries (8 honest seeded entries, NEGATIVE dateKeyOffsets), listJournalEntries({q,tag}) server-side filter+sort desc, create/update/delete (MockError 404). MSW GET/POST /journal + PATCH/DELETE /journal/:id.",
      "Client: endpoints.journal(.journalEntry), keys.journal(params)+journalRoot, hooks useJournalEntries/useCreate/useUpdate/useDelete (journalRoot invalidation).",
      "UI: (app)/journal + journal-view + journal-entry-dialog. 'Ruled document' layout: marginal date column (day/month/weekday), hairline divide-y rows, Schibsted titles, #tag annotations mono + mood, discreet hover fill, reveal-stagger. Search + tag chips (active = ink block), 'N of total' counter. Create/edit dialog (date, mood select, title, body, tags) with adjust-state-during-render pattern (anti-effect lint). Two-step inline delete ('Delete forever'/'Keep'). Skeletons, two empty variants, error state.",
    ],
    fixes: [
      "Double JSON encoding - hooks passed JSON.stringify(body) while apiRequest already serializes (repo convention body: input); caused undefined-field entries and cascading GET 500s.",
      "Seed date offsets were positive (entries dated in the future) - flipped negative.",
      "Tag chips read via a second unfiltered request to stay stable while searching.",
    ],
    checks:
      "tsc 0, eslint 0, impeccable detector [] · Desktop 1440: create (9 entries, head of list), filter #lesson (5 of 9), search 'retest' (1 of 9), edit pre-filled + save, two-step delete · Mobile 390 sw=iw · dark + light captured · console error-free.",
    evidence: ["apps/web/scripts/shots/t23/ (6 PNG)"],
    notes: "Placeholder replaced by the real register.",
  },
  {
    pass: "t24",
    date: "2026-09-26",
    title: "Settings - profile, appearance, risk defaults, accounts, data & backup",
    verdict: "PASS* (Turbopack incident fixed by clean restart)",
    commit: "c75f25f",
    scope: [
      "Shared contract settingsRisk.ts: RiskDefaults (riskPerTradePct/maxDailyLossPct decimal strings + maxTradesPerDay int).",
      "Mock: store.riskDefaults (0.5%/2%/3), get/update, MSW GET/PATCH /settings/risk, endpoints.settingsRisk, keys, hooks useRiskDefaults/useUpdateRiskDefaults.",
      "UI: settings-view replaces PagePlaceholder - ruled hairline sections (reusable Section, no cards-in-cards): Profile (name/email/timezone via PATCH /me, seed via adjust-during-render), Appearance (3 theme buttons with dots + aria-pressed, active = ink block), Risk defaults (3 numeric inputs + validation), Accounts (read-only table from /accounts, default badge), Data & backup (BackupCard kept), Sign out. Toasts on each save.",
    ],
    checks:
      "tsc 0, eslint 0, impeccable detector [] · Desktop 1440: profile edited 'Alex Trader' → toast + server persistence (avatar AT updated), risk 0.75% persists (GET verified via UI), Light switch from Appearance → data-theme=light + paper background → back to dark-blue · Mobile 390 dark + light sw=iw · 0 page errors.",
    evidence: ["apps/web/scripts/shots/t24/ (5 PNG)"],
    notes:
      "Turbopack stale RSC manifest after page rewrite - resolved by clean .next restart; documented as part of the pass.",
  },
  {
    pass: "t25",
    date: "2026-09-26",
    title: "Journal ↔ trades - linked-trade picker + execution chips on entries",
    verdict: "PASS",
    commit: "1fbcd8f",
    scope: [
      "Contract: updateJournalEntryInputSchema accepts relatedTradeId (nullable optional) - link/relive/delink.",
      "Mock: updateJournalEntry applies relatedTradeId; seed threads 4 entries to REAL fixture trades via linkSeedEntry (most recent CLOSED trade of the symbol with tradingDate ≤ entry date, honest null fallback): BOOM500/XAUUSD/XAUUSD/BTCUSDT.",
      "Dialog: 'Linked trade' Select (mono) - all trades newest-first, label 'SYMBOL · long/short · date · +R/open', hint 'Tie the note to the execution it reviews.'; JournalDraft carries relatedTradeId.",
      "View: LinkedTradeChip hairline mono (Link2 accent, bold symbol, buy/sell arrow profit/loss, net P&L + formatR colors, 'open' warning when not closed); resolution via useTrades + useInstruments (memoized maps).",
    ],
    checks:
      "tsc shared 0, tsc app 0, eslint 0 · Desktop 1440 dark+light: 4 seed chips shown (BOOM500 +111.79 +1.01R / XAUUSD +175.59 +1.76R / XAUUSD +90.81 +0.98R / BTCUSDT +112.94 +1.26R), linked entry created (9 entries, chip at head), edit → 'Not linked' → chip removed (4 remaining) · dialog light captured · Mobile 390 light+dark sw=iw · console clean, 0 page errors.",
    evidence: ["apps/web/scripts/shots/t25/ (5 PNG)"],
    notes: "Journal entries are now threaded to executions.",
  },
  {
    pass: "t26",
    date: "2026-09-26",
    title: "Journal PDF export - jsPDF typeset 'Le Registre' download",
    verdict: "PASS (real PDF artifact verified)",
    commit: "068d52e",
    scope: [
      "Dependency jspdf 4.2.1 added to apps/web (lazy-import on click - no initial-bundle cost).",
      "lib/journal-export.ts: exportJournalPdf(items, meta) - A4 portrait, 20mm margins, 17mm ledger margin; header 'COSMOZ / TRADING JOURNAL - LE REGISTRE' + counter + export date, accent note 'Filtered view: …' when filters active; each entry = courier marginal date ('26 SEP 2026 - SATURDAY'), helvetica bold title, mono meta line (#tags, mood, trade: SYMBOL side +R), wrapped body, hairlines between entries; page breaks by height estimation; footers 'cosmoz - the trading register' + 'Page X / Y'.",
      "View: outline 'Export PDF' button (FileDown / spinner) beside New entry, disabled when empty/loading; payload = the CURRENT filtered view (search/tag) with resolved trade chips; success toast 'N entries on M pages' or error.",
    ],
    checks:
      "tsc 0, eslint 0 · Desktop 1440 dark: full export → real downloaded file (visually verified: 8 entries / 2 pages, layout conformant) · tag-filtered export → '4 entries on 1 page' + 'Filtered view: tag #lesson' note inside the PDF · light theme + mobile 390 sw=iw · console clean.",
    evidence: [
      "apps/web/scripts/shots/t26/ (3 PNG + filtered-sample PDF artifact)",
    ],
    notes: "The filtered view on screen IS what goes to paper.",
  },
  {
    pass: "t27",
    date: "2026-09-26",
    title: "Journal goals - writing cadence today / month / year with editable targets",
    verdict: "PASS",
    commit: "da764c8",
    scope: [
      "Shared contract journalGoals.ts: JournalGoals entriesPerDay/Month/Year ints, UpdateJournalGoalsInput partial.",
      "Mock: store.journalGoals (1/20/240 defaults), get/update, MSW GET/PATCH /settings/journal-goals, endpoints.journalGoals, keys (+Root), hooks useJournalGoals/useUpdateJournalGoals (setQueryData).",
      "UI: journal-goals.tsx - ruled border-y band under the header; 3 rows (label / h-1.5 bar / mono counter); ink fill turning profit when target reached; 'N linked' annotations (entries linked to a trade in the period); target 0 = honest empty bar; Edit targets → dialog (integer ≥0 validation, save disabled otherwise) → PATCH → toast. Counters computed from allData (UNFILTERED log) with todayKey Toronto.",
    ],
    checks:
      "tsc shared 0, tsc app 0, eslint 0 · Desktop 1440 dark: 'Today 1/1 · 1 linked', 'This month 8/20 · 4 linked', 'This year 8/240 · 4 linked'; edit targets 1→2 → 'Today 1 / 2' persists (PATCH verified via UI) · light + mobile 390 sw=iw · console clean.",
    evidence: ["apps/web/scripts/shots/t27/ (4 PNG)"],
    notes: "The journal now shows writing pace against the plan; linked entries count toward progress.",
  },
  {
    pass: "t28",
    date: "2026-09-26",
    title: "Journal filters & sort - linked/unlinked + mood chips, newest/oldest/title orders",
    verdict: "PASS",
    commit: "5ec83c4",
    scope: [
      "Contract: JournalQuery extended (linked 'true'/'false', mood, JournalSort newest|oldest|title); GET /journal handler reads the 3 new params; store.listJournalEntries filters linked/mood + sorts (title = localeCompare, oldest = inverse date/createdAt key).",
      "Client: keys.journal + useJournalEntries extended (sort 'newest' does not encode the param).",
      "UI: 'Sort order' Select (mono) beside search; LINK chip row (All/Linked/Unlinked); MOOD row (moods present in the log, from allData); FilterChip extracted (single grammar: mono hairline, active = ink block) and applied to existing tags too; clickable mood annotation filters that mood; isFiltered + counter + export note extended (mood/linked).",
    ],
    checks:
      "tsc 0, eslint 0 (fixed Emotion type predicate) · Desktop 1440 dark: Linked → 4 of 8, Unlinked → 4 of 8, mood calm → 3 of 8, Oldest first → 'Weekly review' at head, Title A-Z → alphabetical verified, linked-filtered export → PDF note 'Filtered view: linked to trade' verified in file · light + mobile 390 sw=iw · console clean.",
    evidence: ["apps/web/scripts/shots/t28/ (4 PNG)"],
    notes:
      "The journal becomes a queryable register; everything that existed (search, tags, goals, export) stayed intact - additive only.",
  },
  {
    pass: "t29",
    date: "2026-09-26",
    title: "System → Monitoring - service health, latency window, incident log",
    verdict: "PASS",
    commit: "490b123",
    scope: [
      "Contract systemHealth.ts: SystemService (status operational|degraded|down|maintenance, latencyMs, uptimePct, honest detail), SystemIncident (severity minor|major|maintenance, resolvedAt nullable), SystemHealth (latencySeries + windowLabel + checkedAt).",
      "Mock: store.getSystemHealth() - deterministic 60-point latency walk (sin/cos, stable across loads), 3 services (Cosmoz API / Market data feed / Broker link) with honest demo details ('no real server is probed', 'synthetic quote stream', 'read-only demo broker'), 2 resolved incidents; MSW GET /system/health (handlers/system.ts), endpoints.systemHealth, keys.systemHealth, hook useSystemHealth.",
      "Nav: MONITORING (Gauge) in System after Settings - SIDEBAR_ITEMS/palette/titles derive automatically.",
      "UI: (app)/monitoring + monitoring-view.tsx - 'All systems operational' banner (worst status), ruled rows (StatusPill dot profit/warning/loss/accent, latency + uptime mono, muted detail), ECharts accent area graph (getChartTheme, mono tooltip), incident log (severity badges, timestamps, Resolved/Ongoing), 'Checked … - demo build' annotation.",
    ],
    checks:
      "tsc shared 0, tsc app 0 (fixed EChart required ariaLabel), eslint 0 · Desktop 1440 dark+light: 'All systems operational', 3 services, 2 incidents, graph rendered · Mobile 390 light+dark sw=iw · console clean.",
    evidence: ["apps/web/scripts/shots/t29/ (4 PNG)"],
    notes: "System > Monitoring delivered - the cockpit's health, honest about its demo nature.",
  },
  {
    pass: "t30",
    date: "2026-09-26",
    title: "System → Integrations - connection catalog with simulated connect/disconnect",
    verdict: "PASS",
    commit: "43fe93d",
    scope: [
      "Contract integration.ts: Integration (category broker|data|automation|productivity, status connected|disconnected, connectedAt nullable, honest detail), IntegrationsResponse, IntegrationToggleResponse.",
      "Mock: store.listIntegrations() - 6 seeded (Deriv demo connected; IBKR/Binance/TradingView/Telegram/Google Calendar disconnected); store.toggleIntegration(id) - flip + timestamp, MockError 404; MSW GET /integrations + POST /integrations/:id/toggle, endpoints.integrations(+toggle), keys.integrations, hooks useIntegrations/useToggleIntegration (invalidation).",
      "Nav: INTEGRATIONS (Cable) in System after Monitoring.",
      "UI: (app)/integrations + integrations-view.tsx - ruled rows grouped by category (ledger labels), Connected (profit) / Not connected (muted) pill + 'since …', description + honest mono demo detail, Connect (default) / Disconnect (outline) with spinner, 'N of M connected' counter, honest note 'no keys are exchanged'.",
    ],
    checks:
      "tsc shared 0, tsc app 0, eslint 0 · Desktop 1440 dark+light: '1 OF 6 CONNECTED' → Connect IBKR → '2 OF 6' + CONNECTED + Disconnect button → Disconnect → back to '1 OF 6' · counter, toasts · Mobile 390 light sw=iw · console clean.",
    evidence: ["apps/web/scripts/shots/t30/ (3 PNG)"],
    notes: "Six connections catalogued; honest simulated state switch, announced as such.",
  },
  {
    pass: "t31",
    date: "2026-09-26",
    title: "System → Security - password rotation, 2FA, sessions, login history, hardening checklist",
    verdict: "PASS",
    commit: "0b284c0",
    scope: [
      "Contract security.ts: SecurityOverview (2FA + passwordLastChangedAt + sessions[current] + logins[outcome success|failed] + recommendations), ChangePasswordInput min 8, toggle/revoke responses.",
      "Mock: store.security (2FA off, password changed 21d ago, 3 sessions incl. current, 5 logins incl. 1 failed Frankfurt); getSecurityOverview() with computed recommendations (2FA, rotation <90d, remaining sessions ≤1); changePassword (honest: no credential stored, re-stamped clock, 422 if <8), toggleTwoFactor, revokeSession (404, 400 if current); MSW GET /security/overview + POST /security/password, /security/two-factor, /security/sessions/:id/revoke; endpoints, keys, hooks (invalidating overview).",
      "Nav: SECURITY (KeyRound) in System after Integrations - System complete: Settings / Monitoring / Integrations / Security.",
      "UI: security-view.tsx ruled Sections - Password (current/new/confirm, global reveal, inline passwordIssue from lib/auth/demo, aria-live match indicator, save disabled when invalid); Two-step (ShieldCheck profit / ShieldAlert warning pill + Enable/Disable); Active sessions (CURRENT accent badge, Revoke disabled on current); Login history (SIGNED IN profit / FAILED loss); Hardening checklist (CheckCircle2 profit / Circle, struck title when done); demo footnote.",
    ],
    checks:
      "tsc shared 0, tsc app 0, eslint 0 · Desktop 1440 dark: 2FA off → Enable → 'is on' + rec-2fa checklist item passes (profit icon + struck title) · Revoke laptop → 3 → 2 sessions · password mismatch → 'Passwords don't match' + save disabled · corrected → 'Passwords match' → save → 'Password changed' toast + fields reset · light captured · Mobile 390 light+dark sw=iw · console clean.",
    evidence: ["apps/web/scripts/shots/t31/ (4 PNG)"],
    notes:
      "The account's locks delivered; System section complete: Settings / Monitoring / Integrations / Security.",
  },
  {
    pass: "t32",
    date: "2026-09-27",
    title: "Topbar clock - local date + live time before the search affordance",
    verdict: "PASS",
    commit: "e70ff29",
    scope: [
      "layout/topbar-clock.tsx - date (Sat, Sep 26) + live HH:MM:SS + timezone (xl+) in the register's mono voice, tabular-nums, no icon or border (a margin annotation, not a gadget).",
      "Hydration honest: useSyncExternalStore (1s interval subscribe, epoch-second snapshot, server snapshot null → pre-hydration reserve) - the repo's anti-effect lint rejects synchronous setState in effects; the external-store solution is idiomatic.",
      "Responsive: date from lg+, time from sm+, phones stay clean (the 390 topbar is dense; the breadcrumb keeps its room).",
      "Inserted BEFORE the command-palette trigger (Search ⌘K) in the topbar.",
    ],
    checks:
      "tsc 0, eslint 0 (after useSyncExternalStore refactor) · Desktop 1440 dark+light: clock visible BEFORE search (compareDocumentPosition verified), tick 22:21:33 → :35 → :40 → :42, tokens adapt · Mobile 390: clock hidden, sw=iw · console 0 errors.",
    evidence: ["apps/web/scripts/shots/t32/ (4 PNG)"],
    notes: "The desk shows its own time; the layout never lies about SSR.",
  },
  {
    pass: "t33",
    date: "2026-09-27",
    title: "Session Live chart owns the full row - nothing removed, panels re-paired",
    verdict: "PASS",
    commit: "1ba4aed",
    scope: [
      "session-view.tsx: PriceChart leaves the lg:grid-cols-3 (2/3 slot) for a full-width row; BrokerPanel + SymbolPositions move to a lg:grid-cols-2 pair underneath; canvas height widened via heightClass h-[320px] sm:h-[480px]; SessionSkeleton matches the new grid.",
      "Nothing deleted: toolbar, Entry/SL/TP overlays, open positions, Regret Registry, ghost check-in, timeline, mood strip all kept.",
    ],
    checks:
      "tsc 0, eslint 0 · Desktop 1440 dark+light: canvas 1134px = full content width (main 1200 − padding 64 − border), 'Trading account' + 'Positions on BOOM500' paired, overlays visible · Mobile 390 dark+light: canvas 356px full width, sw=iw · console 0 errors.",
    evidence: ["apps/web/scripts/shots/t33/ (4 PNG)"],
    notes: "The monitoring station breathes; the journaling flow is untouched.",
  },
  {
    pass: "t34",
    date: "2026-09-27",
    title: "Sidebar sign out under Academy (+ trades table overflow contained)",
    verdict: "PASS* (in-flight fix: separate commit 98a8a5a)",
    commit: "ba3af67",
    scope: [
      "sidebar.tsx: quiet Sign out link (LogOut) at the very bottom of SidebarNav - under Academy, last nav item, shared by desktop sidebar AND mobile sheet; muted/80 voice turning carmin on hover (leaving is the one destructive move in a nav list); href /login like the Settings exit; collapsed mode = icon-only with aria-label + h-px separator.",
      "In-flight E2E fix (98a8a5a): at 390 on /trades, documentElement.scrollWidth = 961 - the min-w-[980px] trades table bled into the viewport scrollable area THROUGH its overflow-x-auto wrapper (pre-existing, reproduced on HEAD via stash, unrelated to the sidebar change). Fix: [contain:paint] on the scroll card - sw 961 → 390, in-card horizontal scroll kept, zero visual change.",
    ],
    checks:
      "tsc 0, eslint 0 · Desktop 1440 dark+light: Sign out last item after Academy (compareDocumentPosition), click → /login, collapsed icon+aria-label · Mobile 390 light+dark: sheet shows Sign out under Academy, sw=iw · console 0 errors.",
    evidence: [
      "apps/web/scripts/shots/t34/ (5 PNG)",
    ],
    notes:
      "The register closes under Academy. Bonus: the wide trades ledger no longer leaks into the viewport metric - future wide tables should reuse the [contain:paint] pattern on their scroll card.",
  },
  {
    pass: "t35",
    date: "2026-09-27",
    title: "Academy opens - data engine, internal nav, Overview, catalog, course pages",
    verdict: "PASS",
    commit: "413b195",
    scope: [
      "Shared contracts academy.ts (category/course/lesson/quiz/progress/glossary) - quiz questions ship WITHOUT answers; grading is server-side.",
      "Mock content engine mocks/academy/: 12 domains, 12 courses, 45 real lessons (~150-200 words each, probabilistic framing, SMC presented as framework-not-law), 8 quizzes x 4 questions with per-wrong-answer verdicts, 54-term glossary, per-user progress store (completions, Toronto-anchored streak, level rubric, achievements, seeded 5-lesson in-flight state).",
      "Academy fold unfolds: Overview + Courses; Overview dashboard (time-aware greeting via useSyncExternalStore, Continue Learning card, 4-KPI band, level chip, rules-based suggested path labeled 'not AI', 12 category rows); Courses catalog with client search + level/status chips + ?category= deep-link; course detail pages with module sections and completion-aware lesson rows.",
    ],
    checks:
      "tsc 0, eslint 0 · Desktop 1440 dark+light: greeting, continue card (Candlestick Mastery 3/6, 33%), KPIs (5/45, streak 3 days), 12 categories; catalog: search 'candle'→1, beginner→5, deep-link→'40% of domain'; course page: 4 modules, 6 lessons, 2 done · Mobile 390 sw=iw · console 0 errors (initial errors were stale HMR messages pre-component-creation; verified 0 after clear).",
    evidence: ["apps/web/scripts/shots/t35/ (7 PNG)"],
    notes: "Content is dynamic from the client's point of view - a CMS can replace the mock files without touching the UI.",
  },
  {
    pass: "t36",
    date: "2026-09-27",
    title: "Academy lesson reader - objectives, figures, completion, navigation",
    verdict: "PASS",
    commit: "864991e",
    scope: [
      "Route /academy/courses/:courseId/:lessonId - objectives contract block, concept sections with mono bullets, 13-figure token-driven SVG registry (shared CandleSvg OHLC engine + structure/risk diagrams: support-resistance role flip, uptrend HH/HL, BOS/CHoCH, double top, bull flag, anatomy callouts, sentiment spectrum, hammer/star, engulfing, morning star, risk-per-trade, position sizing, R multiple).",
      "Completion tracking (idempotent POST, streak toast), takeaways + common-mistakes ruled blocks, prev/next lesson navigation with REAL titles (contract extended prevLessonTitle/nextLessonTitle).",
      "Fixes in flight: anatomy label overlap; topbar breadcrumb 'Cosmoz > Cosmoz' on dynamic routes → regex 'Lesson'/'Course'.",
    ],
    checks:
      "tsc 0, eslint 0 · Desktop 1440: lesson renders (3 objectives, 2 sections, figure, 3 takeaways, 2 mistakes), completion → badge + toast '6 total, 3-day streak', SPA propagation verified (course 2/5→3/5, Overview KPI 5/45→6/45 via ['academy'] invalidation) · hard reload resets the session-scoped mock store (known demo-wide behavior) · mobile 390 sw=iw · console 0 errors.",
    evidence: ["apps/web/scripts/shots/t36/ (5 PNG)"],
    notes: "Every lesson reads like a page of the Registre; figures use CSS variables only - the hex exception stays with the brand tile.",
  },
  {
    pass: "t37",
    date: "2026-09-27",
    title: "Academy quiz - server-graded attempts with per-question verdicts",
    verdict: "PASS* (in-flight fix: MSW handler unwrapped {answers} incorrectly → 500; fixed)",
    commit: "4236681",
    scope: [
      "One-question-per-screen flow (radio semantics, progress bar, Back/Next gated on selection, Submit when complete), intro screen with attempts/best, score banner tiered profit/warning/loss with honest copy ('feedback, not a verdict'), per-question verdicts (your answer vs correct, why-the-chosen-wrong explanation), retake.",
      "QuizCard on the course page (N questions · attempts · best %); 'Quiz' breadcrumb.",
    ],
    checks:
      "tsc 0, eslint 0 · Desktop 1440: deliberate 2/4 attempt (verdicts + wrong-answer explanations verified) then 4/4 (best 100%, toast, card shows '1 attempt · best 100%') · 0/4 run verified tiered messaging · mobile 390 sw=iw · console 0 errors.",
    evidence: ["apps/web/scripts/shots/t37/ (3 PNG)"],
    notes: "Answers never travel to the client before grading - the quiz cannot be inspected via devtools.",
  },
  {
    pass: "t38",
    date: "2026-09-27",
    title: "Academy progress - per-category ledger, level rubric, achievements",
    verdict: "PASS",
    commit: "9a18d56",
    scope: [
      "Route /academy/progress - 4-KPI band (level + rubric label, streak, courses completed, overall %), continue-learning CTA, 12 per-category rows (N/M · % with ink bars turning profit when complete), 6 achievements grid computed from the record (earned = amber icon, else muted), honest footnote.",
      "Progress tab (Gauge) joins the Academy fold.",
    ],
    checks:
      "tsc 0, eslint 0 · Desktop 1440 dark+light: 12 rows (Risk 2/5 · 40%, TA 1/4 · 25%), 6 achievements 1 earned · Mobile 390 sw=iw · console 0 errors.",
    evidence: ["apps/web/scripts/shots/t38/ (3 PNG)"],
    notes: "Progress is per account by construction - isolation is in the store contract, not a UI promise.",
  },
  {
    pass: "t39",
    date: "2026-09-27",
    title: "Academy glossary - searchable term ledger",
    verdict: "PASS",
    commit: "059b811",
    scope: [
      "Route /academy/glossary - server-side search (220ms debounce) across term, simple reading, professional reading and related concepts; fold-open rows reveal the professional definition, example and related chips; count + honest empty state.",
      "Glossary tab (List) joins the Academy fold.",
    ],
    checks:
      "tsc 0, eslint 0 · Desktop 1440: 54 terms, search 'liquidity' → 4, expand shows Professional + Example + Related · Mobile 390 sw=iw · console 0 errors.",
    evidence: ["apps/web/scripts/shots/t39/ (3 PNG)"],
  },
  {
    pass: "t40",
    date: "2026-09-27",
    title: "Academy practice - pattern drills + candle simulator",
    verdict: "PASS",
    commit: "6831a3a",
    scope: [
      "Route /academy/practice - (1) Identify the pattern: 5 exercises over the shared CandleSvg engine with announced context, 4 options, inline colored verdict + teaching explanation, local drill score; (2) Candle simulator: OHLC sliders + shape presets (Doji/Hammer/Shooting star/Marubozu) rendering a live candle with automatic anatomy reading (doji / rejection wicks / marubozu / ordinary).",
      "Honest framing: 'Grading stays with the course quizzes - this room is for repetitions.' Practice tab (Dumbbell) completes the Academy fold: Overview / Courses / Progress / Practice / Glossary.",
    ],
    checks:
      "tsc 0, eslint 0 · Desktop 1440 dark+light: drill verdict 'Correct - …' with score 1/1, simulator presets update candle + read ('Marubozu - conviction'); slider drag verified via state path (preset wiring identical; synthetic test-event artifact documented) · Mobile 390 sw=iw · console 0 errors. Dev server crash mid-pass - restarted detached (setsid).",
    evidence: ["apps/web/scripts/shots/t40/ (3 PNG)"],
    notes: "The Academy's five internal tabs are all live: the LMS spine is complete. Bookmarks (optional §33) are the known deferred piece - the progress store can carry them without schema churn.",
  },
];

for (const rec of records) {
  const lines = [];
  lines.push(`# Audit record - ${rec.pass}: ${rec.title}`);
  lines.push("");
  lines.push(`- **Date**: ${rec.date}`);
  lines.push(`- **Verdict**: ${rec.verdict}`);
  lines.push(`- **Commit**: \`${rec.commit}\``);
  lines.push("");
  lines.push("## Scope");
  for (const s of rec.scope) lines.push(`- ${s}`);
  if (rec.fixes?.length) {
    lines.push("");
    lines.push("## Fixes found during the pass");
    for (const f of rec.fixes) lines.push(`- ${f}`);
  }
  lines.push("");
  lines.push("## Ritual results");
  lines.push(rec.checks);
  lines.push("");
  lines.push("## Evidence");
  for (const e of rec.evidence) lines.push(`- \`${e}\``);
  if (rec.notes) {
    lines.push("");
    lines.push("## Notes");
    lines.push(rec.notes);
  }
  lines.push("");
  const file = join(outDir, `${rec.pass}-${slug(rec.title)}.md`);
  writeFileSync(file, lines.join("\n"), "utf8");
  console.log("wrote", file);
}

function slug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .slice(0, 5)
    .join("-");
}
console.log("done:", records.length, "records");
