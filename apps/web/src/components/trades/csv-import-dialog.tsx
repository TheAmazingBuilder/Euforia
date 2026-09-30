"use client";

import * as React from "react";
import { toast } from "sonner";
import { ClipboardPaste, FileUp, Loader2, Upload } from "lucide-react";
import type { Direction, ImportTradesInput, ImportedTradeRow } from "@cosmoz/shared";

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
import {
  useImportTrades,
  useStrategies,
} from "@/lib/api/queries";
import { apiErrorMessage } from "@/lib/api/client";
import { localInputToISO } from "@/lib/utils/datetime";
import { cn } from "@/lib/utils";

/** MT5-style sample (dots in dates, buy/sell lowercase, "Item" column). */
const SAMPLE_CSV = [
  "Ticket,Open Time,Type,Volume,Item,Open Price,Close Time,Close Price,Commission,Profit,Comment",
  "123456789,2026.09.12 14:30:00,buy,0.5,EURUSD,1.08520,2026.09.12 16:45:00,1.08710,-2.5,95.00,A+ setup at the London open",
  "123456790,2026.09.13 09:15:00,sell,1.0,XAUUSD,2385.50,2026.09.13 10:05:00,2392.10,-3.1,-66.00,chased the spike",
  "123456791,2026.09.13 15:00:00,buy,0.2,BTCUSDT,58000.00,2026.09.13 17:30:00,59100.00,-1.8,220.00,news momentum",
  "123456792,2026.09.15 08:45:00,sell,0.3,GBPUSD,1.26800,2026.09.15 09:50:00,1.26520,-2.2,84.00,range fade",
  "123456793,2026.09.15 13:20:00,buy,0.4,EURUSD,1.08740,2026.09.15 13:55:00,1.08690,-2.0,-20.00,revenge after the stop",
].join("\n");

type ImportFieldKey =
  | "symbol" | "side" | "entryAt" | "entryPrice"
  | "exitAt" | "exitPrice" | "quantity" | "fees" | "pnl" | "notes";

interface ImportField {
  key: ImportFieldKey;
  label: string;
  required: boolean;
  /** Header-name heuristics, strongest match first. */
  hints: string[];
}

const IMPORT_FIELDS: ImportField[] = [
  { key: "symbol", label: "Symbol", required: true, hints: ["symbol", "item", "instrument", "ticker", "pair", "market"] },
  { key: "side", label: "Side", required: true, hints: ["type", "side", "direction", "long/short"] },
  { key: "entryAt", label: "Entry time", required: true, hints: ["open time", "date/time", "entry time", "entry date", "open date", "date", "time"] },
  { key: "entryPrice", label: "Entry price", required: true, hints: ["open price", "entry price", "price in", "open", "price"] },
  { key: "exitAt", label: "Exit time", required: false, hints: ["close time", "exit time", "exit date", "close date"] },
  { key: "exitPrice", label: "Exit price", required: false, hints: ["close price", "exit price", "price out", "close"] },
  { key: "quantity", label: "Quantity", required: false, hints: ["volume", "qty", "quantity", "lots", "size"] },
  { key: "fees", label: "Fees", required: false, hints: ["commission", "fee", "fees"] },
  { key: "pnl", label: "P&L (reference)", required: false, hints: ["profit", "pnl", "p/l", "net p/l"] },
  { key: "notes", label: "Notes", required: false, hints: ["comment", "note", "description"] },
];

const BROKER_PRESETS = ["Generic CSV", "MT4 / MT5", "TradingView", "cTrader"] as const;

