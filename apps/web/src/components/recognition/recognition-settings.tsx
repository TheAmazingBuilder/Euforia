"use client";

import { CheckCircle2, CircleDashed, Lock, Wallet } from "lucide-react";

import { cn } from "@/lib/utils";
import type { OcrExtractionProfile } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAccounts } from "@/lib/api/queries";
import type { RecognitionDict } from "@/i18n/dictionaries/en/recognition";

/**
 * RecognitionSettings — the recognition configuration step (PROMPT 3 §14).
 *
 * Honesty rule: options the V1 backend will not support are shown DISABLED
 * with a "coming soon" state, never as if they worked. Platform detection
 * is the engine's job — the UI shows it as auto-detect information, not a
 * fake selector. The only active profile is TRADE_SUMMARY (the V1 target:
 * MT5-style trade summary lines).
 */

export function RecognitionSettings({
  dict,
  profile,
  onProfile,
  detectedPlatform,
  accountId,
  onAccountId,
  onStart,
  onBack,
  pending = false,
}: {
  dict: RecognitionDict;
  profile: OcrExtractionProfile;
  onProfile: (profile: OcrExtractionProfile) => void;
  /** What the engine expects to classify — informational, not a selector. */
  detectedPlatform: string;
  /** ACCOUNTS attachment (engine quality §3.1) — null = default account. */
  accountId: string | null;
  onAccountId: (accountId: string | null) => void;
  onStart: () => void;
  onBack: () => void;
  pending?: boolean;
}) {
  const accounts = useAccounts();
  const accountOptions = accounts.data?.accounts ?? [];
  const profiles: Array<{
    value: OcrExtractionProfile | "ACCOUNT_POSITION" | "CHART_ANALYSIS";
    label: string;
    hint?: string;
    disabled: boolean;
  }> = [
    { value: "TRADE_SUMMARY", label: dict.settings.profileTrade, hint: dict.settings.profileTradeHint, disabled: false },
    { value: "ACCOUNT_POSITION", label: dict.settings.profileAccount, disabled: true },
    { value: "CHART_ANALYSIS", label: dict.settings.profileChart, disabled: true },
  ];

  return (
    <div className="flex flex-col gap-6" data-testid="recognition-settings">
      <section aria-label={dict.settings.title} className="flex flex-col">
        <header className="mb-1">
          <h2 className="font-heading text-lg font-semibold">{dict.settings.title}</h2>
          <p className="text-sm text-muted-foreground">{dict.settings.subtitle}</p>
        </header>
      </section>

      {/* Platform — engine-detected, informational (§14). */}
      <div className="border-t border-border pt-4">
        <p className="ledger-label">{dict.settings.platform}</p>
        <div className="mt-2 flex items-center gap-2">
          <CheckCircle2 className="size-4 text-accent" strokeWidth={1.5} aria-hidden="true" />
          <span className="text-sm">{dict.settings.platformAuto}</span>
          <span className="text-xs text-muted-foreground">— {dict.settings.platformHint}</span>
        </div>
        <p className="mt-1 font-mono text-xs text-muted-foreground" data-testid="recognition-platform-expected">
          {detectedPlatform}
        </p>
      </div>

      {/* Account attachment (engine quality §3.1) — where confirmed trades land. */}
      <div className="border-t border-border pt-4">
        <p className="ledger-label">{dict.settings.account}</p>
        <p className="mt-1 text-xs text-muted-foreground">{dict.settings.accountHint}</p>
        <Select
          value={accountId ?? "default"}
          onValueChange={(next) => onAccountId(next === "default" ? null : next)}
          disabled={pending}
        >
          <SelectTrigger className="mt-2 h-9 w-full max-w-xs font-mono text-sm" data-testid="recognition-account-select">
            <span className="flex items-center gap-2">
              <Wallet className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <SelectValue placeholder={dict.settings.accountDefault} />
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">{dict.settings.accountDefault}</SelectItem>
            {accountOptions.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Profile — the one real V1 option + disabled future modes. */}
      <fieldset className="border-t border-border pt-4">
        <legend className="ledger-label">{dict.settings.profile}</legend>
        <p className="mt-1 text-xs text-muted-foreground">{dict.settings.profileHint}</p>
        <div className="mt-3 flex flex-col">
          {profiles.map((option) => {
            const active = option.value === profile;
            const row = (
              <span className="flex items-start gap-3">
                {active ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" strokeWidth={1.5} aria-hidden="true" />
                ) : option.disabled ? (
                  <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" strokeWidth={1.5} aria-hidden="true" />
                ) : (
                  <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                )}
                <span className="flex flex-col">
                  <span className={cn("text-sm", option.disabled && "text-muted-foreground/60")}>{option.label}</span>
                  {option.hint ? <span className="text-xs text-muted-foreground">{option.hint}</span> : null}
                </span>
              </span>
            );
            return option.disabled ? (
              <div
                key={option.value}
                aria-disabled="true"
                className="flex min-h-11 items-center border-b border-border/60 px-1 py-2 opacity-80"
              >
                {row}
              </div>
            ) : (
              <label
                key={option.value}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center border-b border-border/60 px-1 py-2 transition-colors hover:bg-surface-raised",
                  active && "bg-surface-raised/60",
                )}
              >
                <input
                  type="radio"
                  name="recognition-profile"
                  className="sr-only"
                  value={option.value}
                  checked={active}
                  onChange={() => onProfile(option.value as OcrExtractionProfile)}
                />
                {row}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Button type="button" onClick={onStart} disabled={pending} data-testid="recognition-start">
          {dict.settings.start}
        </Button>
        <Button type="button" variant="ghost" onClick={onBack} disabled={pending} data-testid="recognition-back">
          {dict.settings.changeImage}
        </Button>
      </div>
    </div>
  );
}
