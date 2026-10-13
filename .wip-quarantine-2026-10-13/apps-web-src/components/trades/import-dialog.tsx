"use client";

import * as React from "react";
import { toast } from "sonner";
import { CheckCircle2, FileUp, TriangleAlert, XCircle } from "lucide-react";
import type { Broker, ImportTradesResponse, Instrument } from "@cosmoz/shared";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Textarea } from "@/components/ui/textarea";
import { useAccounts, useImportTrades, useInstruments } from "@/lib/api/queries";
import { formatDateKeyShort } from "@/lib/utils/datetime";
import {
  IMPORT_FIELDS,
  UNMAPPED,
  autoMapColumns,
  mapRow,
  parseCsv,
  presetPreferredFields,
  type CsvTable,
  type ImportMapping,
} from "@/lib/utils/csv-import";
import { cn } from "@/lib/utils";

/**
 * Broker CSV import (feature proposal #1): source → column mapping → result.
 * Pure client-side parsing (lib/utils/csv-import) + one POST /trades/import.
 * Idempotent: re-importing a statement skips rows already known by ticket.
 */

type Step = "source" | "map" | "result";

const BROKER_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "AUTO", label: "Auto-detect columns" },
  { value: "MT5", label: "MT5 / Deriv statement" },
  { value: "MT4", label: "MT4 statement" },
  { value: "OTHER", label: "Generic CSV" },
];

