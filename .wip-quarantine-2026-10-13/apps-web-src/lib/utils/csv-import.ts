import type { ImportTradeRow } from "@cosmoz/shared";

/**
 * Broker CSV parsing & mapping — pure functions (no DOM, no fetch).
 * Pipeline: parseCsv → autoMapColumns (preset aliases) → mapRow (validated
 * ImportTradeRow or human-readable errors) → POST /trades/import.
 *
 * Timestamps are read as UTC (broker server time) — documented in the dialog.
 */

// ── Parsing ──────────────────────────────────────────────────────────────────

export interface CsvTable {
  headers: string[];
  rows: string[][];
}

/** RFC 4180-ish CSV reader: quoted fields, escaped quotes, CRLF, BOM. */
export function parseCsv(text: string): CsvTable {
  const src = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    if (row.some((cell) => cell.trim() !== "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      pushField();
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      pushRow();
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) pushRow();

  const [header, ...body] = rows;
  if (header === undefined) return { headers: [], rows: [] };
  return { headers: header.map((h) => h.trim()), rows: body };
}

/** Broker decimals: "1 234,56" / "1,234.56" / "0.85" → number. */
export function parseCsvNumber(raw: string): number | null {
  const cleaned = raw.replace(/[\s\u00A0]/g, "");
  if (cleaned === "") return null;
  let normalized = cleaned;
  if (cleaned.includes(",") && cleaned.includes(".")) {
    normalized = cleaned.replaceAll(",", ""); // "1,234.56" — comma is thousands
  } else if (cleaned.includes(",")) {
    normalized = cleaned.replace(",", "."); // "1234,56" — comma is decimal
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/**
 * Flexible broker timestamp → ISO UTC (Z). Supported: ISO-8601,
 * MT4/MT5 "YYYY.MM.DD HH:mm[:ss]", US "MM/DD/YYYY[, HH:mm[:ss] [AM|PM]]"
 * (day-first swapped automatically when the field cannot be a month).
 */
export function parseFlexibleDateTime(raw: string): string | null {
  const t = raw.trim();
  if (t === "") return null;

  // ISO 8601 (with space tolerated instead of T)
  if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.test(t)) {
    const normalized = t.replace(" ", "T");
    const ms = Date.parse(/[Z+-]/.test(normalized.slice(10)) ? normalized : `${normalized}Z`);
    return Number.isNaN(ms) ? null : new Date(ms).toISOString();
  }

  // MT4 / MT5 report style: 2024.01.15 14:30[:ss]
  if (/^\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}(:\d{2})?$/.test(t)) {
    const ms = Date.parse(`${t.replaceAll(".", "-").replace(" ", "T")}Z`);
    return Number.isNaN(ms) ? null : new Date(ms).toISOString();
  }

  // US / EU slash style: M/D/YYYY or D/M/YYYY (forced when > 12)
  const slash = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i);
  if (slash !== null) {
    const [, first, second, yearRaw, hour = "0", minute = "0", sec = "0", meridiem] = slash;
    let month = Number(first);
    let day = Number(second);
    if (month > 12 && day <= 12) {
      [month, day] = [day, month];
    }
    let year = Number(yearRaw);
    if (year < 100) year += 2000;
    let hours = Number(hour);
    if (meridiem !== undefined) {
      const isPm = meridiem.toUpperCase() === "PM";
      if (isPm && hours < 12) hours += 12;
      if (!isPm && hours === 12) hours = 0;
    }
    const ms = Date.UTC(year, month - 1, day, hours, Number(minute), Number(sec));
    return Number.isNaN(ms) ? null : new Date(ms).toISOString();
  }

  return null;
}

// ── Column mapping ───────────────────────────────────────────────────────────

export type ImportField =
  | "symbol"
  | "direction"
  | "quantity"
  | "entryPrice"
  | "entryAt"
  | "exitPrice"
  | "exitAt"
  | "initialStop"
  | "initialTP"
  | "fees"
  | "swap"
  | "brokerPnl"
  | "externalRef"
  | "exitReason";

export interface ImportFieldDef {
  field: ImportField;
  label: string;
  required: boolean;
}

