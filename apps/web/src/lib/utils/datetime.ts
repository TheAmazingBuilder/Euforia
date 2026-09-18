/**
 * datetime-local input ↔ ISO-UTC conversion helpers.
 * Timestamps travel as ISO UTC (Z suffix) over the API; the <input type
 * ="datetime-local"> widget needs a local "YYYY-MM-DDTHH:mm" string.
 * User timezone handling for DISPLAY comes from the API — these helpers
 * are only for editable form widgets.
 */

const pad = (value: number): string => String(value).padStart(2, "0");

/** ISO string → local datetime-local value ("YYYY-MM-DDTHH:mm"), "" when invalid. */
export function isoToLocalInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** Local datetime-local value → ISO UTC string, null when invalid/empty. */
export function localInputToISO(local: string): string | null {
  if (!local) return null;
  const date = new Date(local);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/** Current moment as a datetime-local value (minute precision). */
export function nowLocalInput(): string {
  return isoToLocalInput(new Date().toISOString());
}

/**
 * Calendar date key (YYYY-MM-DD) → short display ("Sep 5"). Anchored at
 * midday UTC so no timezone can shift the key to another day (same trick
 * as the session view's weekday formatting).
 */
export function formatDateKeyShort(dateKey: string): string {
  const date = new Date(`${dateKey}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}
