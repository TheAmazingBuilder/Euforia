"use client";

import * as React from "react";

import { toast } from "sonner";
import { ArrowLeft, BookOpen, CheckCircle2, ListChecks, Lightbulb, PencilLine, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { isoToLocalInput, localInputToISO } from "@/lib/utils/datetime";
import { CalculatorField } from "@/components/tools/calculator-field";
import { useRecognitionSuggestions, useTradingAccounts } from "@/lib/api/queries";
import type {
  RecognitionWarning,
  TradeDirection,
  TradeDraftInput,
} from "@/lib/recognition/contract";
import {
  computeRiskReward,
  FIELD_LABELS,
  PLATFORM_LABELS,
  tradeDraftSchema,
  validateDraftCoherence,
} from "@/lib/recognition/contract";
import { WarningsPanel } from "./ocr-result-warnings";
import {
  formatDateTime,
  formatPrice,
  formatProfitLoss,
  formatVolume,
  isNegativeAmount,
} from "./ocr-format";

/**
 * Trade Draft review (Prompt 3 §23/§24), confirmation (§28) and success
 * (§29). The draft is NOT a stored trade until the explicit "Confirm &
 * Import" — every section of the review form validates locally (Zod +
 * coherence rules) before "Ready to Import" unlocks.
 */

export type DraftIssues = Partial<Record<keyof TradeDraftInput, string>>;

/** Runs the full draft validation, returning per-field error copy. */
export function validateDraftFields(draft: TradeDraftInput): DraftIssues {
  const issues: DraftIssues = {};
  const parsed = tradeDraftSchema.safeParse({
    ...draft,
    jobId: "validation",
    updatedAt: new Date().toISOString(),
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && !(field in issues)) {
        issues[field as keyof TradeDraftInput] = issue.message;
      }
    }
  } else {
    for (const coherence of validateDraftCoherence(parsed.data)) {
      if (!(coherence.field in issues)) {
        issues[coherence.field] = coherence.message;
      }
    }
  }
  return issues;
}

// ── Draft review (§24) ──────────────────────────────────────────────────────