export const IMPORT_FIELDS: readonly ImportFieldDef[] = [
  { field: "symbol", label: "Symbol", required: true },
  { field: "direction", label: "Direction", required: true },
  { field: "quantity", label: "Size / volume", required: true },
  { field: "entryPrice", label: "Entry price", required: true },
  { field: "entryAt", label: "Entry time", required: true },
  { field: "exitPrice", label: "Exit price", required: true },
  { field: "exitAt", label: "Exit time", required: true },
  { field: "brokerPnl", label: "Profit (broker P&L)", required: false },
  { field: "initialStop", label: "Stop loss", required: false },
  { field: "initialTP", label: "Take profit", required: false },
  { field: "fees", label: "Commission / fees", required: false },
  { field: "swap", label: "Swap", required: false },
  { field: "externalRef", label: "Ticket / order id", required: false },
  { field: "exitReason", label: "Exit reason", required: false },
];

const FIELD_ALIASES: Record<ImportField, readonly string[]> = {
  symbol: ["symbol", "item", "instrument", "pair", "ticker", "asset", "market", "description"],
  direction: ["type", "side", "direction", "action", "position", "buy/sell"],
  quantity: ["size", "volume", "quantity", "lots", "qty", "amount", "units"],
  entryPrice: ["open price", "entry price", "openprice", "entry", "price open", "open", "price"],
  entryAt: ["open time", "entry time", "opened", "date open", "time open", "entry date", "open date", "open"],
  exitPrice: ["close price", "exit price", "closeprice", "price close", "close", "exit"],
  exitAt: ["close time", "exit time", "closed", "date close", "time close", "close date", "close"],
  initialStop: ["s/l", "sl", "stop loss", "stop", "sl price", "stop price"],
  initialTP: ["t/p", "tp", "take profit", "target", "tp price", "target price"],
  fees: ["commission", "fees", "fee", "comm", "commission (usd)"],
  swap: ["swap", "swap (usd)", "swaps"],
  brokerPnl: ["profit", "p/l", "pnl", "net profit", "realized pnl", "profit (usd)", "gross p/l", "pl"],
  externalRef: ["ticket", "order", "order id", "order number", "ticket id", "position id", "deal", "id", "ref", "reference"],
  exitReason: ["exit reason", "close reason", "reason", "comment"],
};

/** Unmapped slot. */
export const UNMAPPED = -1;

export type ImportMapping = Record<ImportField, number>;

const normalizeHeader = (header: string): string => header.trim().toLowerCase();

/**
 * Map CSV columns to canonical fields. Exact alias match first (field order
 * = priority), then substring match. Each column is consumed once.
 */
export function autoMapColumns(headers: string[], preferred: ImportField[] = []): ImportMapping {
  const normalized = headers.map(normalizeHeader);
  const used = new Set<number>();
  const mapping = Object.fromEntries(IMPORT_FIELDS.map((f) => [f.field, UNMAPPED])) as ImportMapping;

  const assign = (field: ImportField, aliases: readonly string[], exact: boolean): boolean => {
    for (const alias of aliases) {
      for (let i = 0; i < normalized.length; i += 1) {
        if (used.has(i)) continue;
        const candidate = normalized[i]!;
        const hit = exact ? candidate === alias : candidate.includes(alias);
        if (hit) {
          mapping[field] = i;
          used.add(i);
          return true;
        }
      }
    }
    return false;
  };

  // Preferred fields (preset hints) try exact match first.
  for (const field of preferred) {
    assign(field, FIELD_ALIASES[field]!, true);
  }
  for (const def of IMPORT_FIELDS) {
    if (mapping[def.field] !== UNMAPPED) continue;
    assign(def.field, FIELD_ALIASES[def.field]!, true);
  }
  for (const def of IMPORT_FIELDS) {
    if (mapping[def.field] !== UNMAPPED) continue;
    assign(def.field, FIELD_ALIASES[def.field]!, false);
  }
  return mapping;
}

/** Preset → field priority hints (MT4/MT5/Deriv reports share the same shape). */
export function presetPreferredFields(preset: string): ImportField[] {
  if (preset === "MT4" || preset === "MT5" || preset === "DERIV") {
    return ["symbol", "direction", "quantity", "entryPrice", "entryAt", "exitPrice", "exitAt", "brokerPnl", "externalRef", "initialStop", "initialTP", "fees", "swap"];
  }
  return [];
}

// ── Row conversion ───────────────────────────────────────────────────────────

export interface MapRowContext {
  /** CSV symbol → catalog instrument id (null = unknown symbol). */
  resolveInstrumentId: (symbol: string) => string | null;
}

export interface MappedRow {
  rowIndex: number;
  row?: ImportTradeRow;
  errors: string[];
}

const DIRECTION_PATTERNS: readonly { re: RegExp; value: "BUY" | "SELL" }[] = [
  { re: /^(buy|long|b)$/i, value: "BUY" },
  { re: /^(sell|short|s)$/i, value: "SELL" },
  { re: /^0$/, value: "BUY" },
  { re: /^1$/, value: "SELL" },
];

