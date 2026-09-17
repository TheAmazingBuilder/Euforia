1. Visual identity
Premium fintech, calm authority, dark-first. Signature motif: the "constellation"(equity curve data points as small glowing stars connected by a thin luminousline) — subtle, never kitsch. Apple polish, not Bloomberg clutter.

2. Themes
Three themes. Default: dark-blue (deep navy, IDE-inspired).Switching: data-theme attribute on <html>, persisted by next-themes.

Token	dark-blue (default)	dark	light
--background	#0B1220	#09090B	#F6F8FC
--surface	#121B2E	#131316	#FFFFFF
--surface-raised	#1A2640	#1B1B20	#F0F3F9
--border	#243352	#27272E	#E2E7F0
--text-primary	#E6EBF5	#FAFAFA	#101828
--text-muted	#8794AD	#A1A1AA	#5A6474
--accent	#6E7BFF	#6E7BFF	#5A4FD8
--accent-hover	#8590FF	#8590FF	#4C42BF
--profit	#34D399	#34D399	#0C9B6C
--loss	#F87171	#F87171	#DC2F44
--warning	#FBBF24	#FBBF24	#B45309
--ring	#6E7BFF	#6E7BFF	#5A4FD8
Notes:

Profit green / loss red are P&L semantics ONLY — never for CTAs, UIaccents or generic errors.
Light-mode profit/loss are darkened variants to keep AA contrast on white.
All text must remain readable (AA minimum) on all 3 backgrounds.
3. Typography
Role	Font	Usage
Headings	Space Grotesk	Page titles, decision grades, hero numbers
UI / body	Inter	Labels, paragraphs, buttons
Numbers	JetBrains Mono (tabular)	ALL numeric and financial data
Loaded via next/font/google as CSS variables, wired in the root layout.

4. Canonical utility classes
Class	Use
bg-background	page background
bg-surface / bg-surface-raised	cards, panels, nested surfaces
border-border	all borders (prefer borders over shadows)
text-foreground / text-muted-foreground	text hierarchy
bg-accent / text-accent	CTAs, active nav, links
text-profit / text-loss	P&L values ONLY
text-warning	amber warnings, near-limit discipline states
font-heading / font-sans / font-mono	typography roles
5. apps/web/src/app/globals.css (verbatim, Tailwind v4)
@import "tailwindcss";/* Makes shadcn/ui `dark:` variants work on BOTH dark themes.   Without this, all shadcn components break on theme switch. */@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *,  [data-theme="dark-blue"], [data-theme="dark-blue"] *));/* ---- Theme: dark-blue (DEFAULT) ---- */:root,[data-theme="dark-blue"] {  --background: #0B1220;  --surface: #121B2E;  --surface-raised: #1A2640;  --border: #243352;  --text-primary: #E6EBF5;  --text-muted: #8794AD;  --accent: #6E7BFF;  --accent-hover: #8590FF;  --profit: #34D399;  --loss: #F87171;  --warning: #FBBF24;  --ring: #6E7BFF;  --radius: 12px;}/* ---- Theme: dark ---- */[data-theme="dark"] {  --background: #09090B;  --surface: #131316;  --surface-raised: #1B1B20;  --border: #27272E;  --text-primary: #FAFAFA;  --text-muted: #A1A1AA;  --accent: #6E7BFF;  --accent-hover: #8590FF;  --profit: #34D399;  --loss: #F87171;  --warning: #FBBF24;  --ring: #6E7BFF;  --radius: 12px;}/* ---- Theme: light ---- */[data-theme="light"] {  --background: #F6F8FC;  --surface: #FFFFFF;  --surface-raised: #F0F3F9;  --border: #E2E7F0;  --text-primary: #101828;  --text-muted: #5A6474;  --accent: #5A4FD8;  --accent-hover: #4C42BF;  --profit: #0C9B6C;  --loss: #DC2F44;  --warning: #B45309;  --ring: #5A4FD8;  --radius: 12px;}/* ---- Tailwind v4 token mapping ---- */@theme inline {  --color-background: var(--background);  --color-surface: var(--surface);  --color-surface-raised: var(--surface-raised);  --color-border: var(--border);  --color-foreground: var(--text-primary);  --color-muted: var(--surface-raised);  --color-muted-foreground: var(--text-muted);  --color-accent: var(--accent);  --color-profit: var(--profit);  --color-loss: var(--loss);  --color-warning: var(--warning);  --color-primary: var(--accent);  --color-destructive: var(--loss);  --color-ring: var(--ring);  /* shadcn/ui compatibility aliases */  --color-card: var(--surface);  --color-card-foreground: var(--text-primary);  --color-popover: var(--surface);  --color-popover-foreground: var(--text-primary);  --color-secondary: var(--surface-raised);  --color-secondary-foreground: var(--text-primary);  --color-accent-foreground: var(--text-primary);  --color-input: var(--border);  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;  --font-heading: var(--font-space-grotesk), var(--font-inter), sans-serif;  --font-mono: var(--font-jetbrains-mono), ui-monospace, monospace;  --radius-sm: calc(var(--radius) - 4px);  --radius-md: calc(var(--radius) - 2px);  --radius-lg: var(--radius);  --radius-xl: calc(var(--radius) + 4px);}@layer base {  * {    border-color: var(--border);  }  body {    background-color: var(--background);    color: var(--text-primary);  }}
6. ThemeProvider
// components/layout/theme-provider.tsx"use client";import { ThemeProvider as NextThemesProvider } from "next-themes";export function ThemeProvider({ children }: { children: React.ReactNode }) {  return (    <NextThemesProvider      attribute="data-theme"      defaultTheme="dark-blue"      themes={["dark-blue", "dark", "light"]}      enableSystem={false}      disableTransitionOnChange    >      {children}    </NextThemesProvider>  );}
7. Root layout (fonts)
// app/layout.tsximport { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";import { ThemeProvider } from "@/components/layout/theme-provider";const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });const grotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk" });const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono" });export default function RootLayout({ children }: { children: React.ReactNode }) {  return (    <html lang="fr" suppressHydrationWarning>      <body className={`${inter.variable} ${grotesk.variable} ${mono.variable} font-sans antialiased`}>        <ThemeProvider>{children}</ThemeProvider>      </body>    </html>  );}
8. Chart theming
Charts (ECharts, Lightweight Charts) NEVER hardcode hex. They read tokens atrender time via:

// lib/utils/theme.tsexport function getThemeToken(token: string): string {  if (typeof window === "undefined") return "";  return getComputedStyle(document.documentElement).getPropertyValue(token).trim();}// e.g. getThemeToken("--profit")
Charts must re-render when the theme changes (subscribe touseTheme().resolvedTheme and include it in render dependencies).

9. Hard rules (grep-enforced)
Zero hardcoded hex outside globals.css.
Profit/loss colors = P&L semantics only.
All numbers render font-mono with tabular figures.
Focus rings use --ring.
Light mode: dark trading screenshots must sit in a dedicated framedcontainer (they would look like black patches otherwise).