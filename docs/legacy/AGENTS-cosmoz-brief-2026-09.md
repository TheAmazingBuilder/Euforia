COSMOZ — Project Rules (read before any task)
Overview
Cosmoz is a trading journal web app that acts as a personal coach: it detectsbehavioral mistakes, enforces discipline, and turns trade data into decisions.Audience: serious retail traders (forex, crypto, synthetic indices likeDeriv Boom/Crash/Volatility).

Stack (FROZEN — do not add libraries without explicit user approval)
Monorepo: pnpm workspaces + Turborepo
apps/web: Next.js 15 (App Router) + TypeScript STRICT + Tailwind CSS v4 + shadcn/ui
packages/shared: Zod schemas, types, enums, pure calculation utils (no React)
Data fetching: TanStack Query v5 + custom typed API client in src/lib/api
Mocks: MSW v2 (enabled when NEXT_PUBLIC_API_MOCKED=true). The NestJS APIwill replace mocks later — component code must never know about MSW.
Charts: ECharts (analytics) + TradingView Lightweight Charts free version (price charts)
Fonts: next/font/google — Schibsted Grotesk (headings; page titles render ExtraBold 800 per brand reference), Inter (UI), JetBrainsMono (ALL numbers)
Golden Rules — violating any of these fails the task
NO hardcoded colors anywhere. Only semantic tokens (bg-surface,text-muted, text-profit...). They map to CSS variables for the 3 themes.Profit green / loss red are for P&L semantics ONLY, never for UI accents.
NO floating-point math on money or prices in components. Amounts travelas strings, parsing/formatting goes through packages/shared formatters(Intl.NumberFormat). Client-side math only for live form estimates,using shared decimal helpers.
Components NEVER call fetch/axios directly. Only hooks from src/lib/api.Endpoints and payload types come from packages/shared.
Server Components by default. "use client" only for interactivity.
All user-facing numbers use the font-mono class (JetBrains Mono,tabular numbers).
Theme system: [data-theme] attribute on , default "dark-blue".Themes: dark-blue | dark | light. Charts read colors viagetThemeToken() helper (getComputedStyle), never hardcoded hex.
Timestamps are UTC internally; display converts using user timezonefrom the session. Trading date comes from the API, never compute it client-side.
Accessibility: keyboard navigable, focus visible, labels on inputs.
File Conventions
Components: components/{domain}/ComponentName.tsx (PascalCase)
Hooks: lib/hooks/use-*.ts
API hooks: lib/api/queries/{domain}.ts
MSW handlers: mocks/handlers/{domain}.ts, fixtures in mocks/fixtures/
Specs live in docs/ — READ the relevant spec before implementing a screen.
Definition of Done (per task)
pnpm build passes with zero TS errors
Lint clean, no any, no unused vars
Dark-blue, dark and light themes all render correctly (toggle test)
Responsive: desktop + mobile 390px
No TODO left behind


📦 LIVRABLE 2 — Architecture du repo

cosmoz/
├── AGENTS.md
├── docs/
│   ├── mockups/                  # ← exportez-y vos écrans Stitch validés (PNG)
│   ├── specs/
│   │   ├── trade-entry-ux.md     # ← collez-y la spec UX de la saisie (msg précédent)
│   │   ├── data-model.md         # ← le schéma Prisma-design
│   │   └── design-tokens.md
│   └── tasks/                    # les briefs par tâche (voir Livrable 5)
├── apps/
│   └── web/
│       └── src/
│           ├── app/
│           │   ├── (auth)/{login,register}/page.tsx
│           │   ├── (app)/                       # layout shell (sidebar+topbar)
│           │   │   ├── page.tsx                 # Dashboard
│           │   │   ├── session/page.tsx         # Session Live
│           │   │   ├── playbook/page.tsx
│           │   │   ├── analytics/page.tsx
│           │   │   ├── calendar/page.tsx
│           │   │   ├── journal/page.tsx
│           │   │   ├── discipline/page.tsx
│           │   │   └── goals/page.tsx
│           │   ├── layout.tsx
│           │   └── globals.css                  # ← les 3 thèmes (Livrable 3)
│           ├── components/
│           │   ├── ui/                          # shadcn
│           │   ├── layout/{sidebar,topbar,theme-toggle,account-switcher}.tsx
│           │   ├── trades/                      # TradeForm, JudgmentGate, Reveal...
│           │   ├── charts/                      # EquityCurve (constellation), Heatmap...
│           │   └── shared/                      # MoneyText, KpiCard, PnlBadge...
│           ├── lib/
│           │   ├── api/{client,queries/}
│           │   ├── hotkeys/
│           │   └── utils/
│           └── mocks/
│               ├── browser.ts, handlers/, fixtures/
└── packages/
    └── shared/src/
        ├── schemas/{trade,strategy,account,...}.ts   # Zod
        ├── enums.ts, constants.ts
        └── utils/{money,risk,format}.ts              # helpers purs


