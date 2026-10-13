"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { AlertTriangle, CheckCircle2, FileUp, Loader2, Minimize2, Upload } from "lucide-react";
import { toast } from "sonner";
import type { CsvBroker, CsvImportPreviewResponse } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiErrorMessage } from "@/lib/api/client";
import { useAccounts, useCommitCsvImport, usePreviewCsv, useStrategies } from "@/lib/api/queries";
import { cn } from "@/lib/utils";

/**
 * Broker CSV import (Phase 10) — two-phase flow mirroring the API contract:
 * preview (parse + validate + dedupe, row-level issues visible) then commit
 * (staged batch imported with broker-reported P&L kept verbatim). The UI
 * never parses the file itself; the preview table IS the server's answer.
 */

const BROKERS: { value: CsvBroker; label: string; hint: string }[] = [
  { value: "MT4", label: "MetaTrader 4", hint: "Account history export (Ticket, Open Time, Type, …)" },
  { value: "MT5", label: "MetaTrader 5", hint: "Position-style history export" },
  { value: "DERIV", label: "Deriv", hint: "Statement CSV export" },
  { value: "GENERIC", label: "Generic CSV", hint: "Any file with a header row — columns are sniffed" },
];

const PREVIEW_ROW_LIMIT = 60;

const signedMoney = (value: string): string => {
  const amount = Number(value);
  if (Number.isNaN(amount)) return value;
  const sign = amount > 0 ? "+" : amount < 0 ? "−" : "";
  return `${sign}${Math.abs(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

function SummaryStamp({
  count,
  label,
  tone,
}: {
  count: number;
  label: string;
  tone: "ok" | "warn" | "error" | "ink";
}) {
  const toneClass =
    tone === "ok" ? "text-profit" : tone === "warn" ? "text-warning" : tone === "error" ? "text-loss" : "text-muted-foreground";
  return (
    <span className={cn("stamp", toneClass)}>
      {count} {label}
    </span>
  );
}

export function CsvImportCard() {
  const [broker, setBroker] = React.useState<CsvBroker>("MT5");
  const [hasHeader, setHasHeader] = React.useState(true);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [rawCsv, setRawCsv] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<CsvImportPreviewResponse | null>(null);
  const [accountId, setAccountId] = React.useState<string>("");
  const [strategyId, setStrategyId] = React.useState<string>("none");

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const previewCsv = usePreviewCsv();
  const commit = useCommitCsvImport();
  const accounts = useAccounts();
  const strategies = useStrategies();

  // Default the account once the list arrives — "adjusting state during
  // render" (React docs) instead of an effect-based setState.
  const defaultAccount =
    accounts.data?.accounts.find((account) => account.isDefault) ?? accounts.data?.accounts[0];
  if (accountId === "" && defaultAccount !== undefined) {
    setAccountId(defaultAccount.id);
  }

  const onPickFile = async (file: File) => {
    const text = await file.text();
    setFileName(file.name);
    setRawCsv(text);
    setPreview(null);
  };

  const onAnalyze = async () => {
    if (rawCsv === null) return;
    try {
      const result = await previewCsv.mutateAsync({ csv: rawCsv, broker, hasHeader });
      setPreview(result);
    } catch (error) {
      setPreview(null);
      toast.error("Preview failed", {
        description: apiErrorMessage(error, "The file could not be parsed — check the broker format."),
      });
    }
  };

  const onCommit = async () => {
    if (preview === null || accountId === "") return;
    try {
      const result = await commit.mutateAsync({
        batchId: preview.batchId,
        accountId,
        strategyId: strategyId === "none" ? null : strategyId,
      });
      toast.success("Import complete", {
        description: `${result.imported} trade${result.imported === 1 ? "" : "s"} imported${
          result.instrumentsCreated > 0
            ? `, ${result.instrumentsCreated} new instrument${result.instrumentsCreated === 1 ? "" : "s"}`
            : ""
        }${result.duplicatesSkipped > 0 ? `, ${result.duplicatesSkipped} duplicate${result.duplicatesSkipped === 1 ? "" : "s"} skipped` : ""}.`,
      });
      setPreview(null);
      setRawCsv(null);
      setFileName(null);
    } catch (error) {
      toast.error("Import failed", {
        description: apiErrorMessage(error, "The batch could not be committed — preview the file again."),
      });
    }
  };

  const busy = previewCsv.isPending || commit.isPending;
  const reduceMotion = useReducedMotion() ?? false;
  const importableCount = preview?.importable ?? 0;
  const shownRows = preview?.rows.slice(0, PREVIEW_ROW_LIMIT) ?? [];
  const hiddenRowCount = preview !== null ? Math.max(0, preview.rows.length - PREVIEW_ROW_LIMIT) : 0;

  return (
    <Card className="mx-auto w-full max-w-3xl bg-surface">
      <CardHeader>
        <CardTitle className="font-heading">Import broker CSV</CardTitle>
        <CardDescription>
          Bring your broker history into the journal — trades are deduplicated by ticket, P&L is
          kept as the broker reported it. Balance/credit rows are ignored; times are read as UTC.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* ── Step 1: source ── */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="csv-broker" className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
              Broker format
            </Label>
            <Select value={broker} onValueChange={(value) => { setBroker(value as CsvBroker); setPreview(null); }}>
              <SelectTrigger id="csv-broker" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BROKERS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] leading-snug text-muted-foreground">
              {BROKERS.find((option) => option.value === broker)?.hint}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="csv-file" className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
              File (.csv, ≤ 2 MB)
            </Label>
            <Input
              id="csv-file"
              type="file"
              accept=".csv,text/csv,text/plain"
              ref={fileInputRef}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file !== undefined) void onPickFile(file);
                event.target.value = "";
              }}
              className="cursor-pointer file:mr-3 file:border-0 file:bg-transparent file:font-mono file:text-xs file:uppercase file:tracking-[0.06em] file:text-muted-foreground"
            />
            {fileName !== null ? (
              <p className="truncate font-mono text-[11px] text-muted-foreground">{fileName}</p>
            ) : null}
          </div>
        </div>

        {/* Paste fallback — some brokers only copy/paste out of a web view. */}
        <details className="group">
          <summary className="flex w-fit cursor-pointer items-center gap-1.5 text-xs text-muted-foreground outline-none hover:text-foreground">
            <FileUp className="size-3.5" aria-hidden="true" />
            or paste CSV text
          </summary>
          <Textarea
            rows={4}
            placeholder="Ticket,Open Time,Type,Size,Symbol,Open Price,…"
            onChange={(event) => {
              const value = event.target.value;
              setRawCsv(value === "" ? null : value);
              if (value !== "") setFileName(null);
              setPreview(null);
            }}
            className="mt-2 font-mono text-xs"
            defaultValue={rawCsv !== null && fileName === null ? rawCsv : ""}
          />
        </details>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="csv-header"
              checked={hasHeader}
              onCheckedChange={(checked) => {
                setHasHeader(checked === true);
                setPreview(null);
              }}
            />
            <Label htmlFor="csv-header" className="text-xs text-muted-foreground">
              First line is a header row
            </Label>
          </div>
          <Button onClick={() => void onAnalyze()} disabled={rawCsv === null || busy} className="gap-2">
            {previewCsv.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Minimize2 className="size-4" aria-hidden="true" />
            )}
            Analyze file
          </Button>
        </div>

        {/* ── Step 2: preview — one authored entrance (fade + 8px rise) ── */}
        {preview !== null ? (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-4 rounded-lg border border-border bg-surface-raised/40 p-4"
          >
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <p className="font-mono text-xs tabular-nums text-muted-foreground">
                {preview.detected.broker} · “{preview.detected.delimiter}” · {preview.detected.rowCount} rows
                {preview.detected.dateRange.from !== null
                  ? ` · ${preview.detected.dateRange.from} → ${preview.detected.dateRange.to}`
                  : ""}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <SummaryStamp count={preview.importable} label="importable" tone="ok" />
                {preview.duplicates > 0 ? <SummaryStamp count={preview.duplicates} label="dup" tone="ink" /> : null}
                {preview.skipped > 0 ? <SummaryStamp count={preview.skipped} label="error" tone="error" /> : null}
              </div>
            </div>

            <div className="max-h-72 overflow-auto rounded-md border border-border bg-surface">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 z-10 bg-surface shadow-[0_1px_0_0_var(--border)]">
                  <tr className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Symbol</th>
                    <th className="px-3 py-2 font-medium">Side</th>
                    <th className="px-3 py-2 text-right font-medium">Volume</th>
                    <th className="px-3 py-2 font-medium">Opened</th>
                    <th className="px-3 py-2 text-right font-medium">P&amp;L</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shownRows.map((row) => (
                    <tr
                      key={row.index}
                      className={cn(
                        "border-t border-border/60",
                        (row.status === "ERROR" || row.duplicate) && "opacity-45",
                      )}
                    >
                      <td className="px-3 py-1.5 font-mono tabular-nums text-muted-foreground">{row.index + 1}</td>
                      <td className="px-3 py-1.5 font-mono">{row.symbol}</td>
                      <td className="px-3 py-1.5">{row.direction ?? "—"}</td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums">{row.quantity ?? "—"}</td>
                      <td className="px-3 py-1.5 font-mono tabular-nums">{row.entryAt?.slice(0, 16).replace("T", " ") ?? "—"}</td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                        {row.pnlNet !== null ? signedMoney(row.pnlNet) : "—"}
                      </td>
                      <td className="px-3 py-1.5">
                        {row.status === "OK" && !row.duplicate ? (
                          <CheckCircle2 className="size-3.5 text-profit" aria-label="OK" />
                        ) : row.status === "OK" && row.duplicate ? (
                          <span className="stamp stamp-ink">dup</span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 text-warning"
                            title={row.issues.join(" · ")}
                          >
                            <AlertTriangle className="size-3.5" aria-hidden="true" />
                            <span className="max-w-[16rem] truncate">{row.issues[0] ?? "review"}</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {hiddenRowCount > 0 ? (
              <p className="font-mono text-[11px] text-muted-foreground">
                + {hiddenRowCount} more rows — all will be imported.
              </p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="csv-account" className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  Target account
                </Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger id="csv-account" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(accounts.data?.accounts ?? []).map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="csv-strategy" className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  Link to playbook (optional)
                </Label>
                <Select value={strategyId} onValueChange={setStrategyId}>
                  <SelectTrigger id="csv-strategy" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Out of playbook</SelectItem>
                    {(strategies.data?.strategies ?? []).map((strategy) => (
                      <SelectItem key={strategy.id} value={strategy.id}>
                        {strategy.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => void onCommit()} disabled={importableCount === 0 || busy} className="gap-2">
                {commit.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Upload className="size-4" aria-hidden="true" />
                )}
                Import {importableCount} trade{importableCount === 1 ? "" : "s"}
              </Button>
            </div>
          </motion.div>
        ) : null}
      </CardContent>
    </Card>
  );
}
