/**
 * Recognition formatting helpers (Prompt 3 §47/§48) — centralized so every
 * surface renders financial values and dates identically. Prices keep their
 * recognized precision (2645.32 is never collapsed to 2,645); money shows
 * sign and currency; dates render in the user's locale from ISO UTC.
 */

/** Price with its meaningful decimals preserved (no thousands noise). */
export function formatPrice(value: string | null | undefined): string {
  if (value === null || value === undefined || value.trim() === "") return "—";
  const trimmed = value.trim().replace(/^\+/, "");
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return trimmed;
  const decimals = trimmed.includes(".") ? trimmed.split(".")[1].length : 0;
  return parsed.toLocaleString("en-US", {
    minimumFractionDigits: Math.min(decimals, 6),
    maximumFractionDigits: Math.min(decimals, 6),
  });
}

/** Signed P&L with currency — +146.80 USD / -52.10 USD. */
export function formatProfitLoss(
  value: string | null | undefined,
  currency: string | null | undefined,
): string {
  if (value === null || value === undefined || value.trim() === "") return "—";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  const sign = parsed > 0 ? "+" : parsed < 0 ? "−" : "";
  const body = Math.abs(parsed).toLocaleString("en-US", {
    minimumFractionDigits: decimalsOf(value),
    maximumFractionDigits: 2,
  });
  return currency ? `${sign}${body} ${currency}` : `${sign}${body}`;
}

export function isNegativeAmount(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed < 0;
}

function decimalsOf(value: string): number {
  const normalized = value.trim().replace(/^\+/, "");
  return normalized.includes(".") ? Math.min(normalized.split(".")[1].length, 2) : 0;
}

/** Volume — lots (0.10). */
export function formatVolume(value: string | null | undefined): string {
  return formatPrice(value);
}

/** Bytes → "2.4 MB" / "812 KB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Image format label from a mime type ("image/png" → "PNG"). */
export function formatImageType(mimeType: string): string {
  const short = mimeType.split("/")[1] ?? mimeType;
  const map: Record<string, string> = { jpeg: "JPG", svg: "SVG" };
  return (map[short] ?? short).toUpperCase();
}

/** ISO → "May 14, 2025 · 09:47" in the viewer's locale (§48). */
export function formatDateTime(iso: string | null | undefined): string {
  if (iso === null || iso === undefined) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** ISO → "May 14, 2025". */
export function formatDate(iso: string | null | undefined): string {
  if (iso === null || iso === undefined) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/** Coarse relative time for history rows ("2 min ago"). */
export function formatRelative(iso: string | null | undefined, nowMs: number): string {
  if (iso === null || iso === undefined) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const delta = Math.max(0, nowMs - then);
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d ago`;
  return formatDate(iso);
}

/** Processing duration → "8.4 s". */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}
