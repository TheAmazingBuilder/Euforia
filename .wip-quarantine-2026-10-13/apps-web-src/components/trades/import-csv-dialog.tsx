"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  CheckCircle2,
  FileUp,
  Link2,
  Loader2,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import type { CreateTradeInput, ExitReason } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  parseCsv,
  parseDirection,
  parseFlexibleDate,
  parsePositiveNumber,
  type ParsedCsv,
} from "@/lib/csv";
import {
  useAccounts,
  useCreateTrade,
  useInstruments,
  useStrategies,
} from "@/lib/api/queries";
import { useSelectedAccount } from "@/lib/hooks/use-selected-account";
import { apiErrorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";

/**
 * Trade CSV import (client-side): parse → map columns → validate row by row
 * → preview → sequential POST /trades with live progress. The server
 * recomputes every P&L / R (§15) — the CSV only carries the capture fields.
 */

type FieldKey =
  | "symbol"
  | "direction"
  | "entryPrice"
  | "entryAt"
  | "quantity"
  | "exitPrice"
  | "exitAt"
  | "exitReason"
  | "initialStop"
  | "initialTP"
  | "fees"
  | "strategy"
  | "notes"
  | "externalRef";

interface FieldMeta {
  label: string;
  required: boolean;
  aliases: string[];
}

const FIELDS: Record<FieldKey, FieldMeta> = {
  symbol: { label: "Symbol", required: true, aliases: ["symbol", "instrument", "ticker", "pair", "market"] },
  direction: { label: "Direction", required: true, aliases: ["direction", "side", "type", "buy_sell"] },
  entryPrice: { label: "Entry price", required: true, aliases: ["entry_price", "entry", "entryprice", "open_price", "price_in"] },
  entryAt: { label: "Entry time", required: true, aliases: ["entry_time", "entry_at", "date", "open_time", "open_date", "datetime", "time"] },
  quantity: { label: "Quantity", required: true, aliases: ["quantity", "qty", "size", "volume", "lots", "amount"] },
  exitPrice: { label: "Exit price", required: false, aliases: ["exit_price", "exit", "close_price", "price_out", "exitprice"] },
  exitAt: { label: "Exit time", required: false, aliases: ["exit_time", "exit_at", "close_time", "close_date", "exitdate"] },
  exitReason: { label: "Exit reason", required: false, aliases: ["exit_reason", "reason", "close_reason"] },
  initialStop: { label: "Initial stop", required: false, aliases: ["initial_stop", "stop", "stop_loss", "sl"] },
  initialTP: { label: "Initial target", required: false, aliases: ["initial_tp", "tp", "take_profit", "target"] },
  fees: { label: "Fees", required: false, aliases: ["fees", "commission", "commissions", "fee"] },
  strategy: { label: "Strategy", required: false, aliases: ["strategy", "strategy_name", "setup", "playbook"] },
  notes: { label: "Notes", required: false, aliases: ["notes", "note", "comment", "comments", "journal"] },
  externalRef: { label: "External ref", required: false, aliases: ["external_ref", "ref", "ticket", "order_id", "trade_id", "id"] },
};

const FIELD_ORDER = Object.keys(FIELDS) as FieldKey[];

/** Exit reasons accepted straight from the CSV; anything else → MANUAL. */
const EXIT_REASONS: ReadonlySet<string> = new Set(["TP", "SL", "MANUAL", "TRAILING", "PARTIAL", "MARGIN"]);

const TEMPLATE_CSV = `symbol,direction,entry_time,entry_price,quantity,exit_time,exit_price,initial_stop,initial_tp,fees,strategy,notes
EURUSD,BUY,2026-09-01T08:30:00Z,1.0845,0.32,2026-09-01T10:12:00Z,1.0892,1.0810,1.0920,2.4,Example breakout setup,Clean breakout retest
XAUUSD,SELL,2026-09-02T14:05:00Z,2387.4,1,2026-09-02T15:40:00Z,2380.1,2392.8,2372,3.1,,Manual fade at resistance`;

type Step = "select" | "map" | "review" | "importing" | "done";

interface MappedRow {
  index: number;
  input: CreateTradeInput | null;
  error: string | null;
}

interface ImportState {
  fileName: string;
  parsed: ParsedCsv;
  mapping: Record<FieldKey, number>; // field → column index (-1 = unmapped)
}

function autoMap(header: string[]): Record<FieldKey, number> {
  const normalized = header.map((cell) => cell.toLowerCase().replace(/[\s\-.]+/g, "_").replace(/[^a-z0-9_]/g, ""));
  const mapping = {} as Record<FieldKey, number>;
  for (const key of FIELD_ORDER) {
    const aliases = FIELDS[key].aliases;
    let found = normalized.findIndex((cell) => aliases.includes(cell));
    if (found === -1) {
      found = normalized.findIndex((cell) => aliases.some((alias) => cell.includes(alias)));
    }
    mapping[key] = found;
  }
  return mapping;
}

function buildTemplateDownload() {
  const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "cosmoz-import-template.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ImportCsvDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const instruments = useInstruments();
  const strategies = useStrategies();
  const accounts = useAccounts();
  const createTrade = useCreateTrade();

  const [step, setStep] = React.useState<Step>("select");
  const [state, setState] = React.useState<ImportState | null>(null);
  const [rows, setRows] = React.useState<MappedRow[]>([]);
  const [progress, setProgress] = React.useState({ done: 0, total: 0 });
  const [failures, setFailures] = React.useState<{ index: number; reason: string }[]>([]);

  const reset = React.useCallback(() => {
    setStep("select");
    setState(null);
    setRows([]);
    setProgress({ done: 0, total: 0 });
    setFailures([]);
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const loadFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.header.length < 2 || parsed.rows.length === 0) {
      toast.error("Unreadable CSV", {
        description: "The file needs a header row and at least one data row.",
      });
      return;
    }
    setState({ fileName: file.name, parsed, mapping: autoMap(parsed.header) });
    setRows([]);
    setStep("map");
  };

  // Multi-portfolio: rows land on the ACTIVE desk (topbar switcher), not a silent first account.
  const { account: activeAccount } = useSelectedAccount();
  const accountId =
    activeAccount?.id ??
    accounts.data?.accounts.find((account) => account.isDefault)?.id ??
    accounts.data?.accounts[0]?.id ??
    null;
  const missingRequired =
    state === null ||
    accountId === null ||
    FIELD_ORDER.some((key) => FIELDS[key].required && state.mapping[key] === -1);

  // ── Mapping → validated rows ──
  const validateRows = React.useCallback(() => {
    if (state === null || accountId === null) return;
    const instrumentList = instruments.data?.instruments ?? [];
    const strategyList = strategies.data?.strategies ?? [];
    const { parsed, mapping } = state;

    const built: MappedRow[] = parsed.rows.map((cells, index) => {
      const cell = (key: FieldKey): string => {
        const column = mapping[key];
        return column >= 0 ? (cells[column] ?? "") : "";
      };
      const fail = (reason: string): MappedRow => ({ index, input: null, error: reason });

      const symbolRaw = cell("symbol");
      const symbolKey = symbolRaw.replace(/[^a-z0-9]/gi, "").toUpperCase();
      const instrument = instrumentList.find(
        (item) => item.symbol.replace(/[^a-z0-9]/gi, "").toUpperCase() === symbolKey,
      );
      if (symbolRaw === "") return fail("Missing symbol");
      if (instrument === undefined) return fail(`Unknown symbol "${symbolRaw}"`);

      const direction = parseDirection(cell("direction"));
      if (direction === null) return fail(`Unreadable direction "${cell("direction")}"`);

      const entryPrice = parsePositiveNumber(cell("entryPrice"));
      if (entryPrice === null) return fail(`Invalid entry price "${cell("entryPrice")}"`);

      const entryAt = parseFlexibleDate(cell("entryAt"));
      if (entryAt === null) return fail(`Unreadable entry time "${cell("entryAt")}"`);

      const quantity = parsePositiveNumber(cell("quantity"));
      if (quantity === null) return fail(`Invalid quantity "${cell("quantity")}"`);

      const exitPriceRaw = cell("exitPrice");
      const exitPrice = exitPriceRaw === "" ? null : parsePositiveNumber(exitPriceRaw);
      if (exitPriceRaw !== "" && exitPrice === null) return fail(`Invalid exit price "${exitPriceRaw}"`);

      const exitAtRaw = cell("exitAt");
      const exitAt = exitAtRaw === "" ? null : parseFlexibleDate(exitAtRaw);
      if (exitAtRaw !== "" && exitAt === null) return fail(`Unreadable exit time "${exitAtRaw}"`);
      if (exitPrice !== null && exitAt === null) return fail("Exit price without exit time");
      if (exitAt !== null && exitAt < entryAt) return fail("Exit time before entry time");

      const stopRaw = cell("initialStop");
      const initialStop = stopRaw === "" ? undefined : parsePositiveNumber(stopRaw);
      if (stopRaw !== "" && initialStop === undefined) return fail(`Invalid stop "${stopRaw}"`);

      const tpRaw = cell("initialTP");
      const initialTP = tpRaw === "" ? undefined : parsePositiveNumber(tpRaw);
      if (tpRaw !== "" && initialTP === undefined) return fail(`Invalid target "${tpRaw}"`);

      const feesRaw = cell("fees");
      const fees = feesRaw === "" ? undefined : parsePositiveNumber(feesRaw);
      if (feesRaw !== "" && fees === undefined) return fail(`Invalid fees "${feesRaw}"`);

      const strategyRaw = cell("strategy");
      const strategy = strategyRaw
        ? strategyList.find((item) => item.name.toLowerCase() === strategyRaw.trim().toLowerCase())
        : undefined;
      if (strategyRaw && strategy === undefined) {
        return fail(`Unknown strategy "${strategyRaw}" — add it to the playbook first`);
      }

      const exitReasonRaw = cell("exitReason").trim().toUpperCase();
      const exitReason: ExitReason = EXIT_REASONS.has(exitReasonRaw)
        ? (exitReasonRaw as ExitReason)
        : "MANUAL";

      const notes = cell("notes");
      const externalRef = cell("externalRef") || `csv:${state.fileName}:${index + 2}`;

      const input: CreateTradeInput =
        exitPrice !== null && exitAt !== null
          ? {
              variant: "closed",
              accountId,
              instrumentId: instrument.id,
              direction,
              entryPrice: String(entryPrice),
              entryAt,
              size: { mode: "quantity", quantity: String(quantity) },
              exitPrice: String(exitPrice),
              exitAt,
              exitReason,
              ...(initialStop !== undefined ? { initialStop: String(initialStop) } : {}),
              ...(initialTP !== undefined ? { initialTP: String(initialTP) } : {}),
              ...(fees !== undefined ? { fees: String(fees) } : {}),
              ...(strategy !== undefined ? { strategyId: strategy.id } : { outOfPlaybook: true }),
              ...(notes ? { reason: notes } : {}),
              externalRef,
            }
          : {
              variant: "open",
              accountId,
              instrumentId: instrument.id,
              direction,
              entryPrice: String(entryPrice),
              entryAt,
              size: { mode: "quantity", quantity: String(quantity) },
              ...(initialStop !== undefined ? { initialStop: String(initialStop) } : {}),
              ...(initialTP !== undefined ? { initialTP: String(initialTP) } : {}),
              ...(fees !== undefined ? { fees: String(fees) } : {}),
              ...(strategy !== undefined ? { strategyId: strategy.id } : { outOfPlaybook: true }),
              ...(notes ? { reason: notes } : {}),
              externalRef,
            };

      return { index, input, error: null };
    });
    setRows(built);
  }, [state, accountId, instruments.data, strategies.data]);

  const onEnterReview = () => {
    if (missingRequired) return;
    validateRows();
    setStep("review");
  };

  const validRows = rows.filter((row) => row.input !== null);
  const invalidRows = rows.filter((row) => row.error !== null);

  // ── Import loop ──
  const runImport = async () => {
    if (validRows.length === 0) return;
    setStep("importing");
    setProgress({ done: 0, total: validRows.length });
    const failed: { index: number; reason: string }[] = [];
    for (let index = 0; index < validRows.length; index += 1) {
      const row = validRows[index]!;
      try {
        await createTrade.mutateAsync(row.input!);
      } catch (error) {
        failed.push({ index: row.index, reason: apiErrorMessage(error, "Server rejected the row") });
      }
      setProgress({ done: index + 1, total: validRows.length });
    }
    setFailures(failed);
    if (failed.length === 0) {
      toast.success("Import complete", { description: `${validRows.length} trades added to the journal` });
    } else {
      toast.warning("Import finished with errors", {
        description: `${validRows.length - failed.length} imported · ${failed.length} failed`,
      });
    }
    setStep("done");
  };

  const pct = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg font-semibold">Import trades from CSV</DialogTitle>
          <DialogDescription>
            Parse, map, validate — then push to the journal. P&L and R are recomputed by the
            server from prices, stops and sizes.
          </DialogDescription>
        </DialogHeader>

        {step === "select" ? (
          <div className="space-y-4">
            <label
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-surface-raised/40 px-6 py-10 text-center transition-colors hover:border-accent/60 hover:bg-accent/5"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files[0];
                if (file) void loadFile(file);
              }}
            >
              <FileUp className="size-8 text-accent" aria-hidden="true" />
              <span className="text-sm font-medium">Drop a .csv file here, or click to browse</span>
              <span className="text-xs text-muted-foreground">
                Comma, semicolon or tab separated — header row required
              </span>
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void loadFile(file);
                }}
              />
            </label>
            <div className="rounded-lg border border-border bg-surface-raised/30 p-3 text-xs leading-relaxed text-muted-foreground">
              <p className="mb-1 font-medium text-foreground">Expected columns</p>
              <p>
                <span className="font-mono">symbol</span>,{" "}
                <span className="font-mono">direction</span> (BUY/SELL or LONG/SHORT),{" "}
                <span className="font-mono">entry_time</span>,{" "}
                <span className="font-mono">entry_price</span>,{" "}
                <span className="font-mono">quantity</span> — plus optional{" "}
                <span className="font-mono">exit_time</span>,{" "}
                <span className="font-mono">exit_price</span>,{" "}
                <span className="font-mono">initial_stop</span>,{" "}
                <span className="font-mono">initial_tp</span>,{" "}
                <span className="font-mono">fees</span>,{" "}
                <span className="font-mono">strategy</span>,{" "}
                <span className="font-mono">notes</span>. Dates accept ISO or dd/mm/yyyy.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={buildTemplateDownload}>
              <Link2 className="size-3.5" aria-hidden="true" />
              Download the template
            </Button>
          </div>
        ) : null}

        {step === "map" && state !== null ? (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{state.fileName}</span> —{" "}
              {state.parsed.rows.length} rows detected. Confirm the column mapping (auto-guessed
              from headers).
            </p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {FIELD_ORDER.map((key) => {
                const meta = FIELDS[key];
                const mapped = state.mapping[key] >= 0;
                return (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs">
                      {meta.label}
                      {meta.required ? <span className="ml-1 text-loss">*</span> : null}
                    </Label>
                    <Select
                      value={String(state.mapping[key])}
                      onValueChange={(value) =>
                        setState((current) =>
                          current
                            ? {
                                ...current,
                                mapping: { ...current.mapping, [key]: Number(value) },
                              }
                            : current,
                        )
                      }
                    >
                      <SelectTrigger
                        size="sm"
                        className={cn("w-full", !mapped && meta.required && "border-loss/50")}
                      >
                        <SelectValue placeholder="Not mapped" />
                      </SelectTrigger>
                      <SelectContent>
                        {state.parsed.header.map((headerCell, columnIndex) => (
                          <SelectItem key={columnIndex} value={String(columnIndex)}>
                            {headerCell}
                            {state.parsed.rows[0]?.[columnIndex] ? (
                              <span className="ml-1 text-muted-foreground">
                                e.g. {state.parsed.rows[0]?.[columnIndex]}
                              </span>
                            ) : null}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
            <DialogFooter className="gap-2 sm:justify-between">
              <Button variant="ghost" size="sm" onClick={reset}>
                Back
              </Button>
              <Button variant="success" onClick={onEnterReview} disabled={missingRequired}>
                Validate rows
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            </DialogFooter>
          </div>
        ) : null}

        {step === "review" && state !== null ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-1.5 font-medium text-profit">
                <CheckCircle2 className="size-4" aria-hidden="true" />
                {validRows.length} ready
              </span>
              {invalidRows.length > 0 ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-loss">
                  <XCircle className="size-4" aria-hidden="true" />
                  {invalidRows.length} rejected
                </span>
              ) : null}
            </div>

            {validRows.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[420px] text-xs">
                  <caption className="sr-only">Preview of the first valid rows</caption>
                  <thead>
                    <tr className="border-b border-border bg-surface-raised/50 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-2.5 py-1.5 font-medium">Symbol</th>
                      <th className="px-2.5 py-1.5 font-medium">Side</th>
                      <th className="px-2.5 py-1.5 font-medium">Entry</th>
                      <th className="px-2.5 py-1.5 font-medium">Exit</th>
                      <th className="px-2.5 py-1.5 font-medium">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validRows.slice(0, 5).map((row) => {
                      const input = row.input!;
                      const entry = input.entryPrice;
                      const exit = input.variant === "closed" ? input.exitPrice : null;
                      const quantity = input.size.mode === "quantity" ? input.size.quantity : "?";
                      const symbol =
                        instruments.data?.instruments.find(
                          (item) => item.id === input.instrumentId,
                        )?.symbol ?? "?";
                      return (
                        <tr key={row.index} className="border-b border-border/50 last:border-0">
                          <td className="px-2.5 py-1.5 font-mono">{symbol}</td>
                          <td
                            className={cn(
                              "px-2.5 py-1.5 font-mono",
                              input.direction === "BUY" ? "text-profit" : "text-loss",
                            )}
                          >
                            {input.direction}
                          </td>
                          <td className="px-2.5 py-1.5 font-mono tabular-nums">{entry}</td>
                          <td className="px-2.5 py-1.5 font-mono tabular-nums">{exit ?? "—"}</td>
                          <td className="px-2.5 py-1.5 font-mono tabular-nums">{quantity}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}

            {invalidRows.length > 0 ? (
              <div className="space-y-1 rounded-lg border border-loss/30 bg-loss/5 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-loss">
                  <TriangleAlert className="size-3.5" aria-hidden="true" />
                  Rejected rows (fix the file or ignore them)
                </p>
                <ul className="space-y-0.5 text-xs text-muted-foreground">
                  {invalidRows.slice(0, 8).map((row) => (
                    <li key={row.index} className="font-mono">
                      row {row.index + 2}: <span className="text-foreground">{row.error}</span>
                    </li>
                  ))}
                  {invalidRows.length > 8 ? <li>… and {invalidRows.length - 8} more</li> : null}
                </ul>
              </div>
            ) : null}

            <DialogFooter className="gap-2 sm:justify-between">
              <Button variant="ghost" size="sm" onClick={() => setStep("map")}>
                Back to mapping
              </Button>
              <Button variant="success" onClick={() => void runImport()} disabled={validRows.length === 0}>
                Import {validRows.length} trade{validRows.length === 1 ? "" : "s"}
              </Button>
            </DialogFooter>
          </div>
        ) : null}

        {step === "importing" ? (
          <div className="space-y-4 py-6 text-center">
            <Loader2 className="mx-auto size-8 animate-spin text-accent" aria-hidden="true" />
            <p className="text-sm font-medium">
              Importing… {progress.done}/{progress.total}
            </p>
            <div className="mx-auto h-2 w-full max-w-sm overflow-hidden rounded-full bg-surface-raised">
              <div
                className="h-full rounded-full bg-accent transition-[width]"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        ) : null}

        {step === "done" ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="size-5 text-profit" aria-hidden="true" />
              <span className="font-medium">
                {progress.total - failures.length} imported
                {failures.length > 0 ? ` · ${failures.length} failed` : ""}
              </span>
            </div>
            {failures.length > 0 ? (
              <ul className="space-y-0.5 rounded-lg border border-loss/30 bg-loss/5 p-3 text-xs text-muted-foreground">
                {failures.map((failure) => (
                  <li key={failure.index} className="font-mono">
                    row {failure.index + 2}: <span className="text-foreground">{failure.reason}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <Separator />
            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
