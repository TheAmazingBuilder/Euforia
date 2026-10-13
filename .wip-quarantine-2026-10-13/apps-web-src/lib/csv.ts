/**
 * Minimal, dependency-free CSV parsing/writing utilities for the trade
 * import. Handles quoted fields ("" escapes), auto-detects the delimiter
 (comma / semicolon / tab) from the header line, and normalizes header
 * names for column mapping.
 */

export interface ParsedCsv {
  header: string[];
  /** Raw string cells, quoted escapes resolved. */
  rows: string[][];
  /** The delimiter that was detected. */
  delimiter: string;
}

/** Detect the delimiter as the candidate that splits the first line into the most fields. */
function detectDelimiter(firstLine: string): string {
  const candidates = [",", ";", "\t"];
  let best = ",";
  let bestCount = 0;
  for (const candidate of candidates) {
    const count = firstLine.split(candidate).length;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

/** Split one CSV line by the delimiter, honoring double-quoted fields. */
function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (inQuotes) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

/** Parse a whole CSV text: header row + data rows (empty lines skipped). */
export function parseCsv(text: string): ParsedCsv {
  const clean = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = clean.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { header: [], rows: [], delimiter: "," };
  const delimiter = detectDelimiter(lines[0]!);
  const header = splitLine(lines[0]!, delimiter);
  const rows = lines.slice(1).map((line) => splitLine(line, delimiter));
  return { header, rows, delimiter };
}

/** Normalize a header cell for matching ("Entry Price $" → "entry_price"). */
export function normalizeHeader(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s\-.]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/** Escape one cell for CSV export (quotes + commas). */
export function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Case-insensitive direction parser: buy/long/b → BUY, sell/short/s → SELL. */
export function parseDirection(raw: string): "BUY" | "SELL" | null {
  const value = raw.trim().toLowerCase();
  if (["buy", "long", "b", "0"].includes(value)) return "BUY";
  if (["sell", "short", "s", "1"].includes(value)) return "SELL";
  return null;
}

/**
 * Parse a date cell into an ISO UTC string. Accepted: full ISO, "yyyy-mm-dd",
 * "dd/mm/yyyy" (fr locale default), each optionally with "HH:mm[:ss]".
 * Returns null when unparsable.
 */
export function parseFlexibleDate(raw: string): string | null {
  const value = raw.trim();
  if (value === "") return null;

  // ISO datetime or date
  if (/^\d{4}-\d{2}-\d{2}(T[\d:.-]+Z?)?$/.test(value)) {
    const iso = value.endsWith("Z") || value.includes("T") ? value : `${value}T12:00:00Z`;
    const time = Date.parse(iso.endsWith("Z") ? iso : `${iso.replace(/T$/, "T")}Z`);
    if (!Number.isFinite(time)) return null;
    return new Date(time).toISOString();
  }

  // dd/mm/yyyy [HH:mm[:ss]]
  const frMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (frMatch) {
    const [, day, month, year, hour = "12", minute = "00", second = "00"] = frMatch;
    const time = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    if (!Number.isFinite(time)) return null;
    return new Date(time).toISOString();
  }

  const fallback = Date.parse(value);
  return Number.isFinite(fallback) ? new Date(fallback).toISOString() : null;
}

/** Parse a positive decimal cell (comma decimal separator tolerated). */
export function parsePositiveNumber(raw: string): number | null {
  const value = Number(raw.trim().replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

/** Parse a (possibly signed / negative) decimal cell. */
export function parseNumber(raw: string): number | null {
  const value = Number(raw.trim().replace(",", "."));
  if (!Number.isFinite(value)) return null;
  return value;
}
