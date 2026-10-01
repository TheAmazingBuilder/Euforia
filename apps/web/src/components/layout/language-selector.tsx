"use client";

import * as React from "react";
import { Check, Languages } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/i18n/i18n-provider";
import type { Locale } from "@/i18n/config";

/**
 * Language options — names are SELF-REFERENTIAL (each language is written
 * in itself): a French speaker facing an EN UI looks for "Français", not
 * "French". The displayed code on the trigger follows the ACTIVE locale.
 */
const LOCALE_OPTIONS: readonly { value: Locale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
] as const;

/**
 * LanguageSelector — the header entry point of the dynamic i18n engine.
 * Switching is INSTANT: setLocale re-renders every consumer in place (no
 * reload) and the provider persists the choice to the boot mirror. The
 * account-level server preference stays owned by Settings → Localization.
 */
export function LanguageSelector() {
  const { locale, setLocale, dict } = useI18n();

  return (
    <div className="flex items-center" data-testid="language-selector">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            aria-label={dict.nav.language}
            title={dict.nav.language}
            data-testid="language-selector-trigger"
            className="gap-0.5 px-0"
          >
            <Languages className="size-4" aria-hidden="true" />
            <span
              aria-hidden="true"
              className="font-mono text-[10px] font-semibold uppercase leading-none"
            >
              {locale}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-40">
          <DropdownMenuLabel>{dict.nav.language}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {LOCALE_OPTIONS.map((option) => {
            const isActive = locale === option.value;
            return (
              <DropdownMenuItem
                key={option.value}
                onClick={() => setLocale(option.value)}
                data-testid={`language-option-${option.value}`}
                className="flex items-center gap-2"
              >
                <span className="w-7 shrink-0 font-mono text-[10px] font-semibold uppercase text-muted-foreground">
                  {option.value}
                </span>
                <span className="flex-1">{option.label}</span>
                <span className="flex size-4 items-center justify-center">
                  {isActive ? <Check className="size-4" /> : null}
                </span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
