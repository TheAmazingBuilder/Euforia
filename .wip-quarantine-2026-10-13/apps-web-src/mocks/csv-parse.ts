import type {
  CsvBroker,
  CsvImportPreviewResponse,
  CsvParsedRow,
  Direction,
  Instrument,
} from "@cosmoz/shared";

/**
 * Broker CSV parser (Phase 10) — lives in the mock backend because in the
 * real architecture this work happens API-side (files are untrusted, P&L is
 * stamped server-side). Column layouts:
 * - MT4  : positional account-history export
 *          `Ticket,Open Time,Type,Size,Item,Price,S/L,T/P,Close Time,Price,
 *           Commission,Taxes,Swap,Profit` (two "Price" columns!)
 * - MT5  : positional position-style export
 *          `Ticket,Open Time,Type,Size,Item,Open Price,Close Time,Close Price,
 *           Commission,Swap,Profit`
 * - DERIV: positional statement export (MT5-flavoured column order)
 * - GENERIC: header-synonym sniffing (symbol/side/volume/entry/exit/profit…)
 * All times are treated as UTC (broker server time) — documented in the UI.
 * Balance/credit/deposit rows are ignored (not trades).
 */

const MAX_ROWS = 500;

export interface CsvParseResult {
  detected: CsvImportPreviewResponse["detected"];
  rows: CsvParsedRow[];
}

interface RawFields {
  ticket: string | null;
  symbol: string | null;
  direction: string | null;
  quantity: string | null;
  entryPrice: string | null;
  entryAt: string | null;
  exitPrice: string | null;
  exitAt: string | null;
  commission: string | null;
  swap: string | null;
  pnl: string | null;
}

// ── Low-level text helpers ──────────────────────────────────────────────────

