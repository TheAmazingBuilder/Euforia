"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Check, Droplet, Monitor, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const DARK_THEMES = ["dark-blue", "dark"] as const;

const THEME_OPTIONS = [
  {
    value: "dark-blue",
    label: "Dark blue",
    dotClass: "theme-dot-dark-blue",
    Icon: Droplet,
  },
  {
    value: "dark",
    label: "Dark",
    dotClass: "theme-dot-dark",
    Icon: Moon,
  },
  {
    value: "light",
    label: "Light",
    dotClass: "theme-dot-light",
    Icon: Sun,
  },
  {
    value: "system",
    label: "System",
    dotClass: "theme-dot-system",
    Icon: Monitor,
  },
] as const;

const emptySubscribe = () => () => {};

/**
 * Theme switch - ONE click toggles light ↔ dark (the default dark-blue is
 * remembered). The dropdown chevron still exposes all three Euforia themes.
 */
export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  // Hydration guard without setState-in-effect (react-hooks/set-state-in-effect):
  // false during SSR + hydration render, true once hydrated on the client.
  const mounted = React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  const active = mounted
    ? (THEME_OPTIONS.find((option) => option.value === theme) ??
      THEME_OPTIONS[0])
    : undefined;
  const ActiveIcon = active?.Icon ?? Moon;
  // "system" counts as light when the OS resolves to light - the one-click
  // toggle always flips the VISIBLE appearance.
  const isLight =
    mounted && (theme === "light" || (theme === "system" && resolvedTheme === "light"));
  const toggleTheme = () => {
    setTheme(isLight ? DARK_THEMES[0] : "light");
  };

  return (
    <div className="flex items-center" data-testid="theme-toggle">
      <Button
        variant="outline"
        size="icon"
        className="rounded-r-none border-r-0"
        aria-label={isLight ? "Switch to dark theme" : "Switch to light theme"}
        title={isLight ? "Switch to dark theme" : "Switch to light theme"}
        onClick={toggleTheme}
        disabled={!mounted}
        data-testid="theme-toggle-button"
      >
        <ActiveIcon className="size-4" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="rounded-l-none border-l px-0 w-5"
            aria-label="All themes"
            title="All themes"
          >
            <span aria-hidden="true" className="text-[10px] leading-none text-muted-foreground">▾</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-40">
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {THEME_OPTIONS.map((option) => {
            const isActive = active?.value === option.value;
            return (
              <DropdownMenuItem
                key={option.value}
                onClick={() => setTheme(option.value)}
                className="flex items-center gap-2"
              >
                <span
                  aria-hidden="true"
                  className={`size-3 shrink-0 rounded-full ${option.dotClass}`}
                />
                <span className="flex-1">{option.label}</span>
                <span className="flex size-4 items-center justify-center">
                  {isActive ? <Check className="size-4" /> : null}
                </span>
                <option.Icon className="size-4 text-muted-foreground" />
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
