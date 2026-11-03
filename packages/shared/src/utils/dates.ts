/**
 * Trading-date helpers - pure, Intl-based, NO date library.
 *
 * Contract reminder (AGENTS.md): tradingDate is computed by the API and the
 * client never invents it for stored data. This helper exists for parity
 * (tests, optimistic previews, mock tooling) - NOT to replace the server.
 */

/**
 * Convert a UTC ISO timestamp into the user's local trading day key
 * ("YYYY-MM-DD") for a given IANA timezone, e.g.
 * toTradingDateKey("2026-09-17T23:30:00Z", "America/Toronto") → "2026-09-17",
 * toTradingDateKey("2026-09-17T23:30:00Z", "Europe/Paris") → "2026-09-18".
 *
 * Throws RangeError on an invalid date string or unknown timezone - a silent
 * wrong day would corrupt every per-day stat, so loud failure is intended.
 */
export function toTradingDateKey(utcISO: string, timezone: string): string {
  const date = new Date(utcISO);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Invalid UTC timestamp: ${utcISO}`);
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (year === undefined || month === undefined || day === undefined) {
    throw new RangeError(`Cannot resolve trading date for timezone: ${timezone}`);
  }
  return `${year}-${month}-${day}`;
}
