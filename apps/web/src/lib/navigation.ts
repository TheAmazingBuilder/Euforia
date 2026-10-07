import {
  Activity,
  BookOpen,
  CalendarDays,
  ChartColumn,
  Cable,
  FileScan,
  GraduationCap,
  HeartPulse,
  House,
  LayoutDashboard,
  List,
  LockKeyhole,
  NotebookPen,
  NotebookText,
  Scale,
  Settings,
  ShieldCheck,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** One-sentence description used by the placeholder pages. */
  description: string;
  /** What the screen will become in a later phase. */
  comingSoon: string;
};

/** Main sidebar navigation — grouped by NAV_SECTIONS below. */
export const SIDEBAR_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
    description:
      "Your trading command center: today's P&L, your discipline score and the sessions that matter, at a glance.",
    comingSoon:
      "The dashboard will surface your equity curve (the constellation), key KPIs and the coach's daily briefing.",
  },
  {
    href: "/session",
    label: "Session Live",
    icon: Activity,
    description:
      "Run a structured trading session in real time, one decision at a time.",
    comingSoon:
      "The live session runner will arrive here: trade entry, judgment gates and the post-decision reveal.",
  },
  {
    href: "/trades",
    label: "Trades",
    icon: List,
    description:
      "The complete trade log: every execution with its result and decision grade, side by side.",
    comingSoon:
      "Filters, CSV import and per-trade detail views will build on this table.",
  },
  {
    href: "/journal",
    label: "Trade Review",
    icon: NotebookPen,
    description:
      "Review every executed trade and hold your goals against reality: plan vs. actual, execution grades and the lesson you keep.",
    comingSoon:
      "The trade review workflow will grade execution against the playbook and capture lessons.",
  },
  {
    href: "/playbook",
    label: "Playbook",
    icon: BookOpen,
    description:
      "Define the setups you are allowed to trade and the rules that protect you from yourself.",
    comingSoon:
      "The playbook editor will let you describe setups, entry criteria and checklists per strategy.",
  },
  {
    href: "/analytics",
    label: "Analytics",
    icon: ChartColumn,
    description:
      "Turn your trade history into patterns, edges and honest statistics.",
    comingSoon:
      "Expect the constellation equity curve, win/loss heatmaps and breakdowns by setup, session and account.",
  },
  {
    href: "/recognition",
    label: "Import & Recognition",
    icon: FileScan,
    description:
      "Import a trading screenshot, review what the engine recognized — every field carries its confidence — and confirm what enters the journal.",
    comingSoon:
      "Batch import queues, multi-trade screenshots and source-region highlighting will land with the OCR engine.",
  },
  {
    href: "/calendar",
    label: "Calendar",
    icon: CalendarDays,
    description:
      "See your month at a glance: trading days, big wins, rule violations and rest days.",
    comingSoon:
      "A monthly calendar will map daily P&L, discipline states and trading activity over time.",
  },
  {
    href: "/discipline",
    label: "Discipline",
    icon: ShieldCheck,
    description:
      "The coach that watches your rules: limits, streaks, violations and mindset.",
    comingSoon:
      "Your discipline score, daily limits, rule-violation feed and ghost-trade settlements will live here.",
  },
  {
    href: "/academy",
    label: "Academy",
    icon: GraduationCap,
    description:
      "The learning hub: structured courses, drills, quizzes and a searchable glossary — from market fundamentals to advanced execution.",
    comingSoon:
      "The Academy curriculum will grow with practice drills, pattern labs and coaching recommendations from your own journal.",
  },
  {
    href: "/nofy",
    label: "Nofy",
    icon: NotebookText,
    description:
      "Your personal trading knowledge workspace: notes, ideas, research and documentation — connected to your trades, strategies and lessons.",
    comingSoon:
      "Nofy will become the place where observations become knowledge, and knowledge feeds the playbook.",
  },
  {
    href: "/tools/lot-size",
    label: "Lot Size Calculator",
    icon: Scale,
    description:
      "Size positions from your risk budget: balance, risk %, entry, stop and the instrument's specifications — with the full calculation breakdown.",
    comingSoon:
      "Live broker instrument specifications and portfolio-level risk will extend the calculator.",
  },
  {
    href: "/tools/compounding",
    label: "Compounding Calculator",
    icon: TrendingUp,
    description:
      "Project account growth across compounding periods — period by period, with the full schedule and growth curve.",
    comingSoon:
      "Deposits, withdrawals and variable return sequences will extend the projection model.",
  },
  {
    href: "/monitoring",
    label: "Monitoring",
    icon: HeartPulse,
    description:
      "System health at a glance: market feed, API status and offline readiness.",
    comingSoon:
      "Live service dashboards, latency history and incident notes will live here.",
  },
  {
    href: "/integrations",
    label: "Integrations",
    icon: Cable,
    description:
      "Connect your brokers and data providers — Deriv, MT5, cTrader, Binance.",
    comingSoon:
      "Broker adapters will plug into this hub with scoped, read-only connections.",
  },
  {
    href: "/security",
    label: "Security",
    icon: LockKeyhole,
    description:
      "Protection center: 2FA, sessions, API keys, connected accounts and the audit trail.",
    comingSoon:
      "Passkeys, IP allow-lists and exportable audit reports will land here later.",
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    description:
      "Tune Euforia to your accounts, timezone, risk defaults and display preferences.",
    comingSoon:
      "Account management, risk defaults, theme and timezone preferences will be configured here.",
  },
];

/** Desktop sidebar order: Dashboard first, then the New Trade action, then the rest. */
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
    title: "Trading",
    hrefs: ["/session", "/trades", "/journal", "/playbook"],
  },
  // Goals lives inside Trade Review (/journal?tab=goals) — /goals redirects there.
  {
    title: "Insights",
    hrefs: ["/analytics", "/recognition", "/calendar", "/discipline"],
  },
  {
    title: "Academy",
    hrefs: ["/academy", "/nofy"],
  },
  {
    title: "Tools",
    hrefs: ["/tools/lot-size", "/tools/compounding"],
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
