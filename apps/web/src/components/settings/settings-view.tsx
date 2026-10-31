"use client";

import * as React from "react";
import {
  BellRing,
  CandlestickChart,
  Eye,
  Gauge,
  Globe2,
  GraduationCap,
  NotebookPen,
  Palette,
  Search,
  Settings as SettingsIcon,
  UserCog,
  type LucideIcon,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { DEFAULT_USER_PREFERENCES, type PreferenceDomain } from "@cosmoz/shared";
import { usePreferences } from "@/lib/api/queries";
import { useI18n } from "@/i18n/i18n-provider";
import { TradingCard } from "@/components/settings/cards/trading-card";
import { RiskCard } from "@/components/settings/cards/risk-card";
import { JournalCard } from "@/components/settings/cards/journal-card";
import { NotificationsCard } from "@/components/settings/cards/notifications-card";
import { AppearanceCard } from "@/components/settings/cards/appearance-card";
import { AcademyCard } from "@/components/settings/cards/academy-card";
import { PrivacyCard } from "@/components/settings/cards/privacy-card";
import { LocalizationCard } from "@/components/settings/cards/localization-card";
import { AccountCard } from "@/components/settings/cards/account-card";

/**
 * Settings module shell - a horizontal category bar above the active
 * settings panel. Categories remain deep-linkable and searchable, while
 * account identity/profile editing stays outside this preference center.
 */

interface CategoryMeta {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  keywords: string[];
  Component: () => React.JSX.Element;
}

const CATEGORIES: CategoryMeta[] = [
  {
    id: "trading",
    label: "Trading",
    description: "Defaults for the trade form",
    icon: CandlestickChart,
    keywords: [
      "default account", "market", "symbol", "timeframe", "currency",
      "direction", "position type", "r:r", "rr",
    ],
    Component: TradingCard,
  },
  {
    id: "risk",
    label: "Risk",
    description: "Risk numbers and Rules Engine linkage",
    icon: Gauge,
    keywords: [
      "risk", "risk per trade", "loss limit", "daily", "weekly", "monthly",
      "exposure", "correlated", "open positions", "sizing", "rules engine",
    ],
    Component: RiskCard,
  },
  {
    id: "journal",
    label: "Journal",
    description: "Required fields, tracking, reminders",
    icon: NotebookPen,
    keywords: [
      "required", "fields", "screenshot", "pre-trade", "post-trade", "review",
      "emotion", "confidence", "stress", "auto-save", "template", "reminder",
    ],
    Component: JournalCard,
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "Per event, per channel",
    icon: BellRing,
    keywords: [
      "notifications", "trading", "risk", "strategy", "economic", "system",
      "reports", "in-app", "email", "push", "alerts", "broker disconnected",
    ],
    Component: NotificationsCard,
  },
  {
    id: "appearance",
    label: "Appearance",
    description: "Theme, density, P&L display",
    icon: Palette,
    keywords: [
      "theme", "dark", "light", "density", "compact", "dashboard", "layout",
      "p&l", "pnl", "display",
    ],
    Component: AppearanceCard,
  },
  {
    id: "academy",
    label: "Academy",
    description: "Learning preferences and reminders",
    icon: GraduationCap,
    keywords: ["academy", "learning", "difficulty", "progress", "reminder", "autoplay", "goal"],
    Component: AcademyCard,
  },
  {
    id: "privacy",
    label: "Privacy",
    description: "Analytics, visibility and data ownership",
    icon: Eye,
    keywords: [
      "privacy", "analytics", "crash", "diagnostics", "visibility", "sharing",
      "export", "import", "backup", "data",
    ],
    Component: PrivacyCard,
  },
  {
    id: "localization",
    label: "Localization",
    description: "Language, formats, timezone",
    icon: Globe2,
    keywords: [
      "language", "french", "english", "timezone", "date format", "time format",
      "decimal", "currency display", "week", "number format",
    ],
    Component: LocalizationCard,
  },
  {
    id: "account",
    label: "Account",
    description: "Plan, connected accounts, dangerous actions",
    icon: UserCog,
    keywords: [
      "account", "plan", "subscription", "connected accounts", "export",
      "deactivate", "delete", "sign out", "danger",
    ],
    Component: AccountCard,
  },
];

/** Metadata for the GLOBAL ⌘K palette's Settings group (no React nodes). */
export const SETTINGS_FINDER_META = CATEGORIES.map((category) => ({
  id: category.id,
  label: category.label,
  description: category.description,
  icon: category.icon,
  keywords: category.keywords.join(" "),
}));

function readInitialCategory(): string {
  if (typeof window === "undefined") return CATEGORIES[0]!.id;
  const hash = window.location.hash.replace("#", "");
  return CATEGORIES.some((category) => category.id === hash)
    ? hash
    : CATEGORIES[0]!.id;
}

/** Key-order-stable stringify - safe deep comparison for the modified badge. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`).join(",")}}`;
}

/**
 * Modified badges (module upgrade) - a domain lights up when its CURRENT
 * value differs from the shared safe defaults (server document vs the
 * shared DEFAULT_USER_PREFERENCES, deep-compared key-order-stable).
 */
function useModifiedDomains(): Set<string> {
  const { data: prefs } = usePreferences();
  return React.useMemo(() => {
    const modified = new Set<string>();
    if (prefs === undefined) return modified;
    const domainKeys: PreferenceDomain[] = [
      "trading", "risk", "journal", "notifications", "appearance",
      "dashboard", "academy", "privacy", "localization",
    ];
    for (const domain of domainKeys) {
      const current = prefs[domain];
      const fallback = DEFAULT_USER_PREFERENCES[domain];
      if (fallback === undefined || stableStringify(current) !== stableStringify(fallback)) {
        modified.add(domain);
      }
    }
    return modified;
  }, [prefs]);
}

export function SettingsView() {
  const [active, setActive] = React.useState<string>(readInitialCategory);
  const [query, setQuery] = React.useState("");
  const modifiedDomains = useModifiedDomains();
  const { dict } = useI18n();
  /** Localized category meta - EN CATEGORIES stay the structural source. */
  const categoryMeta = (category: (typeof CATEGORIES)[number]) => ({
    label: dict.settings.categories[category.id]?.label ?? category.label,
    description: dict.settings.categories[category.id]?.description ?? category.description,
  });

  // Deep links stay live - back/forward and manual hash edits work.
  React.useEffect(() => {
    const onHashChange = () => setActive(readInitialCategory());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const selectCategory = (id: string) => {
    setActive(id);
    // replaceState: no scroll jump, but the URL stays shareable.
    window.history.replaceState(null, "", `#${id}`);
  };

  const needle = query.trim().toLowerCase();
  const visibleCategories = needle
    ? CATEGORIES.filter((category) => {
        const meta = categoryMeta(category);
        return [
          meta.label,
          meta.description,
          ...category.keywords,
        ].some((text) => text.toLowerCase().includes(needle));
      })
    : CATEGORIES;

  // When searching, if the active category fell out of the results, follow
  // the first match so the content pane always agrees with the rail.
  const effectiveActive =
    needle && !visibleCategories.some((category) => category.id === active)
      ? (visibleCategories[0]?.id ?? null)
      : active;
  const activeCategory =
    CATEGORIES.find((category) => category.id === effectiveActive) ?? null;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">
          <SettingsIcon className="size-6 text-accent" aria-hidden="true" />
          {dict.settings.view.title}
        </h1>
        <p className="text-sm text-muted-foreground">
          {dict.settings.view.subtitle}
        </p>
      </header>

      {/* Search - filters categories by label, description and keywords.
          ⌘K opens the GLOBAL palette, which now carries a Settings group. */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={dict.settings.view.searchPlaceholder}
          aria-label={dict.settings.view.searchAria}
          className="pl-9 pr-14"
          data-testid="settings-search"
        />
        <kbd
          className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-surface-raised px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:block"
          aria-hidden="true"
          data-testid="settings-search-kbd"
        >
          ⌘K
        </kbd>
      </div>

      <div className="space-y-5">
        <nav aria-label={dict.settings.view.categoriesNavAria} data-testid="settings-category-nav">
          <div className="flex min-w-0 gap-1 overflow-x-auto border-b border-border pb-px">
            {visibleCategories.map((category) => {
              const Icon = category.icon;
              const isActive = category.id === effectiveActive;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => selectCategory(category.id)}
                  aria-current={isActive ? "page" : undefined}
                  data-testid={"settings-nav-" + category.id}
                  className={cn(
                    "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                    isActive
                      ? "border-foreground bg-foreground text-background"
                      : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span className="whitespace-nowrap">{categoryMeta(category).label}</span>
                  {modifiedDomains.has(category.id) && (
                    <span
                      className="ml-0.5 size-1.5 shrink-0 rounded-full bg-accent"
                      title="This section differs from the default values"
                      aria-label="Modified from defaults"
                      data-testid={"settings-modified-" + category.id}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {visibleCategories.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground" role="status">
            No settings match “{query}”.
          </p>
        ) : null}

        <div className="min-w-0" data-testid="settings-content">
          {activeCategory ? (
            <activeCategory.Component />
          ) : (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Choose a category above to get started.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Full-page loading skeleton (while the first profile/prefs fetch runs). */
export function SettingsViewSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6" aria-busy="true">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="h-9 w-full" />
      <div className="flex gap-2 overflow-hidden border-b border-border pb-2">
        {CATEGORIES.map((category) => (
          <Skeleton key={category.id} className="h-9 w-24 shrink-0 rounded-md" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-lg" />
    </div>
  );
}
