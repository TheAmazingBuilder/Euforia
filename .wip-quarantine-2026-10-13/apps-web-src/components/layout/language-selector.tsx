"use client";

import * as React from "react";
import {
  Check,
  ChevronDown,
  Cloud,
  CloudOff,
  Languages,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { apiErrorMessage } from "@/lib/api/client";
import {
  usePreferences,
  useUpdatePreferencesDomain,
} from "@/lib/api/queries";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/config";
import { useI18n } from "@/i18n/i18n-provider";

/**
 * Language options — names are SELF-REFERENTIAL (each language is written
 * in itself: a French speaker facing an EN UI looks for "Français", not
 * "French"). The subtitle resolves through the ACTIVE dictionary so it
 * reads in the language currently on screen.
 */
const LOCALE_OPTIONS: readonly {
  value: Locale;
  code: string;
  native: string;
  subtitleKey: "languageEnSubtitle" | "languageFrSubtitle";
}[] = [
  { value: "en", code: "EN", native: "English", subtitleKey: "languageEnSubtitle" },
  { value: "fr", code: "FR", native: "Français", subtitleKey: "languageFrSubtitle" },
] as const;

type SyncState = "local" | "saving" | "error" | "synced";

/**
 * LanguageSelector — the header entry point of the dynamic i18n engine,
 * designed as a first-class premium control:
 *
 *   1. INSTANT runtime switch — setLocale re-renders every consumer in
 *      place (no reload); the boot mirror is written by the provider.
 *   2. SERVER WRITE-THROUGH — the same switch PATCHes the localization
 *      domain (language only, full validated body) so the account-level
 *      preference follows the user across devices. The preferences cache
 *      updates optimistically (the Settings card reflects the switch
 *      immediately); rollback on failure, surfaced as an honest toast.
 *   3. Account reconciliation on boot is owned by LocaleServerSync.
 *
 * Design language matches the topbar family (command-palette trigger):
 * h-8 bordered pill on bg-surface, accent on hover/open, mono locale
 * code, chevron that follows the open state. The popover is a real
 * listbox — native names, translated subtitles, animated check ring,
 * and a live sync chip that reports exactly what happened to the
 * account document (saving / synced / local-only / failed).
 */
export function LanguageSelector() {
  const { locale, setLocale, dict } = useI18n();
  const { data: prefs } = usePreferences();
  const saveDomain = useUpdatePreferencesDomain("localization");

  const [open, setOpen] = React.useState(false);
  const [justSaved, setJustSaved] = React.useState(false);
  const savedTimerRef = React.useRef<number | null>(null);
  const activeOptionRef = React.useRef<HTMLButtonElement | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(
    () => () => {
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
    },
    [],
  );

  // Focus lands on the ACTIVE option when the panel opens (keyboard-first).
  React.useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      activeOptionRef.current?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(id);
  }, [open]);

  /** Instant runtime switch + fire-and-forget server write-through. */
  const chooseLocale = (next: Locale) => {
    setLocale(next);
    setOpen(false);
    if (prefs) {
      saveDomain.mutate(
        { ...prefs.localization, language: next },
        {
          onSuccess: () => {
            setJustSaved(true);
            if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
            savedTimerRef.current = window.setTimeout(() => setJustSaved(false), 1800);
          },
          onError: (error) =>
            toast.error(apiErrorMessage(error, dict.nav.languageSyncError)),
        },
      );
    }
  };

  // Roving focus across the two options (Radix gives Escape/tab-out).
  const onListKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const options = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [],
    );
    if (options.length === 0) return;
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === "ArrowDown"
        ? (index + 1) % options.length
        : (index - 1 + options.length) % options.length;
    options[next]?.focus();
  };

  const syncState: SyncState = !prefs
    ? "local"
    : saveDomain.isPending
      ? "saving"
      : saveDomain.isError
        ? "error"
        : "synced";
  const syncLabel: Record<SyncState, string> = {
    local: dict.nav.languageLocalOnly,
    saving: dict.nav.languageSaving,
    error: dict.nav.languageSyncError,
    synced: dict.nav.languageSynced,
  };

  return (
    <div className="flex items-center" data-testid="language-selector">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label={dict.nav.language}
            aria-haspopup="listbox"
            aria-expanded={open}
            title={dict.nav.language}
            data-testid="language-selector-trigger"
            className={cn(
              "h-8 gap-1.5 rounded-lg border px-2.5 font-normal transition-colors duration-150",
              open || justSaved
                ? "border-accent/60 bg-accent/[0.06] text-accent"
                : "border-border bg-surface text-muted-foreground hover:border-accent/50 hover:text-accent",
            )}
          >
            {justSaved ? (
              <Check
                className="size-3.5 animate-in zoom-in-50 fade-in duration-200"
                strokeWidth={3}
                aria-hidden="true"
              />
            ) : (
              <Languages className="size-3.5" aria-hidden="true" />
            )}
            <span
              aria-hidden="true"
              className="font-mono text-[10px] font-bold uppercase leading-none tracking-wider"
            >
              {locale}
            </span>
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "size-3 opacity-50 transition-transform duration-200",
                open && "rotate-180",
              )}
            />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align="end"
          sideOffset={8}
          data-testid="language-selector-panel"
          className="w-72 origin-top-right rounded-xl border-border bg-popover p-1.5 shadow-lg shadow-black/10"
        >
          {/* Panel header */}
          <div className="flex items-center justify-between px-2 pb-1.5 pt-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {dict.nav.language}
            </p>
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
              {locale}
            </span>
          </div>

          {/* Options — listbox semantics, roving focus, animated check */}
          <div
            ref={listRef}
            role="listbox"
            aria-label={dict.nav.language}
            onKeyDown={onListKeyDown}
            className="flex flex-col gap-0.5"
          >
            {LOCALE_OPTIONS.map((option) => {
              const isActive = locale === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  ref={isActive ? activeOptionRef : undefined}
                  onClick={() => chooseLocale(option.value)}
                  data-testid={`language-option-${option.value}`}
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left outline-none transition-colors duration-150",
                    isActive
                      ? "bg-muted/70"
                      : "hover:bg-muted/50 focus-visible:bg-muted/50",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-9 shrink-0 items-center justify-center rounded-md border font-mono text-[10px] font-bold tracking-widest transition-colors duration-150",
                      isActive
                        ? "border-accent/40 bg-accent/10 text-accent"
                        : "border-border bg-background text-muted-foreground group-hover:border-accent/30",
                    )}
                  >
                    {option.code}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span
                      className={cn(
                        "truncate text-sm leading-tight text-foreground",
                        isActive ? "font-semibold" : "font-medium",
                      )}
                    >
                      {option.native}
                    </span>
                    <span className="truncate text-xs leading-tight text-muted-foreground">
                      {dict.nav[option.subtitleKey]}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full border transition-all duration-200",
                      isActive
                        ? "border-transparent bg-foreground text-background"
                        : "border-border text-transparent group-hover:border-muted-foreground/40",
                    )}
                  >
                    {isActive ? (
                      <Check
                        className="size-3 animate-in zoom-in-50 fade-in duration-200"
                        strokeWidth={3}
                        aria-hidden="true"
                      />
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Sync status — honest account-document feedback */}
          <div className="my-1 h-px bg-border" aria-hidden="true" />
          <div
            data-testid="language-sync-status"
            data-sync-state={syncState}
            className="flex items-center gap-2 px-2 pb-1 pt-1.5 text-[11px] text-muted-foreground"
          >
            {syncState === "saving" ? (
              <Loader2 className="size-3 animate-spin" aria-hidden="true" />
            ) : syncState === "error" ? (
              <TriangleAlert className="size-3 text-warning" aria-hidden="true" />
            ) : syncState === "local" ? (
              <CloudOff className="size-3" aria-hidden="true" />
            ) : (
              <Cloud className="size-3" aria-hidden="true" />
            )}
            <span className="truncate">{syncLabel[syncState]}</span>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