function detectDelimiter(headerLine: string): string {
  const candidates = [";", "\t", ","];
  let best = ",";
  let bestCount = 0;
  for (const candidate of candidates) {
    const count = headerLine.split(candidate).length;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

/** RFC-4180-ish single-line splitter: double quotes, escaped quotes. */
function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      out.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  out.push(current.trim());
  return out;
}

/** "1,234.56" / "$1 234.56" / "-2.50" → "-1234.56" (decimal string) or null. */
function normalizeNumber(raw: string): string | null {
  const cleaned = raw
    .replace(/[ $\u00A0'$]/g, "")
    .replace(/(\d),(?=\d{3}\b)/g, "$1")
    .replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return cleaned;
}

/**
 * Broker timestamps → UTC ISO. Handled: `2026.09.24 14:30`, `2026-09-24
 * 14:30:00`, `2026/09/24 14:30`, ISO `2026-09-24T14:30:00(.000)?Z?`.
 * Assumption (documented): naive times are broker server time = UTC.
 */
function normalizeTime(raw: string): string | null {
  const value = raw.trim();
  if (value === "") return null;
  const dotted = value.replace(/\./g, "-").replace(/\//g, "-");
  const isoMatch = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2}))?/.exec(dotted);
  if (isoMatch !== null) {
    const [, date, hm, seconds] = isoMatch;
    return `${date}T${hm}:${seconds ?? "00"}Z`;
  }
  const dateOnlyMatch = /^(\d{4}-\d{2}-\d{2})$/.exec(dotted);
  if (dateOnlyMatch !== null) return `${dateOnlyMatch[1]}T00:00:00Z`;
  const native = new Date(dotted);
  return Number.isNaN(native.getTime()) ? null : native.toISOString();
}

const NON_MARKET_WORDS = ["balance", "credit", "deposit", "withdrawal", "bonus"];

/** "buy" / "sell" / "long" / "short" / "b" / "s" / "0" / "1" → direction. */
function normalizeDirection(raw: string): Direction | null {
  const value = raw.trim().toLowerCase();
  const firstWord = value.split(/[\s_/]+/, 1)[0] ?? value;
  if (["buy", "long", "b", "0"].includes(firstWord)) return "BUY";
  if (["sell", "short", "s", "1"].includes(firstWord)) return "SELL";
  return null;
}

// ── Column mapping ──────────────────────────────────────────────────────────

/** Positional layouts: field name → column index (MT4 has TWO "Price" columns). */
const POSITIONAL_LAYOUTS: Record<Exclude<CsvBroker, "GENERIC">, Record<keyof RawFields, number>> = {
  MT4: {
    ticket: 0, entryAt: 1, direction: 2, quantity: 3, symbol: 4, entryPrice: 5,
    exitAt: 8, exitPrice: 9, commission: 10, swap: 12, pnl: 13,
  },
  MT5: {
    ticket: 0, entryAt: 1, direction: 2, quantity: 3, symbol: 4, entryPrice: 5,
    exitAt: 6, exitPrice: 7, commission: 8, swap: 9, pnl: 10,
  },
  DERIV: {
    ticket: 0, entryAt: 1, symbol: 2, direction: 3, quantity: 4, entryPrice: 5,
    exitAt: 6, exitPrice: 7, swap: 8, commission: 9, pnl: 10,
  },
};

/** GENERIC header synonyms (lower-cased, first match wins per field). */
const GENERIC_SYNONYMS: Record<keyof RawFields, string[]> = {
  ticket: ["ticket", "ticket id", "position", "position id", "order", "deal", "id", "ref"],
  symbol: ["symbol", "item", "instrument", "ticker", "pair", "market", "asset"],
  direction: ["type", "side", "direction", "action", "buy/sell"],
  quantity: ["size", "volume", "lots", "qty", "quantity", "units"],
  entryPrice: ["open price", "entry price", "price open", "open", "entry", "price in"],
  exitPrice: ["close price", "exit price", "price close", "close", "exit", "price out"],
  entryAt: ["open time", "entry time", "open date", "opened", "date", "time", "datetime"],
  exitAt: ["close time", "exit time", "close date", "closed"],
  commission: ["commission", "commission fee", "fee", "fees"],
  swap: ["swap", "swap fee", "storage"],
  pnl: ["profit", "pnl", "p/l", "net p/l", "net profit", "result", "gross p/l"],
};

function mapGenericHeaders(headers: string[]): Partial<Record<keyof RawFields, number>> {
  const mapping: Partial<Record<keyof RawFields, number>> = {};
  const lowered = headers.map((header) => header.trim().toLowerCase());
  for (const [field, synonyms] of Object.entries(GENERIC_SYNONYMS) as [keyof RawFields, string[]][]) {
    const index = lowered.findIndex((header) => synonyms.includes(header));
    if (index >= 0) mapping[field] = index;
  }
  if (mapping.entryAt !== undefined && mapping.exitAt === undefined) {
    const closeIdx = lowered.findIndex(
      (header) => header.includes("close") || header.includes("exit"),
    );
    if (closeIdx >= 0) mapping.exitAt = closeIdx;
  }
  return mapping;
}

function rawFromCells(
  cells: string[],
  layout: Partial<Record<keyof RawFields, number>>,
): RawFields {
  const read = (field: keyof RawFields): string | null => {
    const index = layout[field];
    if (index === undefined || index >= cells.length) return null;
    const value = cells[index] ?? "";
    return value === "" ? null : value;
  };
  return {
    ticket: read("ticket"),
    symbol: read("symbol"),
    direction: read("direction"),
    quantity: read("quantity"),
    entryPrice: read("entryPrice"),
    entryAt: read("entryAt"),
    exitPrice: read("exitPrice"),
    exitAt: read("exitAt"),
    commission: read("commission"),
    swap: read("swap"),
    pnl: read("pnl"),
  };
}

// ── Row building ────────────────────────────────────────────────────────────

function buildParsedRow(
  raw: RawFields,
  index: number,
  instruments: Instrument[],
  existingRefs: Set<string>,
): CsvParsedRow | null {
  const value = raw.direction ?? "";
  if (NON_MARKET_WORDS.some((word) => value.toLowerCase().includes(word))) return null;

  // Errors (row unusable) and warnings (importable, but the trader should
  // know) are collected separately — the final status derives from them.
  const errors: string[] = [];
  const warnings: string[] = [];

  const symbol = raw.symbol?.toUpperCase() ?? null;
  const instrument = symbol !== null
    ? instruments.find((candidate) => candidate.symbol.toUpperCase() === symbol)
    : undefined;

  const entryAt = raw.entryAt !== null ? normalizeTime(raw.entryAt) : null;
  const exitAt = raw.exitAt !== null ? normalizeTime(raw.exitAt) : null;
  const entryPrice = raw.entryPrice !== null ? normalizeNumber(raw.entryPrice) : null;
  const exitPrice = raw.exitPrice !== null ? normalizeNumber(raw.exitPrice) : null;
  const quantity = raw.quantity !== null ? normalizeNumber(raw.quantity) : null;
  const pnl = raw.pnl !== null ? normalizeNumber(raw.pnl) : null;
  const commission = raw.commission !== null ? normalizeNumber(raw.commission) : null;
  const swap = raw.swap !== null ? normalizeNumber(raw.swap) : null;
  const direction = raw.direction !== null ? normalizeDirection(raw.direction) : null;

  // Hard requirements — anything missing makes the row unusable.
  if (symbol === null) errors.push("Missing symbol");
  if (direction === null) errors.push("Missing or unreadable side (buy/sell)");
  if (entryAt === null) errors.push("Missing or unreadable open time");
  if (entryPrice === null) errors.push("Missing or unreadable open price");
  if (quantity === null || Number(quantity) <= 0) errors.push("Missing or unreadable volume");

  const isOpen = exitAt === null || exitPrice === null;
  if (!isOpen && exitPrice !== null && Number(exitPrice) <= 0) {
    errors.push("Close price must be positive");
  }

  // Soft warnings — only meaningful on rows that are otherwise usable.
  if (errors.length === 0) {
    if (symbol !== null && instrument === undefined) {
      warnings.push(`Unknown symbol ${symbol} — a new instrument will be created`);
    }
    if (isOpen) {
      warnings.push("No close data — imported as an OPEN trade");
    } else if (pnl === null) {
      warnings.push("No profit value — P&L will be computed from prices");
    }
  }

  const externalRef = raw.ticket !== null && raw.ticket !== "" ? raw.ticket : null;
  const duplicate = externalRef !== null && existingRefs.has(externalRef);
  if (duplicate) warnings.push("Already in the journal (same ticket) — will be skipped");

  const issues = [...errors, ...warnings];

  return {
    index,
    externalRef,
    symbol: symbol ?? "?",
    instrumentId: instrument?.id ?? null,
    direction,
    quantity,
    entryPrice,
    entryAt,
    exitPrice: isOpen ? null : exitPrice,
    exitAt: isOpen ? null : exitAt,
    fees: commission !== null ? String(Math.abs(Number(commission))) : null,
    swap,
    pnlNet: pnl,
    status: errors.length > 0 ? "ERROR" : warnings.length > 0 ? "WARNING" : "OK",
    issues,
    duplicate,
  };
}

// ── Public entry point ──────────────────────────────────────────────────────

export function parseCsvFile(
  csv: string,
  broker: CsvBroker,
  hasHeader: boolean,
  instruments: Instrument[],
  existingRefs: Set<string>,
): CsvParseResult {
  if (broker === "GENERIC" && !hasHeader) {
    throw Object.assign(new Error("Generic import needs a header row to map columns"), { status: 422 });
  }

  const lines = csv.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length === 0) {
    throw Object.assign(new Error("The file is empty"), { status: 400 });
  }

  const delimiter = detectDelimiter(lines[0]!);
  let headerCells: string[] = [];
  let dataLines = lines;
  if (hasHeader) {
    headerCells = splitCsvLine(lines[0]!, delimiter);
    dataLines = lines.slice(1);
  }

  const layout = broker === "GENERIC"
    ? mapGenericHeaders(headerCells)
    : POSITIONAL_LAYOUTS[broker];

  if (broker === "GENERIC" && layout.symbol === undefined) {
    throw Object.assign(new Error("Could not find a symbol column in the header"), { status: 422 });
  }

  const rows: CsvParsedRow[] = [];
  // Duplicates are flagged against the journal AND against earlier rows of
  // the same file, so the preview always matches what the commit will do.
  const seenRefs = new Set(existingRefs);
  for (const line of dataLines.slice(0, MAX_ROWS)) {
    const cells = splitCsvLine(line, delimiter);
    if (cells.length < 4) continue; // stray fragments / comment lines
    const raw = rawFromCells(cells, layout);
    const row = buildParsedRow(raw, rows.length, instruments, seenRefs);
    if (row !== null) {
      if (row.externalRef !== null && !row.duplicate) seenRefs.add(row.externalRef);
      rows.push(row);
    }
  }

  const dated = rows
    .map((row) => row.entryAt?.slice(0, 10) ?? null)
    .filter((value): value is string => value !== null)
    .sort();

  return {
    detected: {
      broker,
      delimiter,
      rowCount: rows.length,
      columns: headerCells,
      dateRange: {
        from: dated[0] ?? null,
        to: dated[dated.length - 1] ?? null,
      },
    },
    rows,
  };
}
