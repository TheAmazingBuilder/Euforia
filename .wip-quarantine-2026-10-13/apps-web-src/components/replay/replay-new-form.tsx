"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MarketInterval } from "@cosmoz/shared";

import { useAccounts, useInstruments, useReplayCreateSession, useSetups, useStrategies } from "@/lib/api/queries";
import { useI18n } from "@/i18n/i18n-provider";

/**
 * New Replay configuration (REPLAY MASTER PROMPT §14). Only fields the
 * backend actually supports — no fake controls: the whole app renders
 * market time in UTC, so the window inputs are UTC-labelled and parsed as
 * UTC (deterministic across machines). Optional context attaches only
 * user-owned strategy/setup/account references (§35).
 */

const INTERVALS: MarketInterval[] = ["1m", "5m", "15m", "30m", "1H", "4H", "1D"];

const INTERVAL_MS: Record<MarketInterval, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1H": 3_600_000,
  "4H": 14_400_000,
  "1D": 86_400_000,
};

const MAX_WINDOW_MS = 120 * 24 * 3_600_000;

/** datetime-local value → UTC epoch ms (the input is treated as UTC). */
function utcInputToMs(value: string): number | null {
  if (value === "") return null;
  const normalized = value.length === 16 ? `${value}:00.000Z` : `${value}Z`;
  const ms = Date.parse(normalized);
  return Number.isNaN(ms) ? null : ms;
}

/** Bucket-aligned preset window — module scope so Date.now stays out of render. */
function presetWindow(spanMs: number, bucketMs: number): { fromValue: string; toValue: string; startValue: string } {
  const nowBucket = Math.floor(Date.now() / bucketMs) * bucketMs;
  return {
    fromValue: msToUtcInput(nowBucket - spanMs),
    toValue: msToUtcInput(nowBucket),
    startValue: msToUtcInput(nowBucket - spanMs),
  };
}

function msToUtcInput(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16);
}

