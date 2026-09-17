"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Check, Droplet, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
] as const;

const emptySubscribe = () => () => {};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label="Change theme"
          title="Change theme"
        >
          <ActiveIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
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
  );
}
