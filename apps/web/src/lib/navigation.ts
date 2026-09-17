import {
  Activity,
  BookOpen,
  CalendarDays,
  ChartColumn,
  House,
  LayoutDashboard,
  NotebookPen,
  Settings,
  ShieldCheck,
  Target,
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

/** Main sidebar navigation, in the order defined by the Phase 1 brief. */
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
    href: "/calendar",
    label: "Calendar",
    icon: CalendarDays,
    description:
      "See your month at a glance: trading days, big wins, rule violations and rest days.",
    comingSoon:
      "A monthly calendar will map daily P&L, discipline states and trading activity over time.",
  },
  {
    href: "/journal",
    label: "Journal",
    icon: NotebookPen,
    description:
      "Every trade, every note, every lesson: your searchable trading log.",
    comingSoon:
      "The trade log will list sessions and trades with filters, notes and post-trade grading.",
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
    href: "/goals",
    label: "Goals",
    icon: Target,
    description:
      "Set targets for consistency, risk and growth, and track how you actually behave against them.",
    comingSoon:
      "Goal setting and progress tracking will compare your targets with your real trading behavior.",
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    description:
      "Tune Cosmoz to your accounts, timezone, risk defaults and display preferences.",
    comingSoon:
      "Account management, risk defaults, theme and timezone preferences will be configured here.",
  },
];

/** Desktop sidebar order: Dashboard first, then the New Trade action, then the rest. */
export const SIDEBAR_FIRST_ITEM = SIDEBAR_ITEMS[0];
export const SIDEBAR_REST_ITEMS = SIDEBAR_ITEMS.slice(1);

/** Bottom navigation bar (mobile only): Home, Trades, [+ FAB], Playbook, Stats. */
export type BottomNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const BOTTOM_NAV_ITEMS: BottomNavItem[] = [
  { href: "/", label: "Home", icon: House },
  { href: "/journal", label: "Trades", icon: NotebookPen },
  { href: "/playbook", label: "Playbook", icon: BookOpen },
  { href: "/analytics", label: "Stats", icon: ChartColumn },
];

/** Resolves the current page title from the pathname. */
export function getPageTitle(pathname: string): string {
  const match = SIDEBAR_ITEMS.find((item) => item.href === pathname);
  if (match) return match.label;
  if (pathname === "/login") return "Sign in";
  if (pathname === "/register") return "Create account";
  return "Cosmoz";
}

/** Single source of truth for a screen's copy — throws on unknown href. */
export function getNavItem(href: string): NavItem {
  const item = SIDEBAR_ITEMS.find((nav) => nav.href === href);
  if (!item) {
    throw new Error(`Unknown nav item href: ${href}`);
  }
  return item;
}
