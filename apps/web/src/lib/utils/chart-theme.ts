import { getThemeToken } from "./theme";

/**
 * Chart-facing view of the active theme (design-tokens.md §8). Canvas engines
 * (ECharts) cannot resolve CSS variables, so options call this at option-build
 * time and components rebuild their options when useTheme().resolvedTheme
 * changes. NEVER hardcode a hex in chart code - read tokens here.
 */
export interface ChartTheme {
  background: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  textPrimary: string;
  textMuted: string;
  accent: string;
  profit: string;
  loss: string;
  warning: string;
  /** Resolved next/font family stacks for canvas text (defined on <body>). */
  monoFont: string;
  headingFont: string;
  /**
   * Categorical palette for indicator series (design-tokens.md - chart code
   * never hardcodes hex; indicators cycle through these resolved tokens).
   */
  indicatorPalette: readonly string[];
}

/** Font CSS variables live on <body> (next/font className), not on <html>. */
function bodyVar(name: string): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.body).getPropertyValue(name).trim();
}

export function getChartTheme(): ChartTheme {
  return {
    background: getThemeToken("--background"),
    surface: getThemeToken("--surface"),
    surfaceRaised: getThemeToken("--surface-raised"),
    border: getThemeToken("--border"),
    textPrimary: getThemeToken("--text-primary"),
    textMuted: getThemeToken("--text-muted"),
    accent: getThemeToken("--accent"),
    profit: getThemeToken("--profit"),
    loss: getThemeToken("--loss"),
    warning: getThemeToken("--warning"),
    monoFont: `${bodyVar("--font-jetbrains-mono")}, monospace`,
    headingFont: `${bodyVar("--font-schibsted")}, sans-serif`,
    indicatorPalette: [
      getThemeToken("--cat-ta"),
      getThemeToken("--cat-strategies"),
      getThemeToken("--warning"),
      getThemeToken("--cat-patterns"),
      getThemeToken("--cat-pa"),
      getThemeToken("--cat-indicators"),
      getThemeToken("--cat-mgmt"),
    ],
  };
}
