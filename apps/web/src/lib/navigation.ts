import {
  BookOpen,
  CalendarDays,
  CalendarRange,
  ChartColumn,
  ChartCandlestick,
  Cable,
  FileScan,
  GraduationCap,
  HeartPulse,
  House,
  Landmark,
  LayoutDashboard,
  List,
  LockKeyhole,
  NotebookPen,
  NotebookText,
  Scale,
  Settings,
  ShieldCheck,
  SquareKanban,
  Target,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** One-sentence description used by the page headers and metadata. */
  description: string;
};

/** Main sidebar navigation — grouped by NAV_SECTIONS below. */
export const SIDEBAR_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
    description:
      "Your trading command center: today's P&L, your discipline score and the sessions that matter, at a glance.",
  },
  {
    href: "/trades",
    label: "Trades",
    icon: List,
    description:
      "The complete trade log: every execution with its result and decision grade, side by side.",
  },
  {
    href: "/oryon",
    label: "Oryon",
    icon: ChartCandlestick,
    description:
      "The full-screen charting workspace: live candles, honest feed states and room for the drawing tools of the next phases.",
  },
  {
    href: "/journal",
    label: "Trade Review",
    icon: NotebookPen,
    description:
      "Review every executed trade and hold your goals against reality: plan vs. actual, execution grades and the lesson you keep.",
  },
  {
    href: "/accounts",
    label: "Accounts",
    icon: Landmark,
    description:
      "Your connected trading accounts: balances, positions and history read from the provider — read-only, synced on demand, never traded through.",
  },
  {
    href: "/playbook",
    label: "Playbook",
    icon: BookOpen,
    description:
      "Define the setups you are allowed to trade and the rules that protect you from yourself.",
  },
  {
    href: "/analytics",
    label: "Analytics",
    icon: ChartColumn,
    description:
      "Turn your trade history into patterns, edges and honest statistics.",
  },
  {
    href: "/recognition",
    label: "Recognition",
    icon: FileScan,
    description:
      "Import a trading screenshot, review what the engine recognized — every field carries its confidence — and confirm what enters the journal.",
  },
  {
    href: "/calendar",
    label: "Calendar",
    icon: CalendarDays,
    description:
      "See your month at a glance: trading days, big wins, rule violations and rest days.",
  },
  {
    href: "/discipline",
    label: "Discipline",
    icon: ShieldCheck,
    description:
      "The coach that watches your rules: limits, streaks, violations and mindset.",
  },
  {
    href: "/academy",
    label: "Academy",
    icon: GraduationCap,
    description:
      "The learning hub: structured courses, drills, quizzes and a searchable glossary — from market fundamentals to advanced execution.",
  },
  {
    href: "/nofy",
    label: "Nofy",
    icon: NotebookText,
    description:
      "Your personal trading knowledge workspace: notes, ideas, research and documentation — connected to your trades, strategies and lessons.",
  },
  {
    href: "/events",
    label: "Events",
    icon: CalendarRange,
    description:
      "Your trading calendar: sessions, economic events and personal deadlines across the calendars you define — drag, filter and plan month by month.",
  },
  {
    href: "/tasky",
    label: "Tasky",
    icon: SquareKanban,
    description:
      "Your trading kanban: plan the work around your edge — studies, routines, reviews — and drag each card from backlog to done.",
  },
  {
    href: "/tools/lot-size",
    label: "Lot",
    icon: Scale,
    description:
      "Size positions from your risk budget: balance, risk %, entry, stop and the instrument's specifications — with the full calculation breakdown.",
  },
  {
    href: "/tools/compounding",
    label: "Interest",
    icon: TrendingUp,
    description:
      "Project account growth across compounding periods — period by period, with the full schedule and growth curve.",
  },
  {
    href: "/tools/risk-reward",
    label: "Risk Reward",
    icon: Target,
    description:
      "The expectancy workspace: risk % or fixed risk, reward multiples and the color-coded win rate cheat sheet — every cell shows the exact theoretical outcome.",
  },
  {
    href: "/monitoring",
    label: "Monitoring",
    icon: HeartPulse,
    description:
      "System health at a glance: market feed, API status and offline readiness.",
  },
  {
    href: "/integrations",
    label: "Integrations",
    icon: Cable,
    description:
      "Connect your brokers and data providers — Deriv, MT5, cTrader, Binance.",
  },
  {
    href: "/security",
    label: "Security",
    icon: LockKeyhole,
    description:
      "Protection center: 2FA, sessions, API keys, connected accounts and the audit trail.",
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    description:
      "Tune Euforia to your accounts, timezone, risk defaults and display preferences.",
  },
];

