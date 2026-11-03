---
version: 2.0.0
name: Euforia — Trading Journal
description: >
  Current design-system guidance for Euforia's trading journal and review
  workspace. Use semantic tokens and disciplined data presentation.
---

# Euforia — Design system

## Brand and posture

Euforia is a trading journal and behavioral-review product. The interface is a professional trading ledger: precise, restrained and information-dense. It is not a broker terminal or a neon trading cockpit.

## Principles

1. Prefer clear hierarchy and hairline dividers over deeply nested cards.
2. Use the accent color for interaction, focus and selection; keep profit/loss colors semantic.
3. Do not color every metric. Reserve green/red for financial outcome or explicit BUY/SELL semantics.
4. Use tonal surfaces and borders for depth; avoid glow, glass and decorative gradient text.
5. Render prices, ratios, timestamps and comparable values in mono/tabular numerals.
6. Use concise, meaningful status indicators. Never imply that simulated or stale information is live.

## Themes

The visible switch exposes the following themes. Keep CSS tokens and chart tokens aligned.

| Theme | Background | Surface | Accent |
|---|---:|---:|---:|
| dark (default) | `#000000` | `#141414` | `#8B5CF6` |
| midnight | `#0d1117` | `#161b22` | `#2975ed` |
| light | `#FFFFFF` | `#F2F2F2` | `#6D28D9` |

The `euforia` brand theme remains in the provider for compatibility. The switch currently presents dark, midnight and light.

Use `apps/web/src/app/globals.css` as the token source of truth. TSX should use semantic classes/tokens, not raw hex values. Chart canvas code must derive colors from the current theme tokens and respond to theme changes.

## Typography and data

- Interface: Inter.
- Headings: Schibsted Grotesk.
- Prices and comparable numeric values: JetBrains Mono with tabular numerals.
- Keep units explicit (lots, contracts, stake, currency, time zone).
- Do not round values before calculations; use shared decimal/business helpers.

## Interaction and accessibility

- All controls need accessible labels, keyboard support and visible focus.
- Keep BUY green and SELL red, but do not use green/red for unrelated navigation or decoration.
- Success, edit/primary, warning and destructive actions must be visually distinct.
- Support compact screens without truncating key prices, symbols or trade identity.
- Tooltips supplement, but never replace, visible labels where clarity matters.

## Market-data honesty

- A raw symbol is a provider/database identity; its formatted label is presentation only.
- Distinguish catalogue entries from live-feed coverage.
- Do not show a chart as live unless the response includes real provenance.
- Stale, unavailable and simulated data require explicit states.
- Do not alias a spot instrument to a different futures contract.

## Avoid

Nested card stacks, decorative icon tiles above headings, excessive colored badges, glow, glass surfaces, fake sparklines, silent market-data fallbacks and unlabelled data provenance.
