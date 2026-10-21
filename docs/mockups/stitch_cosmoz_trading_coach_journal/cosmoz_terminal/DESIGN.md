---
name: Cosmoz Terminal
colors:
  surface: '#0c1321'
  surface-dim: '#0c1321'
  surface-bright: '#323949'
  surface-container-lowest: '#070e1c'
  surface-container-low: '#151b2a'
  surface-container: '#19202e'
  surface-container-high: '#232a39'
  surface-container-highest: '#2e3544'
  on-surface: '#dce2f6'
  on-surface-variant: '#c6c5d6'
  inverse-surface: '#dce2f6'
  inverse-on-surface: '#2a3040'
  outline: '#8f8fa0'
  outline-variant: '#454654'
  surface-tint: '#bdc2ff'
  primary: '#bdc2ff'
  on-primary: '#000fa3'
  primary-container: '#7985ff'
  on-primary-container: '#000c90'
  inverse-primary: '#424ed2'
  secondary: '#45dfa4'
  on-secondary: '#003825'
  secondary-container: '#00bd85'
  on-secondary-container: '#00452e'
  tertiary: '#ffb3b0'
  on-tertiary: '#670211'
  tertiary-container: '#ea6767'
  on-tertiary-container: '#5b000d'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e0e0ff'
  primary-fixed-dim: '#bdc2ff'
  on-primary-fixed: '#000668'
  on-primary-fixed-variant: '#2632b9'
  secondary-fixed: '#68fcbf'
  secondary-fixed-dim: '#45dfa4'
  on-secondary-fixed: '#002114'
  on-secondary-fixed-variant: '#005137'
  tertiary-fixed: '#ffdad8'
  tertiary-fixed-dim: '#ffb3b0'
  on-tertiary-fixed: '#410006'
  on-tertiary-fixed-variant: '#881d24'
  background: '#0c1321'
  on-background: '#dce2f6'
  surface-variant: '#2e3544'
typography:
  display:
    fontFamily: Space Grotesk
    fontSize: 44px
    fontWeight: '700'
    lineHeight: 52px
    letterSpacing: -0.03em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Space Grotesk
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  data-lg:
    fontFamily: JetBrains Mono
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.02em
  data-md:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 18px
  data-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1.25rem
  gutter-mobile: 0.75rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style
The design system targets dedicated, analytical retail traders who demand disciplined execution across Forex, Crypto, and Synthetic markets. It fuses the analytical density of an institutional trading terminal with the refined, tactile minimalism of high-end consumer hardware.

The emotional posture is one of calm, stoic authority. The interface suppresses panic and cognitive friction through deep, oceanic dark surfaces, razor-sharp typographic hierarchy, and precise glowing accents that guide focus to actionable performance metrics and behavioral patterns.

Visually, the style combines modern fintech minimalism with a subtle celestial motif: structured 1px deep-slate borders, delicate luminescent gradients, and crystalline data surfaces that give metrics an ambient, starry luminescence without compromising clinical clarity.

## Colors
The palette is built strictly for prolonged exposure during volatile market sessions, anchoring the interface in deep cosmic navy rather than pure pitch black.

- **Canvas & Surfaces:**
  - Base canvas: `#0B1220` (deep space navy)
  - Default card/container surface: `#121B2E`
  - Elevated & floating surfaces (modals, tooltips, active rows): `#1A2640`
  - Hairline structural borders: `#243352`
- **Brand Accents:**
  - Electric Indigo (`#6E7BFF`): Primary interactive focus, focus rings, active tab pills, brand marks, and high-priority CTAs.
- **Typography & Content:**
  - Primary text: `#E6EBF5` (crisp ice white)
  - Muted / secondary text: `#8794AD` (subdued slate blue)
  - Tertiary / disabled: `#4A5873`
- **Market Semantics:**
  - Profit / Alpha (`#34D399`): Emerald green, applied to positive R-multiples, winning strike rates, and long positions.
  - Loss / Drawdown (`#F87171`): Crimson coral red, indicating stop-outs, negative expectancy, and risk breaches.
  - Warning / Alert (`#FBBF24`): Amber yellow, signaling rule deviations, over-leveraging, or tilt warnings.

All semantic states use subdued alpha fills (e.g., `rgba(52, 211, 153, 0.12)`) paired with solid foreground text to preserve contrast and reduce visual fatigue.

## Typography
The typographic hierarchy establishes a rigorous distinction between narrative headings, operational UI text, and financial analytics.

- **Headlines (Space Grotesk):** Provides architectural character and a sharp, futuristic edge to dashboards, section headers, and modal titles.
- **Body & Controls (Inter):** Ensures legibility across dense journals, psychological trade notes, tooltips, and system controls.
- **Financial Data & Metrics (JetBrains Mono):** Monospaced alignment enforces tabular scanning for currency values, P&L percentages, trade sizes, pip calculations, and timestamps. Tabular figures prevent layout jumping during live price feeds.

## Layout & Spacing
The layout follows a fluid 12-column grid designed for dense information architecture that avoids visual clutter.

- **Desktop (>= 1280px):** 12 columns, 20px gutters, and 32px canvas margins. Allows multi-pane layouts: sidebar navigation, analytical feed, journal entries, and contextual coaching sidecars side-by-side.
- **Tablet (768px - 1279px):** 8 columns, 16px gutters, and 24px canvas margins. Collapses secondary sidebars into slide-over panels or unified tabs.
- **Mobile (< 768px):** 4 columns, 12px gutters, and 16px margins. Stacks grid widgets into full-width sequential cards with horizontal scrolling for dense data tables.

