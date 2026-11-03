"use client";

import { CheckCircle2, CandlestickChart, LineChart, Wallet } from "lucide-react";

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
 * RecognitionSettings - the recognition configuration step (PROMPT 3 §14,
 * V1.1 redesign). The three extraction profiles are SELECTABLE CARDS -
 * trade details, account / position, chart analysis - each stating what
 * the engine reads in that mode. Platform detection stays the engine's
 * job: the UI shows it as auto-detect information, never a fake selector.
 */

const PROFILE_CARDS: Array<{
  value: OcrExtractionProfile;
  index: string;
  icon: typeof CandlestickChart;
  titleKey: "profileTrade" | "profileAccount" | "profileChart";
  hintKey: "profileTradeHint" | "profileAccountHint" | "profileChartHint";
  itemsKey: "profileTradeItems" | "profileAccountItems" | "profileChartItems";
}> = [
  { value: "TRADE_SUMMARY", index: "01", icon: CandlestickChart, titleKey: "profileTrade", hintKey: "profileTradeHint", itemsKey: "profileTradeItems" },
  { value: "ACCOUNT_POSITION", index: "02", icon: Wallet, titleKey: "profileAccount", hintKey: "profileAccountHint", itemsKey: "profileAccountItems" },
  { value: "CHART_ANALYSIS", index: "03", icon: LineChart, titleKey: "profileChart", hintKey: "profileChartHint", itemsKey: "profileChartItems" },
];

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
  /** What the engine expects to classify - informational, not a selector. */
  detectedPlatform: string;
  /** ACCOUNTS attachment (engine quality §3.1) - null = default account. */
  accountId: string | null;
  onAccountId: (accountId: string | null) => void;
  onStart: () => void;
  onBack: () => void;
  pending?: boolean;
}) {
  const accounts = useAccounts();
  const accountOptions = accounts.data?.accounts ?? [];

  return (
    <div className="flex flex-col gap-6" data-testid="recognition-settings">
      <section aria-label={dict.settings.title} className="flex flex-col">
        <header className="mb-1">
          <h2 className="font-heading text-lg font-semibold">{dict.settings.title}</h2>
          <p className="text-sm text-muted-foreground">{dict.settings.subtitle}</p>
        </header>
      </section>

      {/* Recognition mode - three selectable cards (V1.1: all enabled). */}
      <fieldset className="flex flex-col gap-3">
        <legend className="ledger-label mb-1">{dict.settings.profile}</legend>
        <p className="text-xs text-muted-foreground">{dict.settings.profileHint}</p>
        <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label={dict.settings.profile}>
          {PROFILE_CARDS.map((card) => {
            const active = card.value === profile;
            const Icon = card.icon;
            return (
              <label
                key={card.value}
                className={cn(
                  "group relative flex cursor-pointer flex-col gap-2.5 rounded-xl border bg-surface px-4 py-3.5 transition-all",
                  "hover:border-accent/40 hover:bg-surface-raised",
                  active
                    ? "border-accent bg-accent/[0.06] shadow-[0_0_0_1px_hsl(var(--accent))]"
                    : "border-border",
                )}
                data-testid={`recognition-profile-${card.value.toLowerCase()}`}
                data-state={active ? "selected" : "idle"}
              >
                <input
                  type="radio"
                  name="recognition-profile"
                  className="sr-only"
                  value={card.value}
                  checked={active}
                  onChange={() => onProfile(card.value)}
                />
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        "font-mono text-[10px] font-medium tracking-[0.08em]",
                        active ? "text-accent" : "text-muted-foreground/60",
                      )}
                      aria-hidden="true"
                    >
                      {card.index}
                    </span>
                    <span
                      className={cn(
                        "flex size-7 items-center justify-center rounded-md border",
                        active ? "border-accent/40 bg-accent/[0.08]" : "border-border bg-surface-raised",
                      )}
                      aria-hidden="true"
                    >
                      <Icon
                        className={cn("size-4", active ? "text-accent" : "text-muted-foreground")}
                        strokeWidth={1.5}
                      />
                    </span>
                  </span>
                  {active ? (
                    <CheckCircle2 className="size-4 text-accent" strokeWidth={1.5} aria-hidden="true" />
                  ) : null}
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="font-heading text-sm font-semibold">{dict.settings[card.titleKey]}</span>
                  <span className="text-xs leading-relaxed text-muted-foreground">
                    {dict.settings[card.hintKey]}
                  </span>
                </span>
                <span className="mt-0.5 flex flex-col gap-1 border-t border-border/60 pt-2">
                  <span className="ledger-label !text-[9px]">{dict.settings.profileCapture}</span>
                  <span className="text-[11px] leading-relaxed text-muted-foreground/90">
                    {dict.settings[card.itemsKey]}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-5 border-t border-border pt-5 sm:grid-cols-2">
        {/* Platform - engine-detected, informational (§14). */}
        <div>
          <p className="ledger-label">{dict.settings.platform}</p>
          <div className="mt-2 flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0 text-accent" strokeWidth={1.5} aria-hidden="true" />
            <span className="text-sm">{dict.settings.platformAuto}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{dict.settings.platformHint}</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground" data-testid="recognition-platform-expected">
            {detectedPlatform}
          </p>
        </div>

        {/* Account attachment (engine quality §3.1) - where confirmed trades land. */}
        <div>
          <p className="ledger-label">{dict.settings.account}</p>
          <p className="mt-1.5 text-xs text-muted-foreground">{dict.settings.accountHint}</p>
          <Select
            value={accountId ?? "default"}
            onValueChange={(next) => onAccountId(next === "default" ? null : next)}
            disabled={pending}
          >
            <SelectTrigger className="mt-2 h-9 w-full font-mono text-sm" data-testid="recognition-account-select">
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
      </div>

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
