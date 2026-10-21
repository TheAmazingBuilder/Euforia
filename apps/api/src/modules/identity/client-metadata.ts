/**
 * Minimal user-agent → {device, browser, os} extraction (Phase 2 §16/§17).
 *
 * Data minimization: only the fields the contract requires for session
 * visibility. No dependency — a tiny, conservative parser for the major
 * browsers/OS; anything unrecognized degrades to honest "Unknown" values.
 */

export interface ClientMetadata {
  device: string;
  browser: string;
  os: string;
}

export function parseUserAgent(ua: string | undefined): ClientMetadata {
  const s = ua ?? "";
  return {
    device: detectDevice(s),
    browser: detectBrowser(s),
    os: detectOs(s),
  };
}

function detectDevice(s: string): string {
  if (/iPad|Tablet/i.test(s)) return "Tablet";
  if (/Mobi|iPhone|Android.*Mobile/i.test(s)) return "Mobile";
  return "Desktop";
}

function detectBrowser(s: string): string {
  // Order matters (spoofable UA strings contain multiple tokens).
  if (/Edg\//.test(s)) return "Edge";
  if (/OPR\/|Opera/.test(s)) return "Opera";
  if (/SamsungBrowser\//.test(s)) return "Samsung Internet";
  if (/Firefox\//.test(s)) return "Firefox";
  if (/Chrome\//.test(s)) return "Chrome";
  if (/Safari\//.test(s) && /Version\//.test(s)) return "Safari";
  if (s.length > 0) return "Unknown browser";
  return "Unknown browser";
}

function detectOs(s: string): string {
  if (/Windows NT 10/.test(s)) return "Windows";
  if (/Windows/.test(s)) return "Windows";
  if (/iPhone|iPad|iPod/.test(s)) return "iOS";
  if (/Mac OS X|Macintosh/.test(s)) return "macOS";
  if (/Android/.test(s)) return "Android";
  if (/Linux/.test(s)) return "Linux";
  return "Unknown OS";
}

/**
 * IP masking before ANY persistence or display (§11 data minimization):
 * IPv4 keeps the first three octets; IPv6 keeps the first four groups.
 */
export function maskIp(ip: string | undefined): string {
  if (!ip) return "unknown";
  if (ip.includes(".")) {
    const parts = ip.split(".");
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.x`;
    return "unknown";
  }
  if (ip.includes(":")) {
    const groups = ip.split(":").filter((g) => g.length > 0);
    if (groups.length >= 3) return `${groups.slice(0, 3).join(":")}::x`;
    return "unknown";
  }
  return "unknown";
}

/** Honest location label — no geo-IP, no invented data (schema §22 note). */
export const UNKNOWN_LOCATION = "Unknown";