const REASON_PATTERNS: readonly { re: RegExp; value: ImportTradeRow["exitReason"] }[] = [
  { re: /^(tp|take profit|target)$/i, value: "TP" },
  { re: /^(sl|stop loss|stop)$/i, value: "SL" },
  { re: /^manual$/i, value: "MANUAL" },
  { re: /^(trailing|trail)$/i, value: "TRAILING" },
  { re: /^partial$/i, value: "PARTIAL" },
  { re: /^margin( call)?$/i, value: "MARGIN" },
];

function djb2Hash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

/** Stable externalRef when the broker CSV has no ticket column. */
export function fallbackExternalRef(row: string[]): string {
  return `csv-${djb2Hash(row.join("\u001F"))}`;
}

/** One CSV row → validated ImportTradeRow (or readable errors). */
export function mapRow(
  row: string[],
  mapping: ImportMapping,
  ctx: MapRowContext,
): { row?: ImportTradeRow; errors: string[] } {
  const errors: string[] = [];
  const cell = (field: ImportField): string => {
    const index = mapping[field];
    return index === UNMAPPED || index === undefined ? "" : (row[index]?.trim() ?? "");
  };
  const positive = (field: ImportField, label: string): string | null => {
    const raw = cell(field);
    if (raw === "") {
      errors.push(`${label} is required`);
      return null;
    }
    const value = parseCsvNumber(raw);
    if (value === null || !(value > 0)) {
      errors.push(`${label} is not a valid number (“${raw}”)`);
      return null;
    }
    return String(value);
  };

  // Symbol → catalog instrument
  const rawSymbol = cell("symbol");
  const instrumentId = rawSymbol !== "" ? ctx.resolveInstrumentId(rawSymbol) : null;
  if (rawSymbol === "") errors.push("Symbol is required");
  else if (instrumentId === null) errors.push(`Unknown symbol “${rawSymbol}” (add it to the catalog first)`);

  // Direction
  const rawDirection = cell("direction");
  let direction: "BUY" | "SELL" | null = null;
  for (const pattern of DIRECTION_PATTERNS) {
    if (pattern.re.test(rawDirection)) {
      direction = pattern.value;
      break;
    }
  }
  if (direction === null) errors.push(`Direction unreadable (“${rawDirection || "empty"}”)`);

  const entryPrice = positive("entryPrice", "Entry price");
  const exitPrice = positive("exitPrice", "Exit price");
  const quantity = positive("quantity", "Size");

  const entryAt = parseFlexibleDateTime(cell("entryAt"));
  if (entryAt === null) errors.push(`Entry time unreadable (“${cell("entryAt") || "empty"}”)`);
  const exitAt = parseFlexibleDateTime(cell("exitAt"));
  if (exitAt === null) errors.push(`Exit time unreadable (“${cell("exitAt") || "empty"}”)`);
  if (entryAt !== null && exitAt !== null && exitAt <= entryAt) {
    errors.push("Exit time is not after entry time");
  }

  if (errors.length > 0) return { errors };

  const optionalPrice = (field: ImportField): string | null => {
    const raw = cell(field);
    if (raw === "") return null;
    const value = parseCsvNumber(raw);
    return value !== null && value > 0 ? String(value) : null;
  };

  const rawReason = cell("exitReason");
  const exitReason =
    rawReason === ""
      ? null
      : (REASON_PATTERNS.find((pattern) => pattern.re.test(rawReason))?.value ?? null);

  const rawPnl = cell("brokerPnl");
  const rawPnlValue = rawPnl === "" ? null : (parseCsvNumber(rawPnl) ?? null);

  const decimalOrUndefined = (field: ImportField): string | undefined => {
    const raw = cell(field);
    if (raw === "") return undefined;
    const value = parseCsvNumber(raw);
    return value === null ? undefined : String(value);
  };

  return {
    row: {
      externalRef: cell("externalRef") !== "" ? cell("externalRef") : fallbackExternalRef(row),
      instrumentId: instrumentId!,
      direction: direction!,
      entryPrice: entryPrice!,
      entryAt: entryAt!,
      exitPrice: exitPrice!,
      exitAt: exitAt!,
      quantity: quantity!,
      initialStop: optionalPrice("initialStop"),
      initialTP: optionalPrice("initialTP"),
      fees: decimalOrUndefined("fees"),
      swap: decimalOrUndefined("swap"),
      exitReason,
      brokerPnl: rawPnlValue !== null ? String(rawPnlValue) : null,
      notes: null,
    },
    errors: [],
  };
}