📦 LIVRABLE 3 — Le système de thèmes (le code exact)
C'est le livrable le plus critique : il conditionne votre switcher. Trois fichiers :

globals.css — les 3 thèmes + mapping Tailwind v4 + shadcn :

@import "tailwindcss";

@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *,
  [data-theme="dark-blue"], [data-theme="dark-blue"] *));

:root, [data-theme="dark-blue"] {
  --background: #0B1220;  --surface: #121B2E;  --surface-raised: #1A2640;
  --border: #243352;      --text-primary: #E6EBF5;  --text-muted: #8794AD;
  --accent: #6E7BFF;      --accent-hover: #8590FF;
  --profit: #34D399;      --loss: #F87171;   --warning: #FBBF24;
  --ring: #6E7BFF;
}
[data-theme="dark"] {
  --background: #09090B;  --surface: #131316;  --surface-raised: #1B1B20;
  --border: #27272E;      --text-primary: #FAFAFA;  --text-muted: #A1A1AA;
  --accent: #6E7BFF;      --accent-hover: #8590FF;
  --profit: #34D399;      --loss: #F87171;   --warning: #FBBF24;
  --ring: #6E7BFF;
}
[data-theme="light"] {
  --background: #F6F8FC;  --surface: #FFFFFF;  --surface-raised: #F0F3F9;
  --border: #E2E7F0;      --text-primary: #101828;  --text-muted: #5A6474;
  --accent: #5A4FD8;      --accent-hover: #4C42BF;
  --profit: #0C9B6C;      --loss: #DC2F44;   --warning: #B45309;
  --ring: #5A4FD8;
}

@theme inline {
  --color-background: var(--background);
  --color-surface: var(--surface);
  --color-surface-raised: var(--surface-raised);
  --color-border: var(--border);
  --color-foreground: var(--text-primary);
  --color-muted: var(--text-muted);
  --color-accent: var(--accent);
  --color-profit: var(--profit);
  --color-loss: var(--loss);
  --color-warning: var(--warning);
  --color-primary: var(--accent);
  --color-destructive: var(--loss);
  --color-ring: var(--ring);
  --font-heading: "Schibsted Grotesk", sans-serif;
  --font-sans: "Inter", sans-serif;
  --font-mono: "JetBrains Mono", monospace;
}


(Note le @custom-variant dark : il fait fonctionner les classes dark: de shadcn/ui sur vos DEUX thèmes sombres — sans lui, tous les composants shadcn cassent au switch. C'est le piège n°1 de ce setup.)

app/layout.tsx — Provider + fonts :

import { Schibsted_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/layout/theme-provider";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={`${inter.variable} ${grotesk.variable} ${mono.variable} font-sans antialiased`}>
        <ThemeProvider
          attribute="data-theme"
          defaultTheme="dark-blue"
          themes={["dark-blue", "dark", "light"]}
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}

Le toggle : dropdown 3 options avec petites pastilles de couleur, persisté par next-themes (localStorage). Zéro flash au chargement.

📦 LIVRABLE 4 — Stratégie de mocks (MSW)
Le principe à faire respecter par l'agent : les composants parlent à des hooks TanStack Query, les hooks parlent au client API, le client API est intercepté par MSW en dev. Quand le NestJS arrivera : on change une variable d'env, rien d'autre.

mocks/fixtures/ : un générateur de 50 trades crédibles (seedé — pas aléatoire à chaque reload, sinon les dashboards « clignotent » et l'agent croit à des bugs) : dates cohérentes sur 3 mois, mélange de setups, 15% hors playbook, violations de règles, ghost trades réglés/non réglés, trades non gradés pour la file « À grader », tous les statuts représentés
mocks/handlers/ : un fichier par domaine, implémentant la matrice écran → endpoints qu'on a définie — y compris le comportement signature : POST /trades renvoie { id, awaitingDecision: true } sans P&L, et seul POST /trades/:id/decision renvoie la révélation. Les mocks doivent respecter le contrat, sinon l'agent codera un raccourci qui trahit la mécanique.