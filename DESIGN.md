---
version: 1.0.0
name: COSMOZ — Le Registre
description: >
  Design system of the COSMOZ trading journal. World: the trader's official
  record — ink palettes, hairline ruling, one cobalt accent, rubber-stamp
  outcome marks. Mode: Operate. Adopted 2026-09 (design refonte).
---

# COSMOZ — Le Registre

## Brand & posture
COSMOZ is the book of record for a single operator. The interface is a
regulated ledger, not a neon cockpit: emphasis comes from ink, ruling and
stamps — never from hue, glow or glass. Calm, stoic, exact. Gamify the
process, never the P&L.

## Principles
1. **Ruling over cards** — sections separate by hairline rules; the page is a
   document, not a stack of boxes. Nested cards are forbidden.
2. **One accent** — cobalt is reserved for interaction (primary actions,
   links, focus, OPEN marks). Semantic inks (profit emerald, loss carmine,
   warning ochre) are stamp pads: small, deliberate, sparing.
3. **One colored numeral** — per table row or cell cluster, exactly one value
   carries semantic color; everything else stays ink.
4. **No glow, no glass, no gradient text** — depth is tonal steps + hairlines;
   modals may use a soft offset shadow.
5. **Data is mono, always tabular** — JetBrains Mono for every compared
   number; labels in mono caps are annotations, not kickers.
6. **Outcomes get stamped** — `.stamp` marks (bordered uppercase mono, ±2°
   rotation) for OPEN/WIN/LOSS/BREACH; pills without semantics are muted text.

## Colors (3 themes, keys are load-bearing: dark-blue is the default)
| Token | dark-blue « Encre » | dark « Carbone » | light « Papier » |
|---|---|---|---|
| --background | #0E1116 | #0B0B0D | #F5F4F0 |
| --surface | #141920 | #131316 | #FDFCF9 |
| --surface-raised | #1A2029 | #191A1E | #EEEDE7 |
| --border | #262E3A | #28292E | #D9D6CD |
| --text-primary | #E9ECEF | #EDEDEF | #1B1C1E |
| --text-muted | #99A2AD | #9BA0A8 | #5F646C |
| --accent | #4E6EE0 | #5578E6 | #2E4FC4 |
| --accent-hover | #6280EA | #6B8AEC | #2744AF |
| --profit | #3EBE8C | #41C393 | #12805C |
| --loss | #E05B5B | #E26363 | #C03E3E |
| --warning | #D9A03F | #DCA748 | #8F6418 |
| --ring | = accent | = accent | = accent |

Rules: zero hardcoded hex in `.tsx` (all color via tokens; chart canvas reads
`getChartTheme()`). Authorized exceptions: `--color-primary-foreground`
(#FFFFFF), `viewport.themeColor` (metadata-only), `.theme-dot-*` swatches.
Selection/caret/scrollbar/focus are themed from tokens.

## Typography
- Display/headings: **Schibsted Grotesk** (`--font-heading`), 600–700,
  tracking -0.01/-0.02em. Never as body.
- Text/UI: **Inter** (`--font-sans`), 400/500.
- Data/annotations: **JetBrains Mono** (`--font-mono`) with `tabular-nums`;
  `.ledger-label` = 11px mono, +0.06em, uppercase, muted.
- Scale: 11 · 12 · 14 (body) · 16 · 20–24 (KPI) · 26–32 (page titles).

## Space, radius, elevation
- 4/8px rhythm; density dial 8px (dashboard-grade); page max-w-7xl.
- Radius scale from `--radius: 8px`: sm 4 (stamps, kbd) · md 6 (inputs) ·
  lg 8 (buttons, nav) · xl 10 (cards, panels).
- Elevation: L0 canvas → L1 surface + 1px border → L2 raised → overlays with
  `0 8px 24px -4px rgba(0,0,0,.5)` (dark) / token border (light). Hover lift
  is a fill change, not a shadow flood.

## Primitives (globals.css)
- `.stat-strip` / `.stat-cell` — one ruled KPI band; hairline dividers;
  2-col mobile grid. Never split back into sibling cards.
- `.ledger-label` — mono annotation label.
- `.stamp` (+ `-win/-loss/-warn/-ink/-accent`) — rubber-stamp outcome marks;
  rotate ±2° inline for the struck-by-hand feel.
- `.chart-paper` — 24px token-hairline grid for chart panels.
- `.rule-double` — accounting double rule under totals.
- `.reveal-stagger` + `.animate-reveal-*` — one authored entrance per page
  (fade + 8px rise, 40ms stagger, cubic-bezier(0.16,1,0.3,1), ≤500ms) with a
  full `prefers-reduced-motion` kill.

## Components
- **Nav**: sidebar active = inverted ink block (`bg-foreground
  text-background`); mobile bottom-nav active = ink + 2px underline filet.
  Accent stays exclusive to the "New Trade" primary.
- **Topbar**: solid `bg-background`, hairline bottom rule, no blur.
- **Tables**: header = mono caps on surface; row hairlines; numerals right +
  mono; hover = faint fill. R/grade columns are ink; only P&L colored.
- **Grades**: bordered ink letters (A/B ink, C muted, D/F warning).
- **Buttons**: default = cobalt fill; outline = hairline; ghost; destructive
  = loss tint. Press = 0.98 scale (button primitive).
- **Charts**: token-driven (`getChartTheme`); solid hairline gridlines;
  no shadowBlur; drawdown zones = loss at 10% alpha.
- **Icon tiles above headings: forbidden.** Icons are lucide, 1.5px stroke,
  never emoji/unicode glyphs.

## Anti-pattern register (from the 2026 audit)
Sparkline wallpaper on every KPI · pill-noise status chrome · colored
left-edge card bars · glow shadows on lines/points · glass topbars ·
red/green on every numeral · cards-in-cards.