function normalizeSymbol(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const SYMBOL_ALIASES: Record<string, string> = {
  GOLD: "XAUUSD",
  SILVER: "XAGUSD",
  BTCUSD: "BTCUSDT",
  ETHUSD: "ETHUSDT",
};

export interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportDialog({ open, onOpenChange }: ImportDialogProps) {
  const { data: instrumentsData } = useInstruments();
  const { data: accountsData } = useAccounts();
  const importTrades = useImportTrades();

  const instruments: Instrument[] = React.useMemo(
    () => instrumentsData?.instruments ?? [],
    [instrumentsData],
  );
  const accounts = accountsData?.accounts ?? [];
  const defaultAccountId =
    accounts.find((account) => account.isDefault)?.id ?? accounts[0]?.id ?? null;

  const [step, setStep] = React.useState<Step>("source");
  const [broker, setBroker] = React.useState<Broker | "AUTO">("AUTO");
  const [accountId, setAccountId] = React.useState<string | null>(null);
  const [csv, setCsv] = React.useState<CsvTable | null>(null);
  const [pasteText, setPasteText] = React.useState("");
  const [mapping, setMapping] = React.useState<ImportMapping | null>(null);
  const [result, setResult] = React.useState<ImportTradesResponse | null>(null);
  const [parseError, setParseError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const activeAccountId = accountId ?? defaultAccountId;

  const reset = () => {
    setStep("source");
    setCsv(null);
    setPasteText("");
    setMapping(null);
    setResult(null);
    setParseError(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const resolveInstrumentId = React.useCallback(
    (rawSymbol: string): string | null => {
      const key = normalizeSymbol(rawSymbol);
      const aliased = SYMBOL_ALIASES[key] ?? key;
      const byExact = instruments.find((i) => normalizeSymbol(i.symbol) === aliased);
      if (byExact !== undefined) return byExact.id;
      const byPrefix = instruments.find(
        (i) =>
          normalizeSymbol(i.symbol).startsWith(aliased) || aliased.startsWith(normalizeSymbol(i.symbol)),
      );
      return byPrefix?.id ?? null;
    },
    [instruments],
  );

  const loadText = (text: string) => {
    const table = parseCsv(text);
    if (table.headers.length < 2 || table.rows.length === 0) {
      setParseError("Could not read a header row and at least one data row.");
      return;
    }
    setParseError(null);
    setCsv(table);
    setMapping(autoMapColumns(table.headers, presetPreferredFields(broker)));
    setStep("map");
  };

  const onFilePicked = (file: File | null | undefined) => {
    if (file === null || file === undefined) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") loadText(reader.result);
    };
    reader.onerror = () => setParseError(`Could not read “${file.name}”.`);
    reader.readAsText(file);
  };

  // ── Mapping validation (live) ───────────────────────────────────────────
  const mapped = React.useMemo(() => {
    if (csv === null || mapping === null) return { valid: [], invalid: [] as { rowIndex: number; errors: string[] }[] };
    const valid: NonNullable<ReturnType<typeof mapRow>["row"]>[] = [];
    const invalid: { rowIndex: number; errors: string[] }[] = [];
    csv.rows.forEach((row, rowIndex) => {
      const { row: parsed, errors } = mapRow(row, mapping, { resolveInstrumentId });
      if (parsed !== undefined) valid.push(parsed);
      else invalid.push({ rowIndex, errors });
    });
    return { valid, invalid };
  }, [csv, mapping, resolveInstrumentId]);

  const missingRequired = React.useMemo(
    () =>
      mapping === null
        ? []
        : IMPORT_FIELDS.filter((def) => def.required && mapping[def.field] === UNMAPPED).map((def) => def.label),
    [mapping],
  );

  const submit = () => {
    if (activeAccountId === null || mapped.valid.length === 0) return;
    importTrades.mutate(
      {
        accountId: activeAccountId,
        broker: broker === "AUTO" ? "OTHER" : broker,
        rows: mapped.valid,
      },
      {
        onSuccess: (response) => {
          setResult(response);
          setStep("result");
        },
        onError: (error) => {
          toast.error("Import failed", {
            description: error instanceof Error ? error.message : String(error),
          });
        },
      },
    );
  };

  const columnOptions = (current: number, onSelect: (index: number) => void, label: string) => (
    <div className="space-y-1.5" key={label}>
      <Label>{label}</Label>
      <Select
        value={current === UNMAPPED ? "none" : String(current)}
        onValueChange={(value) => onSelect(value === "none" ? UNMAPPED : Number(value))}
      >
        <SelectTrigger className="h-9 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">— not mapped —</SelectItem>
          {csv?.headers.map((header, index) => (
            <SelectItem key={`${header}-${index}`} value={String(index)}>
              {header === "" ? `(column ${index + 1})` : header}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl lg:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import trades from a broker CSV</DialogTitle>
          <DialogDescription>
            Step {step === "source" ? "1" : step === "map" ? "2" : "3"} of 3 — timestamps are read as
            UTC (broker server time). Re-importing the same statement skips known rows.
          </DialogDescription>
        </DialogHeader>

        {step === "source" ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {columnOptionsForBroker(broker, setBroker)}
              <div className="space-y-1.5">
                <Label>Destination account</Label>
                <Select
                  value={activeAccountId ?? "none"}
                  onValueChange={(value) => setAccountId(value === "none" ? null : value)}
                >
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue placeholder="Pick an account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={activeAccountId === null}
              >
                <FileUp className="size-4" aria-hidden="true" />
                Choose a CSV file
              </Button>
              <span className="text-xs text-muted-foreground">or paste the rows below</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                className="sr-only"
                aria-label="CSV file"
                onChange={(event) => {
                  onFilePicked(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </div>

            <Textarea
              value={pasteText}
              onChange={(event) => setPasteText(event.target.value)}
              placeholder={
                "Ticket,Open Time,Type,Size,Item,Open Price,S/L,Close Time,Close Price,Commission,Swap,Profit\n884201,2026.01.12 09:31,buy,0.50,EURUSD,1.08320,,2026.01.12 11:04,1.08610,-0.20,0.00,145.00"
              }
              className="min-h-32 resize-none font-mono text-xs"
              aria-label="Paste CSV content"
            />

            {parseError !== null ? (
              <p className="flex items-center gap-2 text-sm text-loss">
                <XCircle className="size-4 shrink-0" aria-hidden="true" />
                {parseError}
              </p>
            ) : null}

            <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
              <Button variant="ghost" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => loadText(pasteText)}
                disabled={pasteText.trim() === "" || activeAccountId === null}
              >
                Continue
              </Button>
            </div>
          </div>
        ) : null}

        {step === "map" && csv !== null && mapping !== null ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {csv.rows.length} rows × {csv.headers.length} columns detected.
              {missingRequired.length > 0 ? (
                <span className="text-warning"> Still missing: {missingRequired.join(", ")}.</span>
              ) : null}
            </p>

            <div className="grid gap-3 sm:grid-cols-3">
              {IMPORT_FIELDS.map((def) =>
                columnOptions(
                  mapping[def.field],
                  (index) => setMapping((previous) => (previous === null ? previous : { ...previous, [def.field]: index })),
                  def.label + (def.required ? " *" : ""),
                ),
              )}
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <div className="space-y-1.5">
                <p className="eyebrow">Preview — first valid rows</p>
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-xs">
                    <tbody>
                      {mapped.valid.slice(0, 4).map((row) => (
                        <tr key={row.externalRef} className="border-b border-border/60 last:border-0">
                          <td className="px-2 py-1.5 font-medium">{resolveSymbolLabel(row.instrumentId, instruments)}</td>
                          <td className="px-2 py-1.5 text-muted-foreground">{row.direction}</td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums">{row.quantity}</td>
                          <td className="px-2 py-1.5 font-mono tabular-nums text-muted-foreground">
                            {formatDateKeyShort(row.entryAt.slice(0, 10))}
                          </td>
                          <td
                            className={cn(
                              "px-2 py-1.5 text-right font-mono tabular-nums",
                              (Number(row.brokerPnl) ?? 0) >= 0 ? "text-profit" : "text-loss",
                            )}
                          >
                            {row.brokerPnl ?? "—"}
                          </td>
                        </tr>
                      ))}
                      {mapped.valid.length === 0 ? (
                        <tr>
                          <td className="px-2 py-3 text-muted-foreground" colSpan={5}>
                            No valid rows yet — map the required columns.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="eyebrow">Issues</p>
                <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border p-2" aria-label="Row issues">
                  {mapped.invalid.length === 0 ? (
                    <li className="flex items-center gap-2 text-xs text-profit">
                      <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
                      All {mapped.valid.length} rows are valid.
                    </li>
                  ) : (
                    mapped.invalid.slice(0, 8).map(({ rowIndex, errors }) => (
                      <li key={rowIndex} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
                        <span>
                          Row {rowIndex + 1}: {errors.join(" · ")}
                        </span>
                      </li>
                    ))
                  )}
                  {mapped.invalid.length > 8 ? (
                    <li className="px-6 text-xs text-muted-foreground">…and {mapped.invalid.length - 8} more.</li>
                  ) : null}
                </ul>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
              <Button variant="ghost" onClick={() => setStep("source")}>
                Back
              </Button>
              <Button onClick={submit} disabled={mapped.valid.length === 0 || importTrades.isPending}>
                {importTrades.isPending
                  ? "Importing…"
                  : `Import ${mapped.valid.length} trade${mapped.valid.length > 1 ? "s" : ""}`}
              </Button>
            </div>
          </div>
        ) : null}

        {step === "result" && result !== null ? (
          <div className="space-y-4 py-2 text-center">
            <CheckCircle2 className="mx-auto size-10 text-profit" aria-hidden="true" />
            <div>
              <p className="font-heading text-lg font-semibold">
                {result.created} trade{result.created === 1 ? "" : "s"} imported
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {result.duplicates > 0
                  ? `${result.duplicates} duplicate${result.duplicates === 1 ? "" : "s"} skipped (already in the journal).`
                  : "No duplicates — all rows were new."}
              </p>
            </div>
            <p className="mx-auto max-w-sm text-xs text-muted-foreground">
              Imported trades are closed and ungraded by design — grade them from the Trades table
              when you review. Analytics refresh immediately.
            </p>
            <div className="flex justify-center gap-2 border-t border-border pt-3">
              <Button variant="ghost" onClick={reset}>
                Import another file
              </Button>
              <Button onClick={() => handleOpenChange(false)}>Done</Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function columnOptionsForBroker(
  value: Broker | "AUTO",
  onChange: (value: Broker | "AUTO") => void,
) {
  return (
    <div className="space-y-1.5">
      <Label>Column preset</Label>
      <Select value={value} onValueChange={(next) => onChange(next as Broker | "AUTO")}>
        <SelectTrigger className="h-9 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {BROKER_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function resolveSymbolLabel(instrumentId: string, instruments: Instrument[]): string {
  return instruments.find((instrument) => instrument.id === instrumentId)?.symbol ?? "?";
}