/**
 * Desktop sidebar order: Accounts pinned at the very top (brought above
 * Dashboard, with a subtle separator below it), then Dashboard, then the
 * sectioned navigation.
 */
export const SIDEBAR_ACCOUNTS_FIRST = getNavItem("/accounts");
export const SIDEBAR_FIRST_ITEM = SIDEBAR_ITEMS[0];
export const SIDEBAR_REST_ITEMS = SIDEBAR_ITEMS.slice(1);

/**
 * Sidebar SECTIONS — the navigation is grouped, with the SYSTEM section
 * regrouping the platform surfaces (Monitoring, Settings, Integrations,
 * Security) apart from the trading/journal surfaces.
 */
export type NavSection = {
  title: string;
  /** Hrefs in display order — resolved against SIDEBAR_ITEMS. */
  hrefs: string[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    // /accounts is NOT here anymore — it is pinned at the very top of the
    // sidebar (above Dashboard) as SIDEBAR_ACCOUNTS_FIRST with a subtle
    // separator; keeping it in this section would render it twice.
    title: "Trading",
    hrefs: ["/trades", "/oryon", "/journal", "/playbook"],
  },
  // Goals lives inside Trade Review (/journal?tab=goals) — /goals redirects there.
  {
    title: "Insights",
    hrefs: ["/analytics", "/recognition", "/calendar", "/discipline"],
  },
  {
    title: "Academy",
    hrefs: ["/academy", "/nofy", "/events", "/tasky"],
  },
  {
    title: "Tools",
    hrefs: ["/tools/lot-size", "/tools/compounding", "/tools/risk-reward"],
  },
  {
    title: "System",
    hrefs: ["/monitoring", "/settings", "/integrations", "/security"],
  },
];

/** Flat, ordered list of every sectioned href (after the Dashboard entry). */
export const SECTIONED_HREFS: string[] = NAV_SECTIONS.flatMap(
  (section) => section.hrefs,
);

/** Bottom navigation bar (mobile only): Home, Trades, [+ FAB], Playbook, Stats. */
export type BottomNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const BOTTOM_NAV_ITEMS: BottomNavItem[] = [
  { href: "/", label: "Home", icon: House },
  { href: "/trades", label: "Trades", icon: List },
  { href: "/playbook", label: "Playbook", icon: BookOpen },
  { href: "/analytics", label: "Stats", icon: ChartColumn },
];

/** Resolves the current page title from the pathname. */
export function getPageTitle(pathname: string): string {
  const match = SIDEBAR_ITEMS.find((item) => item.href === pathname);
  if (match) return match.label;
  if (pathname === "/profile") return "Profile";
  if (pathname === "/login") return "Sign in";
  if (pathname === "/register") return "Create account";
  return "Euforia";
}

/**
 * Breadcrumb trail for the topbar: the app root first, then the active page.
 * Unknown paths collapse to a single "Euforia" crumb (no dead ends).
 */
export function getBreadcrumb(pathname: string): { href: string; label: string }[] {
  const crumbs: { href: string; label: string }[] = [
    { href: "/", label: "Euforia" },
  ];
  if (pathname !== "/") {
    crumbs.push({ href: pathname, label: getPageTitle(pathname) });
  }
  return crumbs;
}

/** Single source of truth for a screen's copy — throws on unknown href. */
export function getNavItem(href: string): NavItem {
  const item = SIDEBAR_ITEMS.find((nav) => nav.href === href);
  if (!item) {
    throw new Error(`Unknown nav item href: ${href}`);
  }
  return item;
}