export function TradeDraftReview({
  draft,
  onDraftChange,
  warnings,
  onBack,
  onReady,
  goingBack = false,
  saving = false,
}: {
  draft: TradeDraftInput;
  onDraftChange: (next: TradeDraftInput) => void;
  warnings: RecognitionWarning[];
  onBack: () => void;
  onReady: () => void;
  goingBack?: boolean;
  saving?: boolean;
}) {
  const [touched, setTouched] = React.useState(false);
  const issues = validateDraftFields(draft);
  const issueCount = Object.keys(issues).length;
  const riskReward = computeRiskReward(draft);
  const symbolOk = draft.symbol.trim().length > 0;

  const set = <K extends keyof TradeDraftInput>(key: K, value: TradeDraftInput[K]) =>
    onDraftChange({ ...draft, [key]: value });

  const priceProps = (key: "entryPrice" | "exitPrice" | "stopLoss" | "takeProfit") => ({
    value: draft[key] ?? "",
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => set(key, event.target.value),
    inputMode: "decimal" as const,
    placeholder: "—",
  });

  return (
    <div className="mx-auto max-w-3xl space-y-5" data-testid="ocr-draft-review">
      <div>
        <h2 className="text-lg font-semibold tracking-[-0.01em]">Review trade</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Everything below was recognized or corrected by you — confirm the numbers before
          they enter your journal.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardContent className="grid gap-4 px-5 py-4">
            <p className="ledger-label">Basic information</p>
            <CalculatorField id="ocr-draft-symbol" label="Symbol" error={touched ? issues.symbol : undefined}>
              {(props) => (
                <Input
                  {...props}
                  value={draft.symbol}
                  onChange={(event) => set("symbol", event.target.value.toUpperCase())}
                  className={cn(props.className, !symbolOk && "border-loss/60")}
                />
              )}
            </CalculatorField>
            <CalculatorField id="ocr-draft-direction" label="Direction" error={touched ? issues.direction : undefined}>
              {() => (
                <Select
                  value={draft.direction}
                  onValueChange={(value) => set("direction", value as TradeDirection)}
                >
                  <SelectTrigger aria-label="Direction">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BUY">BUY</SelectItem>
                    <SelectItem value="SELL">SELL</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </CalculatorField>
            <CalculatorField id="ocr-draft-platform" label="Platform" hint="Detected">
              {() => (
                <div className="flex h-9 items-center rounded-md border border-border bg-muted/40 px-3">
                  <Badge variant="outline" className="font-mono text-[11px]">
                    {PLATFORM_LABELS[draft.platform]}
                  </Badge>
                </div>
              )}
            </CalculatorField>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-4 px-5 py-4">
            <p className="ledger-label">Execution</p>
            <CalculatorField id="ocr-draft-entry" label="Entry price" error={touched ? issues.entryPrice : undefined}>
              {(props) => <Input {...props} {...priceProps("entryPrice")} />}
            </CalculatorField>
            <CalculatorField id="ocr-draft-exit" label="Exit price" hint="Optional" error={touched ? issues.exitPrice : undefined}>
              {(props) => <Input {...props} {...priceProps("exitPrice")} />}
            </CalculatorField>
            <CalculatorField id="ocr-draft-volume" label="Volume (lots)" error={touched ? issues.volume : undefined}>
              {(props) => (
                <Input
                  {...props}
                  value={draft.volume ?? ""}
                  onChange={(event) => set("volume", event.target.value)}
                  inputMode="decimal"
                  placeholder="—"
                />
              )}
            </CalculatorField>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-4 px-5 py-4">
            <p className="ledger-label">Risk management</p>
            <CalculatorField id="ocr-draft-sl" label="Stop loss" hint="Optional" error={touched ? issues.stopLoss : undefined}>
              {(props) => <Input {...props} {...priceProps("stopLoss")} />}
            </CalculatorField>
            <CalculatorField id="ocr-draft-tp" label="Take profit" hint="Optional" error={touched ? issues.takeProfit : undefined}>
              {(props) => <Input {...props} {...priceProps("takeProfit")} />}
            </CalculatorField>
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">Risk / Reward</p>
              <p
                className={cn(
                  "font-mono text-sm font-semibold tabular-nums",
                  riskReward.label === null && "text-muted-foreground/60",
                )}
                data-testid="ocr-draft-rr"
              >
                {riskReward.label ?? "—"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-4 px-5 py-4">
            <p className="ledger-label">Result</p>
            <CalculatorField id="ocr-draft-pnl" label="P&L" hint="Signed" error={touched ? issues.profitLoss : undefined}>
              {(props) => (
                <Input
                  {...props}
                  value={draft.profitLoss ?? ""}
                  onChange={(event) => set("profitLoss", event.target.value)}
                  inputMode="decimal"
                  placeholder="e.g. 146.80 or -52.10"
                />
              )}
            </CalculatorField>
            <CalculatorField id="ocr-draft-currency" label="Currency" error={touched ? issues.currency : undefined}>
              {(props) => (
                <Input
                  {...props}
                  value={draft.currency ?? ""}
                  onChange={(event) => set("currency", event.target.value.toUpperCase())}
                  maxLength={3}
                  placeholder="USD"
                />
              )}
            </CalculatorField>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardContent className="grid gap-4 px-5 py-4 md:grid-cols-2">
            <p className="ledger-label md:col-span-2">Timing</p>
            <CalculatorField id="ocr-draft-open" label="Open time" error={touched ? issues.openTime : undefined}>
              {(props) => (
                <Input
                  {...props}
                  type="datetime-local"
                  className={cn(props.className, "font-mono")}
                  value={draft.openTime !== null ? isoToLocalInput(draft.openTime) : ""}
                  onChange={(event) =>
                    set("openTime", event.target.value === "" ? null : localInputToISO(event.target.value))
                  }
                />
              )}
            </CalculatorField>
            <CalculatorField id="ocr-draft-close" label="Close time" hint="Optional" error={touched ? issues.closeTime : undefined}>
              {(props) => (
                <Input
                  {...props}
                  type="datetime-local"
                  className={cn(props.className, "font-mono")}
                  value={draft.closeTime !== null ? isoToLocalInput(draft.closeTime) : ""}
                  onChange={(event) =>
                    set("closeTime", event.target.value === "" ? null : localInputToISO(event.target.value))
                  }
                />
              )}
            </CalculatorField>
            <CalculatorField id="ocr-draft-position" label="Position ID" hint="Optional" error={touched ? issues.positionId : undefined}>
              {(props) => (
                <Input
                  {...props}
                  value={draft.positionId ?? ""}
                  onChange={(event) => set("positionId", event.target.value)}
                  placeholder="—"
                />
              )}
            </CalculatorField>
            <CalculatorField id="ocr-draft-order" label="Order ID" hint="Optional" error={touched ? issues.orderId : undefined}>
              {(props) => (
                <Input
                  {...props}
                  value={draft.orderId ?? ""}
                  onChange={(event) => set("orderId", event.target.value)}
                  placeholder="—"
                />
              )}
            </CalculatorField>
          </CardContent>
        </Card>
      </div>

      <SuggestionsStrip draft={draft} onApply={(key, value) => set(key, value as never)} />

      <WarningsPanel warnings={warnings} />

      {touched && issueCount > 0 ? (
        <p role="alert" className="text-xs text-loss" data-testid="ocr-draft-error-summary">
          {issueCount} field{issueCount > 1 ? "s" : ""} need{issueCount > 1 ? "" : "s"} attention
          before this draft can be imported.
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <Button variant="ghost" size="sm" onClick={onBack} disabled={goingBack} data-testid="ocr-back-to-fields">
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to Fields
        </Button>
        <Button
          onClick={() => {
            setTouched(true);
            if (Object.keys(validateDraftFields(draft)).length === 0) {
              onReady();
            }
          }}
          disabled={saving || !symbolOk}
          data-testid="ocr-ready-import"
        >
          <ListChecks className="size-4" aria-hidden />
          {saving ? "Saving draft…" : "Ready to Import"}
        </Button>
      </div>
    </div>
  );
}

// ── V2 — suggestions (corrections memory + instrument catalog) ─────────────

const SUGGESTION_FIELDS: Array<keyof TradeDraftInput> = [
  "symbol",
  "volume",
  "entryPrice",
  "exitPrice",
  "stopLoss",
  "takeProfit",
  "profitLoss",
  "currency",
];

/**
 * V2 — the user's own correction history surfaces as chips: every value
 * Cosmoz has seen the user correct before becomes a one-click fill. Values
 * come from the corrections memory (CORRECTIONS_MEMORY) or the instrument
 * catalog (INSTRUMENT_CATALOG symbol recovery) — never invented.
 */
function SuggestionsStrip({
  draft,
  onApply,
}: {
  draft: TradeDraftInput;
  onApply: (key: keyof TradeDraftInput, value: string) => void;
}) {
  const suggestionsQuery = useRecognitionSuggestions(draft.symbol, draft.symbol.trim().length >= 2);
  const suggestions = suggestionsQuery.data?.suggestions ?? [];
  const symbolCandidates = suggestionsQuery.data?.symbolCandidates ?? [];
  // V3 — deterministic strategy/playbook matches (spec §38–§40): equality
  // matches against the EXISTING strategy catalog. Suggestions only — a
  // chip click notes the match, it never auto-assigns anything.
  const strategyMatches = suggestionsQuery.data?.strategyMatches ?? [];
  const relevant = suggestions.filter(
    (suggestion) =>
      SUGGESTION_FIELDS.includes(suggestion.field as keyof TradeDraftInput) &&
      suggestion.values.length > 0,
  );
  if (relevant.length === 0 && symbolCandidates.length === 0 && strategyMatches.length === 0) {
    return null;
  }

  return (
    <Card data-testid="ocr-suggestions">
      <CardContent className="space-y-2.5 px-5 py-4">
        <p className="flex items-center gap-1.5 ledger-label">
          <Lightbulb className="size-3.5 text-warning" aria-hidden />
          Suggestions from your correction history
        </p>
        <div className="flex flex-wrap gap-1.5">
          {relevant.map((suggestion) =>
            suggestion.values.map((value) => (
              <button
                key={`${suggestion.field}-${value.value}`}
                type="button"
                onClick={() => onApply(suggestion.field as keyof TradeDraftInput, value.value)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] transition-colors hover:border-accent/50 hover:bg-accent/5"
              >
                <span className="text-muted-foreground">{FIELD_LABELS[suggestion.field]}:</span>
                <span className="font-mono font-semibold">{value.value}</span>
                {value.count > 1 ? (
                  <span className="font-mono text-[9px] text-muted-foreground">×{value.count}</span>
                ) : null}
              </button>
            )),
          )}
          {symbolCandidates.map((candidate) => (
            <button
              key={candidate.symbol}
              type="button"
              onClick={() => onApply("symbol", candidate.symbol)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] transition-colors hover:border-accent/50 hover:bg-accent/5"
            >
              <span className="text-muted-foreground">Symbol:</span>
              <span className="font-mono font-semibold">{candidate.symbol}</span>
              <span className="text-[9px] text-muted-foreground">{candidate.assetClass}</span>
            </button>
          ))}
          {strategyMatches.map((match) => (
            <button
              key={match.strategyId}
              type="button"
              title={match.reasons.join(" · ")}
              data-testid="ocr-strategy-chip"
              onClick={() =>
                toast.info(`Strategy match: ${match.name}`, {
                  description: "This import matches one of your saved strategies — mention it in the trade notes when you review it in the journal.",
                })
              }
              className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/5 px-2.5 py-1 text-[11px] transition-colors hover:border-accent hover:bg-accent/10"
            >
              <BookOpen className="size-3 text-accent" aria-hidden />
              <span className="text-muted-foreground">Strategy:</span>
              <span className="font-semibold">{match.name}</span>
              <span className="font-mono text-[9px] text-muted-foreground">{Math.round(match.confidence)}%</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Learned from values you corrected on earlier imports — apply one with a click.
          {strategyMatches.length > 0 ? " Strategy matches come from your saved playbooks." : ""}
        </p>
      </CardContent>
    </Card>
  );
}

// ── Confirmation (§28) ──────────────────────────────────────────────────────

export function ConfirmImport({
  draft,
  onBack,
  onConfirm,
  confirming = false,
  tradeIndex = 1,
  tradeCount = 1,
  draftedCount = 1,
}: {
  draft: TradeDraftInput;
  onBack: () => void;
  /** scope: THIS trade only, or every drafted trade of the job (V2 batch). */
  onConfirm: (scope: { all: boolean; accountId?: string }) => void;
  confirming?: boolean;
  tradeIndex?: number;
  tradeCount?: number;
  draftedCount?: number;
}) {
  const accountsQuery = useTradingAccounts();
  const accounts = accountsQuery.data?.accounts ?? [];
  const [accountId, setAccountId] = React.useState<string>("");
  const multi = tradeCount > 1 || draftedCount > 1;
  return (
    <div className="mx-auto max-w-md space-y-5" data-testid="ocr-confirm">
      <div className="text-center">
        <h2 className="text-lg font-semibold tracking-[-0.01em]">Ready to import</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          One last look — the confirmed trade lands in your journal.
        </p>
      </div>

      {multi ? (
        <p className="text-center font-mono text-[11px] text-muted-foreground" data-testid="ocr-confirm-trade-meta">
          Trade #{tradeIndex} of {tradeCount} detected · {draftedCount} drafted
        </p>
      ) : null}

      <Card>
        <CardContent className="space-y-2 px-5 py-4">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <span className="font-mono text-base font-semibold tracking-wide" data-testid="ocr-confirm-symbol">
              {draft.symbol}
            </span>
            <span
              className={cn(
                "inline-flex items-center rounded border px-2 py-0.5 font-mono text-[11px] font-semibold",
                draft.direction === "BUY"
                  ? "border-profit/40 bg-profit/10 text-profit"
                  : "border-loss/40 bg-loss/10 text-loss",
              )}
            >
              {draft.direction}
            </span>
          </div>
          <ConfirmRow label="Volume" value={formatVolume(draft.volume)} />
          <ConfirmRow label="Entry" value={formatPrice(draft.entryPrice)} />
          <ConfirmRow label="Exit" value={formatPrice(draft.exitPrice)} />
          <ConfirmRow
            label="P&L"
            value={formatProfitLoss(draft.profitLoss, draft.currency)}
            negative={
              draft.profitLoss !== null && isNegativeAmount(draft.profitLoss)
            }
            emphasize
          />
          <ConfirmRow label="Open time" value={formatDateTime(draft.openTime)} />
        </CardContent>
      </Card>

      {accounts.length > 0 ? (
        <div className="space-y-1.5" data-testid="ocr-confirm-account">
          <p className="flex items-center gap-1.5 ledger-label">
            <Wallet className="size-3.5 text-muted-foreground" aria-hidden />
            Destination account
          </p>
          <Select
            value={accountId === "" ? undefined : accountId}
            onValueChange={(value) => setAccountId(value)}
          >
            <SelectTrigger aria-label="Destination account" className="h-9 text-sm">
              <SelectValue placeholder="Default account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name} · {account.broker}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            Leave unset to use your default account.
          </p>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} disabled={confirming} data-testid="ocr-back-to-review">
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to Review
        </Button>
        <div className="flex items-center gap-2">
          {multi ? (
            <Button
              variant="outline"
              onClick={() => onConfirm({ all: true, accountId: accountId === "" ? undefined : accountId })}
              disabled={confirming}
              data-testid="ocr-confirm-import-all"
            >
              <CheckCircle2 className="size-4" aria-hidden />
              {confirming ? "Importing…" : `Import All Drafted (${draftedCount})`}
            </Button>
          ) : null}
          <Button
            onClick={() => onConfirm({ all: false, accountId: accountId === "" ? undefined : accountId })}
            disabled={confirming}
            data-testid="ocr-confirm-import"
          >
            <CheckCircle2 className="size-4" aria-hidden />
            {confirming ? "Importing…" : multi ? "Import This Trade" : "Confirm & Import"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ConfirmRow({
  label,
  value,
  negative = false,
  emphasize = false,
}: {
  label: string;
  value: string;
  negative?: boolean;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-mono text-sm tabular-nums",
          negative && "text-loss",
          emphasize && !negative && value !== "—" && "text-profit",
          emphasize && "font-semibold",
        )}
      >
        {value}
      </span>
    </div>
  );
}

// ── Success (§29) ───────────────────────────────────────────────────────────

export function ImportSuccess({
  tradeId,
  tradeCount = 1,
  onViewTrade,
  onImportAnother,
}: {
  tradeId: string;
  tradeCount?: number;
  onViewTrade: () => void;
  onImportAnother: () => void;
}) {
  const multi = tradeCount > 1;
  return (
    <div className="mx-auto max-w-md space-y-5 py-6 text-center" data-testid="ocr-success">
      <span className="mx-auto flex size-14 items-center justify-center rounded-full border border-profit/40 bg-profit/10">
        <CheckCircle2 className="size-7 text-profit" aria-hidden />
      </span>
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold tracking-[-0.01em]">
          {multi ? `${tradeCount} trades imported successfully` : "Trade imported successfully"}
        </h2>
        <p className="font-mono text-xs text-muted-foreground">
          Journal reference {tradeId}
        </p>
        <p className="text-xs text-muted-foreground">
          The recognized screenshot stays attached to this import so you can always trace the
          numbers back to their source.
        </p>
      </div>
      <div className="flex items-center justify-center gap-2">
        <Button variant="outline" onClick={onImportAnother} data-testid="ocr-import-another">
          <PencilLine className="size-4" aria-hidden />
          Import Another
        </Button>
        <Button onClick={onViewTrade} data-testid="ocr-view-trade">
          View Trade
        </Button>
      </div>
    </div>
  );
}