/** RFC-4180-ish row parser: handles quoted cells and a detected delimiter. */
function parseCsvRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (inQuotes) {
      if (char === "\"") {
        if (text[index + 1] === "\"") {
          cell += "\"";
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
    } else if (char === "\"") {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      cell = "";
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts: Array<[string, number]> = [
    [",", (firstLine.match(/,/g) ?? []).length],
    [";", (firstLine.match(/;/g) ?? []).length],
    ["\t", (firstLine.match(/\t/g) ?? []).length],
  ];
  return counts.sort((a, b) => b[1] - a[1])[0]![1] > 0 ? counts.sort((a, b) => b[1] - a[1])[0]![0] : ",";
}

function normalizeSide(raw: string): Direction | null {
  const value = raw.trim().toUpperCase();
  if (["BUY", "LONG", "B", "0"].includes(value)) return "BUY";
  if (["SELL", "SHORT", "S", "1"].includes(value)) return "SELL";
  return null;
}

function parseDecimal(raw: string, positive: boolean): string | null {
  let value = raw.trim().replace(/\s|\u00a0/g, "");
  if (/^-?\d+,\d+$/.test(value)) value = value.replace(",", ".");
  if (value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (positive && number <= 0) return null;
  return String(number);
}

/** Local-clock import (broker files carry wall time) → UTC ISO. */
function parseDateTime(raw: string): string | null {
  const value = raw.trim();
  if (value === "") return null;
  const normalized = value.replace(/\./g, "-").replace(" ", "T").slice(0, 19);
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return localInputToISO(normalized.slice(0, 16));
}

/**
 * CSV import with per-broker column mapping — the client parses and maps,
 * the server receives normalized rows (validated, deduplicated per broker
 * ref, results recomputed). Auto-mapping covers the common layouts so the
 * happy path is one click: choose file → Import.
 */
export function CsvImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: strategiesData } = useStrategies();
  const importTrades = useImportTrades();

  const [broker, setBroker] = React.useState<string>("MT4 / MT5");
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [csvText, setCsvText] = React.useState("");
  const [pasteOpen, setPasteOpen] = React.useState(false);
  const [hasHeader, setHasHeader] = React.useState(true);
  const [mapping, setMapping] = React.useState<Record<ImportFieldKey, string>>(() =>
    Object.fromEntries(IMPORT_FIELDS.map((field) => [field.key, "__none"])) as Record<ImportFieldKey, string>,
  );
  const [strategyId, setStrategyId] = React.useState<string>("__none");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const delimiter = React.useMemo(() => detectDelimiter(csvText), [csvText]);
  const rows = React.useMemo(() => parseCsvRows(csvText, delimiter), [csvText, delimiter]);
  const headerRow = rows[0] ?? [];
  const headers = hasHeader
    ? headerRow.map((cell, index) => (cell.trim() === "" ? `Column ${index + 1}` : cell.trim()))
    : (rows[0] ?? []).map((_, index) => `Column ${index + 1}`);
  const dataRows = hasHeader ? rows.slice(1) : rows;

  // Auto-map on new content: render-time adjustment against a content key
  // (codebase convention — no setState inside effects).
  const contentKey = `${broker}|${hasHeader}|${headerRow.join("\u0001")}`;
  const [mappedFor, setMappedFor] = React.useState<string | null>(null);
  if (csvText !== "" && mappedFor !== contentKey) {
    setMappedFor(contentKey);
    const next: Record<ImportFieldKey, string> = Object.fromEntries(
      IMPORT_FIELDS.map((field) => [field.key, "__none"]),
    ) as Record<ImportFieldKey, string>;
    const lowerHeaders = headers.map((header) => header.toLowerCase());
    for (const field of IMPORT_FIELDS) {
      for (const hint of field.hints) {
        const exact = lowerHeaders.findIndex((header) => header === hint);
        const partial = lowerHeaders.findIndex((header) => header.includes(hint));
        const found = exact !== -1 ? exact : partial;
        if (found !== -1 && !Object.values(next).includes(headers[found] ?? "")) {
          next[field.key] = headers[found]!;
          break;
        }
      }
    }
    setMapping(next);
  }

  const parsed = React.useMemo(() => {
    const valid: ImportedTradeRow[] = [];
    let invalid = 0;
    for (const cells of dataRows) {
      const cellOf = (key: ImportFieldKey): string => {
        const header = mapping[key];
        if (header === undefined || header === "__none") return "";
        const index = headers.indexOf(header);
        return index === -1 ? "" : (cells[index] ?? "").trim();
      };
      const symbol = cellOf("symbol").toUpperCase();
      const side = normalizeSide(cellOf("side"));
      const entryAt = parseDateTime(cellOf("entryAt"));
      const entryPrice = parseDecimal(cellOf("entryPrice"), true);
      if (symbol === "" || side === null || entryAt === null || entryPrice === null) {
        if (cells.some((cell) => cell.trim() !== "")) invalid += 1;
        continue;
      }
      const exitAt = parseDateTime(cellOf("exitAt"));
      const exitPrice = parseDecimal(cellOf("exitPrice"), true);
      const quantity = parseDecimal(cellOf("quantity"), true);
      // Broker files carry commissions as negative amounts — normalize to ≥ 0.
      const feesRaw = parseDecimal(cellOf("fees"), false);
      const fees = feesRaw === null ? null : String(Math.abs(Number(feesRaw)));
      const pnl = parseDecimal(cellOf("pnl"), false);
      const notes = cellOf("notes");
      const row: ImportedTradeRow = {
        symbol,
        side,
        entryAt,
        entryPrice,
        ...(exitAt !== null && exitPrice !== null ? { exitAt, exitPrice } : {}),
        ...(quantity !== null ? { quantity } : {}),
        ...(fees !== null ? { fees } : {}),
        ...(pnl !== null ? { pnl } : {}),
        ...(notes !== "" ? { notes } : {}),
      };
      valid.push(row);
    }
    return { valid, invalid };
  }, [dataRows, headers, mapping]);

  const previewRows = parsed.valid.slice(0, 4);

  const onFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result));
    reader.readAsText(file);
  };

  const onSubmit = () => {
    const input: ImportTradesInput = {
      broker,
      strategyId: strategyId === "__none" ? null : strategyId,
      rows: parsed.valid,
    };
    importTrades.mutate(input, {
      onSuccess: (result) => {
        if (result.imported > 0) {
          toast.success(`Imported ${result.imported} trade${result.imported === 1 ? "" : "s"}`, {
            description:
              result.skippedDuplicates > 0
                ? `${result.skippedDuplicates} duplicate${result.skippedDuplicates === 1 ? "" : "s"} skipped (already in the journal)`
                : "Results computed server-side — grade them from the review queue",
          });
        }
        if (result.unknownSymbols.length > 0) {
          toast.warning(`${result.unknownSymbols.length} row(s) skipped — unknown symbols`, {
            description: [...new Set(result.unknownSymbols)].join(", "),
            duration: 10_000,
          });
        }
        if (result.imported > 0 || result.skippedDuplicates > 0) onOpenChange(false);
      },
      onError: (error) => toast.error(apiErrorMessage(error, "Import failed")),
    });
  };

  const noValidRows = parsed.valid.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl" data-testid="trades-import-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading">Import trades from CSV</DialogTitle>
          <DialogDescription>
            Map your broker&apos;s columns once — Cosmoz normalizes, deduplicates per broker
            reference, and recomputes results server-side.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {/* Source: broker preset + file / paste / sample */}
          <div className="flex flex-wrap items-end gap-2.5">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Broker format</Label>
              <Select value={broker} onValueChange={setBroker}>
                <SelectTrigger className="h-9 w-40 text-sm" data-testid="trades-import-broker">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BROKER_PRESETS.map((preset) => (
                    <SelectItem key={preset} value={preset}>
                      {preset}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <input ref={fileInputRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={onFile} />
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              onClick={() => fileInputRef.current?.click()}
              data-testid="trades-import-file"
            >
              <Upload className="size-3.5" aria-hidden="true" />
              Choose file
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 gap-1.5 text-muted-foreground"
              onClick={() => setPasteOpen((previous) => !previous)}
              data-testid="trades-import-paste"
            >
              <ClipboardPaste className="size-3.5" aria-hidden="true" />
              Paste CSV
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 gap-1.5 text-accent"
              onClick={() => {
                setFileName("mt5-sample.csv");
                setCsvText(SAMPLE_CSV);
              }}
              data-testid="trades-import-sample"
            >
              <FileUp className="size-3.5" aria-hidden="true" />
              Load MT5 sample
            </Button>
            {fileName !== null ? (
              <span className="pb-2 font-mono text-[11px] text-muted-foreground">{fileName}</span>
            ) : null}
          </div>

          {pasteOpen ? (
            <Textarea
              value={csvText}
              onChange={(event) => {
                setCsvText(event.target.value);
                setFileName(null);
              }}
              placeholder="Paste raw CSV content…"
              className="min-h-24 font-mono text-xs"
              data-testid="trades-import-paste-area"
            />
          ) : null}

          {csvText !== "" ? (
            <>
              {/* Column mapping */}
              <div className="grid gap-x-3 gap-y-2.5 rounded-lg border border-border bg-background/40 p-3 sm:grid-cols-2 lg:grid-cols-3">
                {IMPORT_FIELDS.map((field) => (
                  <div key={field.key} className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">
                      {field.label}
                      {field.required ? <span className="text-loss"> *</span> : null}
                    </Label>
                    <Select
                      value={mapping[field.key]}
                      onValueChange={(value) => setMapping((previous) => ({ ...previous, [field.key]: value }))}
                    >
                      <SelectTrigger className="h-8 text-xs" data-testid={`trades-import-map-${field.key}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">— not mapped —</SelectItem>
                        {headers.map((header) => (
                          <SelectItem key={header} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              {/* Parse status */}
              <p
                className="font-mono text-xs text-muted-foreground"
                data-testid="trades-import-status"
              >
                {dataRows.length} row{dataRows.length === 1 ? "" : "s"} parsed
                {" · "}
                <span className={noValidRows ? "text-loss" : "text-profit"}>{parsed.valid.length} ready</span>
                {parsed.invalid > 0 ? <> · {parsed.invalid} skipped (missing required fields)</> : null}
                {" · "}
                delimiter <span className="text-foreground">{delimiter === "\t" ? "TAB" : delimiter}</span>
                {" · "}
                <button
                  type="button"
                  onClick={() => setHasHeader((previous) => !previous)}
                  className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground hover:border-accent/50 hover:text-foreground"
                  data-testid="trades-import-header-toggle"
                >
                  {hasHeader ? "1st row = header" : "no header row"}
                </button>
              </p>

              {/* Preview */}
              <div className="overflow-x-auto rounded-lg border border-border" data-testid="trades-import-preview">
                <table className="w-full min-w-[560px] text-left font-mono text-[11px]">
                  <thead>
                    <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                      <th scope="col" className="px-2.5 py-2 font-medium">Symbol</th>
                      <th scope="col" className="px-2.5 py-2 font-medium">Side</th>
                      <th scope="col" className="px-2.5 py-2 font-medium">Entry</th>
                      <th scope="col" className="px-2.5 py-2 text-right font-medium">Entry px</th>
                      <th scope="col" className="px-2.5 py-2 text-right font-medium">Exit px</th>
                      <th scope="col" className="px-2.5 py-2 text-right font-medium">Qty</th>
                      <th scope="col" className="px-2.5 py-2 text-right font-medium">P&amp;L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, index) => (
                      <tr
                        key={`${row.entryAt}-${index}`}
                        className="border-b border-border/60 last:border-0"
                        data-testid="trades-import-preview-row"
                      >
                        <td className="px-2.5 py-1.5 font-semibold text-foreground">{row.symbol}</td>
                        <td className={cn("px-2.5 py-1.5", row.side === "SELL" ? "text-loss" : "text-profit")}>
                          {row.side}
                        </td>
                        <td className="px-2.5 py-1.5 text-muted-foreground">{row.entryAt.slice(0, 16).replace("T", " ")}</td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums">{row.entryPrice}</td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums">{row.exitPrice ?? "open"}</td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums">{row.quantity ?? "—"}</td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums">{row.pnl ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Strategy assignment + submit */}
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Assign strategy (optional)</Label>
                  <Select value={strategyId} onValueChange={setStrategyId}>
                    <SelectTrigger className="h-9 w-56 text-sm" data-testid="trades-import-strategy">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Out of playbook</SelectItem>
                      {(strategiesData?.strategies ?? []).map((strategy) => (
                        <SelectItem key={strategy.id} value={strategy.id}>
                          {strategy.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={onSubmit}
                  disabled={noValidRows || importTrades.isPending}
                  className="gap-1.5 bg-accent text-accent-foreground hover:bg-accent-hover"
                  data-testid="trades-import-submit"
                >
                  {importTrades.isPending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Upload className="size-4" aria-hidden="true" />
                  )}
                  Import {parsed.valid.length} trade{parsed.valid.length === 1 ? "" : "s"}
                </Button>
              </div>
            </>
          ) : (
            <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
              Choose a CSV file, paste its content, or load the MT5 sample to map the columns.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
