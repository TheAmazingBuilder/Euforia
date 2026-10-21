/**
 * CSV cell rendering — ONE shared definition for every client-side export
 * (trades ledger, analytics suite, monitoring event ledger).
 *
 * Two independent hazards are handled:
 *
 * 1. STRUCTURE — a value containing a comma, a double quote or a newline
 *    must be wrapped in double quotes with inner quotes doubled (RFC 4180).
 *
 * 2. FORMULA INJECTION (OWASP CSV injection) — spreadsheet applications
 *    interpret a cell that BEGINS with `=`, `+`, `-`, `@`, TAB or CR as a
 *    formula when the file opens. User-controlled free text (trade notes,
 *    strategy names, tag names, provider names) must therefore be neutralized
 *    with the standard single-quote prefix. NUMERIC-looking values are
 *    exempt: server-computed decimal strings ("-50", "-1.5") are legitimate
 *    data and must never be touched — the guard applies only to values that
 *    start with a dangerous character AND are not plain numbers.
 *
 * The prefix is displayed as text by Excel/LibreOffice/Numbers (the leading
 * apostrophe is consumed as a text marker), so legitimate text is preserved
 * verbatim for non-spreadsheet consumers apart from that one documented,
 * reversible character.
 */

/** Leading characters a spreadsheet may interpret as a formula. */
const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"] as const;

/** A plain number (optionally signed, optionally decimal) — never guarded. */
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const raw = typeof value === "number" ? String(value) : value;

  // Formula guard: only free text that starts with a dangerous character.
  let safe = raw;
  if (
    raw.length > 0 &&
    (FORMULA_PREFIXES as readonly string[]).includes(raw[0]!) &&
    !PLAIN_NUMBER.test(raw)
  ) {
    safe = `'${raw}`;
  }

  // Structural escape (RFC 4180).
  return safe.includes(",") || safe.includes("\"") || safe.includes("\n") || safe.includes("\r")
    ? `"${safe.replace(/"/g, "\"\"")}"`
    : safe;
}