export function ReplayNewForm() {
  const { dict } = useI18n();
  const T = dict.replay;
  const router = useRouter();
  const create = useReplayCreateSession();

  const instruments = useInstruments().data?.instruments ?? [];
  const strategies = useStrategies().data?.strategies ?? [];
  const setupsQuery = useSetups();
  const allSetups = React.useMemo(() => setupsQuery.data?.setups ?? [], [setupsQuery.data]);
  const accounts = useAccounts().data?.accounts ?? [];

  const [symbol, setSymbol] = React.useState("");
  const [interval, setInterval] = React.useState<MarketInterval>("15m");
  // Default window: the last 4 hours, bucket-aligned — computed once.
  const [fromValue, setFromValue] = React.useState(() => {
    const bucket = Math.floor(Date.now() / 900_000) * 900_000;
    return msToUtcInput(bucket - 4 * 3_600_000);
  });
  const [toValue, setToValue] = React.useState(() => msToUtcInput(Math.floor(Date.now() / 900_000) * 900_000));
  const [startValue, setStartValue] = React.useState(() => {
    const bucket = Math.floor(Date.now() / 900_000) * 900_000;
    return msToUtcInput(bucket - 4 * 3_600_000);
  });
  const [strategyId, setStrategyId] = React.useState<string>("none");
  const [setupId, setSetupId] = React.useState<string>("none");
  const [accountId, setAccountId] = React.useState<string>("none");
  const [balance, setBalance] = React.useState("10000");
  const [riskPct, setRiskPct] = React.useState("1");
  const [error, setError] = React.useState<string | null>(null);

  const setups = React.useMemo(
    () => (strategyId === "none" ? allSetups : allSetups.filter((setup) => setup.strategyId === strategyId)),
    [allSetups, strategyId],
  );

  const applyPreset = (spanMs: number) => {
    const preset = presetWindow(spanMs, INTERVAL_MS[interval]);
    setFromValue(preset.fromValue);
    setToValue(preset.toValue);
    setStartValue(preset.startValue);
    setError(null);
  };

  const submit = () => {
    setError(null);
    if (symbol === "") {
      setError(T.new.symbol);
      return;
    }
    const fromMs = utcInputToMs(fromValue);
    const toMs = utcInputToMs(toValue);
    const startAtMs = utcInputToMs(startValue) ?? fromMs;
    if (fromMs === null || toMs === null || startAtMs === null) {
      setError(`${T.new.windowFrom} / ${T.new.windowTo}`);
      return;
    }
    if (toMs - fromMs > MAX_WINDOW_MS) {
      setError(T.new.windowTooLong);
      return;
    }
    if (startAtMs < fromMs || startAtMs >= toMs) {
      setError(T.new.startAtHint);
      return;
    }
    create.mutate(
      {
        symbol,
        interval,
        fromMs,
        toMs,
        startAtMs,
        strategyId: strategyId === "none" ? null : strategyId,
        setupId: setupId === "none" ? null : setupId,
        tradingAccountId: accountId === "none" ? null : accountId,
        startingBalance: balance.trim() === "" ? null : balance.trim(),
        riskPerTradePct: riskPct.trim() === "" ? null : Number(riskPct),
      },
      {
        onSuccess: (response) => {
          router.push(`/replay/${response.session.id}`);
        },
        onError: () => setError("Could not create the replay — try again."),
      },
    );
  };

  const inputClass = "h-9 font-mono text-sm";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]" data-testid="replay-new-form">
      <div className="space-y-5 rounded-xl border border-border bg-surface p-5">
        {/* Market */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="replay-symbol">{T.new.symbol}</Label>
            <Select value={symbol} onValueChange={setSymbol}>
              <SelectTrigger id="replay-symbol" data-testid="replay-symbol">
                <SelectValue placeholder={T.new.symbolPlaceholder} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {instruments.map((instrument) => (
                  <SelectItem key={instrument.id} value={instrument.symbol}>
                    {instrument.symbol} — {instrument.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="replay-interval">{T.new.interval}</Label>
            <Select value={interval} onValueChange={(value) => setInterval(value as MarketInterval)}>
              <SelectTrigger id="replay-interval" data-testid="replay-interval">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INTERVALS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Window */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{T.new.presetsLabel}</span>
            {[
              { label: T.new.preset1h, span: 3_600_000 },
              { label: T.new.preset4h, span: 4 * 3_600_000 },
              { label: T.new.preset1d, span: 24 * 3_600_000 },
              { label: T.new.preset1w, span: 7 * 24 * 3_600_000 },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset.span)}
                data-testid={`replay-preset-${preset.span}`}
                className="rounded-md border border-border px-2 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:border-accent/40 hover:text-foreground"
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="replay-from">{T.new.windowFrom} (UTC)</Label>
              <Input
                id="replay-from"
                type="datetime-local"
                value={fromValue}
                onChange={(event) => setFromValue(event.target.value)}
                className={inputClass}
                data-testid="replay-from"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="replay-to">{T.new.windowTo} (UTC)</Label>
              <Input
                id="replay-to"
                type="datetime-local"
                value={toValue}
                onChange={(event) => setToValue(event.target.value)}
                className={inputClass}
                data-testid="replay-to"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="replay-start">{T.new.startAt} (UTC)</Label>
              <Input
                id="replay-start"
                type="datetime-local"
                value={startValue}
                onChange={(event) => setStartValue(event.target.value)}
                className={inputClass}
                data-testid="replay-start"
              />
              <p className="text-[11px] leading-snug text-muted-foreground">{T.new.startAtHint}</p>
            </div>
          </div>
        </div>

        {/* Optional context */}
        <fieldset className="space-y-3 rounded-lg border border-dashed border-border/80 p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {T.new.context}
          </legend>
          <p className="text-[11px] text-muted-foreground">{T.new.contextHint}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="replay-strategy">{T.new.strategy}</Label>
              <Select value={strategyId} onValueChange={setStrategyId}>
                <SelectTrigger id="replay-strategy" data-testid="replay-strategy">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{T.new.strategyNone}</SelectItem>
                  {strategies.map((strategy) => (
                    <SelectItem key={strategy.id} value={strategy.id}>
                      {strategy.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="replay-setup">{T.new.setup}</Label>
              <Select value={setupId} onValueChange={setSetupId}>
                <SelectTrigger id="replay-setup" data-testid="replay-setup">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{T.new.setupNone}</SelectItem>
                  {setups.map((setup) => (
                    <SelectItem key={setup.id} value={setup.id}>
                      {setup.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="replay-account">{T.new.account}</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger id="replay-account" data-testid="replay-account">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{T.new.accountNone}</SelectItem>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="replay-balance">{T.new.startingBalance}</Label>
                <Input
                  id="replay-balance"
                  inputMode="decimal"
                  value={balance}
                  onChange={(event) => setBalance(event.target.value)}
                  className={inputClass}
                  data-testid="replay-balance"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="replay-risk">{T.new.riskPerTrade}</Label>
                <Input
                  id="replay-risk"
                  inputMode="decimal"
                  value={riskPct}
                  onChange={(event) => setRiskPct(event.target.value)}
                  className={inputClass}
                  data-testid="replay-risk"
                />
              </div>
            </div>
          </div>
        </fieldset>

        {error ? (
          <p className="text-sm text-loss" data-testid="replay-new-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex items-center gap-2">
          <Button onClick={submit} disabled={create.isPending} data-testid="replay-create">
            <Plus className="size-4" aria-hidden="true" />
            {create.isPending ? T.new.creating : T.new.create}
          </Button>
          <Button variant="outline" onClick={() => router.push("/replay")} disabled={create.isPending}>
            {T.new.cancel}
          </Button>
        </div>
      </div>

      {/* Side explainer */}
      <aside className="h-fit space-y-3 rounded-xl border border-border bg-surface p-4 text-sm text-muted-foreground">
        <p className="font-heading text-sm font-semibold text-foreground">{T.new.title}</p>
        <p className="leading-relaxed">{T.new.subtitle}</p>
        <ul className="space-y-2 text-xs leading-relaxed">
          <li className="rounded-md border border-border/70 bg-background/60 p-2">
            {T.workspace.simulatedBadge} — {T.trade.subtitle}
          </li>
          <li className="rounded-md border border-border/70 bg-background/60 p-2">{T.new.startAtHint}</li>
        </ul>
      </aside>
    </div>
  );
}
