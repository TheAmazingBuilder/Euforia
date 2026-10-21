/**
 * Oryon temporal display helpers (Phase 8 spec §9) — PURE Intl formatting.
 *
 * Conventions audited and kept:
 *  - Transport/canonical: ISO-UTC (Z) and epoch ms — never ambiguous local
 *    strings, never fixed-offset arithmetic (spec §9).
 *  - Chart time axis + crosshair legend: UTC (the LWC UTCTimestamp domain —
 *    documented in lib/oryon/crosshair/format.ts, unchanged this phase).
 *  - User display timezone: Profile.timezone (PATCH /me — the repo's single
 *    source of truth, spec §9.1 "reuse it"), resolved by the hook in
 *    use-display-timezone.ts with the repo default as fallback.
 *
 * Changing the display timezone NEVER changes an event instant or a
 * session interval — these helpers format one instant differently, they
 * do not move data (spec §9.1).
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function cachedFormat(key: string, build: () => Intl.DateTimeFormat, ms: number): string {
  let fmt = formatters.get(key);
  if (fmt === undefined) {
    fmt = build();
    formatters.set(key, fmt);
    if (formatters.size > 64) {
      // Bounded cache — display zones are few; a full clear is simpler and
      // correct (formatters are stateless).
      formatters.clear();
      formatters.set(key, fmt);
    }
  }
  return fmt.format(new Date(ms));
}

/** Validate an IANA identifier against the platform (mirror of the shared
 *  ianaTimezoneSchema rule, for defensive profile reads). */
export function isValidIanaZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Short instant label ("Oct 4, 08:30"-style) in a zone. */
export function formatInstantInZone(ms: number, zone: string): string {
  if (!Number.isFinite(ms) || !isValidIanaZone(zone)) return "";
  return cachedFormat(
    `inst|${zone}`,
    () =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
    ms,
  );
}

/** Time-only label ("08:30") in a zone. */
export function formatTimeInZone(ms: number, zone: string): string {
  if (!Number.isFinite(ms) || !isValidIanaZone(zone)) return "";
  return cachedFormat(
    `time|${zone}`,
    () =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
    ms,
  );
}

/** Local date key (YYYY-MM-DD) of an instant in a zone. */
export function dateKeyInZone(ms: number, zone: string): string {
  if (!Number.isFinite(ms) || !isValidIanaZone(zone)) return "";
  return cachedFormat(
    `key|${zone}`,
    () =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
    ms,
  );
}

/** Zone abbreviation label ("EDT", "AEDT"…) at an instant — display only. */
export function zoneAbbreviation(ms: number, zone: string): string {
  if (!Number.isFinite(ms) || !isValidIanaZone(zone)) return "";
  const parts = cachedFormat(
    `abbr|${zone}`,
    () =>
      new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        timeZoneName: "short",
      }),
    ms,
  );
  const match = /[A-Z]{2,5}/.exec(parts);
  return match?.[0] ?? "";
}
