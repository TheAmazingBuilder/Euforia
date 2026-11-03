/**
 * Analytics domain math (Phase 8) - pure numeric helpers.
 *
 * NO NestJS, NO Prisma, NO framework imports (§59 dependency direction).
 * Every formula here is the CANONICAL analytics definition shared with the
 * frontend contract semantics (packages/shared api.ts doc comments + the
 * product mock the frontend was built against): rounding, percentile
 * interpolation, sample statistics and the deterministic PRNG all match that
 * reference exactly so historical reporting stays reproducible (§52).
 *
 * Financial values arrive as numbers pre-parsed from Decimal(18,8) strings;
 * the aggregation happens in float (journal-scale precision is verified by
 * the data-consistency tests §63) and every value crossing back to the wire
 * is re-quantized by the mappers (round2/round1 + decimal-string formats).
 */
import { createHash } from "node:crypto";

/** Round to 2 decimals (number), matching the contract's round2 convention. */
export function round2(value: number): number {
  return Number(value.toFixed(2));
}

/** Round to 1 decimal (number) - streak averages, histogram centers. */
export function round1(value: number): number {
  return Number(value.toFixed(1));
}

/** Arithmetic mean; null on an empty list (the "no data" semantics, §54). */
export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function sortedAsc(values: number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

/**
 * Percentile with LINEAR interpolation between order statistics
 * (pos = (n−1)·p/100) - the reference percentile method of this system.
 */
export function percentileOf(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const list = sortedAsc(values);
  const pos = ((list.length - 1) * p) / 100;
  const low = Math.floor(pos);
  const high = Math.ceil(pos);
  const lowValue = list[low];
  const highValue = list[high];
  if (lowValue === undefined || highValue === undefined) return null;
  if (low === high) return lowValue;
  return lowValue + (highValue - lowValue) * (pos - low);
}

export function medianOf(values: number[]): number | null {
  return percentileOf(values, 50);
}

/** SAMPLE standard deviation (n−1); null below 2 values. */
export function stdOf(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values) as number;
  return Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1));
}

/**
 * Skewness / excess kurtosis of the R distribution - central moments
 * normalized by n, scaled by the SAMPLE std (the reference semantics; the
 * slight population/sample mix is reproduced verbatim for parity).
 */
export function moments(values: number[]): { skew: number | null; kurt: number | null } {
  const m = mean(values);
  const s = stdOf(values);
  if (m === null || s === null || s === 0 || values.length < 3) return { skew: null, kurt: null };
  const m3 = mean(values.map((v) => (v - m) ** 3)) as number;
  const m4 = mean(values.map((v) => (v - m) ** 4)) as number;
  return { skew: m3 / s ** 3, kurt: m4 / s ** 4 - 3 };
}

/** Round a histogram step to a human number (1/2/2.5/5 × 10^k). */
export function niceStep(raw: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-6)));
  for (const multiple of [1, 2, 2.5, 5, 10]) {
    if (raw <= multiple * magnitude) return multiple * magnitude;
  }
  return 10 * magnitude;
}

/**
 * mulberry32 - deterministic 32-bit PRNG (the reference implementation the
 * product mock uses). Monte Carlo MUST be reproducible: same seed + same
 * filtered R list ⇒ identical bands (§52 historical reproducibility). The
 * fixed seed is an intentional product decision, not a security feature.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic RFC-4122 v5-style UUID from a namespace + name (SHA-1).
 * Used ONLY as a stable GROUP identifier for journal symbols that have no
 * catalog row yet - never presented as a database reference.
 */
export function uuidV5(name: string, namespace: string): string {
  const namespaceBytes = parseUuidBytes(namespace);
  const nameBytes = Buffer.from(name, "utf8");
  const hash = createHash("sha1").update(Buffer.concat([namespaceBytes, nameBytes])).digest();
  // Version 5 + RFC-4122 variant bits (noUncheckedIndexedAccess-safe writes).
  hash.set([(hash[6]! & 0x0f) | 0x50], 6);
  hash.set([(hash[8]! & 0x3f) | 0x80], 8);
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function parseUuidBytes(uuid: string): Buffer {
  const hex = uuid.replace(/-/g, "");
  const bytes = Buffer.alloc(16);
  for (let i = 0; i < 16; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** COSMOZ analytics namespace (any fixed v4 uuid; documented constant). */
export const ANALYTICS_UUID_NAMESPACE = "6f0a1a86-9d92-4a2c-8f57-52f4d1f9a1c7";