Internal component layouts maintain an 8pt spatial cadence. High-density metrics containers use `space-sm` and `space-md` gaps, while section dividers and primary layout panels leverage `space-lg` and `space-xl` to create clear conceptual boundaries.

## Elevation & Depth
Visual hierarchy relies on structural hairline borders, subtle tonal layering, and controlled luminescent glows rather than heavy blurred drop shadows.

- **Surface Levels:**
  - `Level 0 (Canvas)`: Flat `#0B1220`.
  - `Level 1 (Card & Module)`: `#121B2E` surface encased in a crisp `1px solid #243352` border.
  - `Level 2 (Raised Controls & Dropdowns)`: `#1A2640` with `1px solid #33466D` border and an ambient shadow: `0 8px 24px -4px rgba(5, 9, 16, 0.6)`.
  - `Level 3 (Modals & Command Center)`: `#16223B` with `1px solid #6E7BFF` at 30% alpha, cast against a dimmed background backdrop blur of `12px`.
- **Cosmic Glow Accent:**
  - Interactive highlights and active state cards emit an ethereal, tight outer radiance: `0 0 20px -2px rgba(110, 123, 255, 0.25)`.
  - Semantic trade outcomes leverage localized glow tokens: `0 0 16px -4px rgba(52, 211, 153, 0.25)` for high-R wins and `0 0 16px -4px rgba(248, 113, 113, 0.25)` for stop breaches.

## Shapes
The design system embraces a calibrated, architectural shape philosophy. Components balance technical discipline with organic balance through soft, engineered radii.

- Standard cards, module containers, and dialogs utilize an exact 12px corner radius (`rounded-xl` / `0.75rem`), conveying an Apple-level device finish.
- Inputs, badges, small buttons, and data cells use a 6px to 8px radius (`0.375rem` to `0.5rem`) to maintain compact density.
- Circular chips and pill capsules (`9999px`) are strictly reserved for trade direction indicators (e.g., `LONG`, `SHORT`), status tags, and psychological emotion labels.

## Components

### Buttons & Interactive Triggers
- **Primary:** Background `#6E7BFF`, text `#FFFFFF`, font `Inter` Medium (14px). Hover produces a subtle upward gradient shift to `#808CFF` and an outer glow `0 0 16px rgba(110, 123, 255, 0.4)`.
- **Secondary / Ghost:** Background `transparent`, border `1px solid #243352`, text `#E6EBF5`. Hover sets background to `rgba(26, 38, 64, 0.6)` and border to `#6E7BFF`.
- **Destructive:** Background `rgba(248, 113, 113, 0.1)`, border `1px solid rgba(248, 113, 113, 0.3)`, text `#F87171`. Hover transitions to solid `#F87171` with `#0B1220` text.

### Cards & Analytical Containers
- Built with `#121B2E` background, 12px border-radius, and a continuous `1px solid #243352` edge.
- Padding sits comfortably at 20px to 24px.
- Subtle diagonal linear gradient top-to-bottom: `linear-gradient(180deg, rgba(26, 38, 64, 0.4) 0%, rgba(18, 27, 46, 1) 100%)` to replicate frosted hardware surfaces.

### Badges, Chips & Trade Tags
- Compact dimensions (20px to 24px height), `Inter` SemiBold (11px or 12px).
- **Long Tag:** Emerald alpha fill `rgba(52, 211, 153, 0.12)`, text `#34D399`, border `1px solid rgba(52, 211, 153, 0.25)`.
- **Short Tag:** Coral alpha fill `rgba(248, 113, 113, 0.12)`, text `#F87171`, border `1px solid rgba(248, 113, 113, 0.25)`.
- **Behavioral/Mindset Tag (e.g., FOMO, Disciplined):** Deep indigo fill `rgba(110, 123, 255, 0.1)`, text `#6E7BFF`, border `1px solid rgba(110, 123, 255, 0.25)`.

### Form Controls & Inputs
- Height 40px, background `#0F1728`, border `1px solid #243352`, text `#E6EBF5`, placeholder `#8794AD`.
- Numeric inputs automatically switch font to `JetBrains Mono`.
- Active focus state: border shifts to `#6E7BFF` with a 2px outer ring glow: `0 0 0 2px rgba(110, 123, 255, 0.2)`.

### Checkboxes & Segmented Toggles
- Checkboxes: 18x18px squares with a 4px corner radius. Unchecked state uses `#0F1728` with `#243352` border; checked state fills with `#6E7BFF` and a white check icon.
- Segmented time-horizon switches (e.g., `1D`, `1W`, `1M`, `ALL`): Housed in an inset `#0B1220` track with a sliding `#1A2640` active tab bounded by a subtle `1px solid #243352` border.

### Behavioral Coaching & Performance Panels
- **Tilt / Risk Breached Alert:** Container with `#121B2E` base, overlaid with a left-edge 3px solid accent bar in `#FBBF24` or `#F87171`. Background incorporates a 5% radial wash in the alert tone.
- **Constellation Journal Grid:** Tabular trade list utilizing `JetBrains Mono` for lot sizes, entry/exit prices, and Net P&L. Alternating subtle row hover `rgba(110, 123, 255, 0.04)` to ensure scanning precision across high-volume trade logs.