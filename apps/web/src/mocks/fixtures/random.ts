/**
 * Tiny deterministic PRNG utilities for the seeded fixture generator.
 * mulberry32 — 32-bit state, good enough for fixture realism, fully
 * reproducible: same seed → same data on every reload (no Math.random).
 */

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error("pick() on empty list");
  return items[Math.floor(rng() * items.length)] as T;
}

/** Inclusive integer in [min, max]. */
export function int(rng: Rng, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/** Uniform float in [min, max). */
export function float(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

export function chance(rng: Rng, p: number): boolean {
  return rng() < p;
}

/** Deterministic UUID v4-formatted string derived from the rng stream. */
export function uuid(rng: Rng): string {
  const hex = (count: number): string => {
    let out = "";
    for (let i = 0; i < count; i += 1) {
      out += Math.floor(rng() * 16).toString(16);
    }
    return out;
  };
  const variant = "89ab"[Math.floor(rng() * 4)] ?? "a";
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`;
}

/** Index sampled proportionally to `weights` (non-negative, non-empty). */
export function weightedIndex(rng: Rng, weights: readonly number[]): number {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = rng() * total;
  for (let i = 0; i < weights.length; i += 1) {
    roll -= weights[i] ?? 0;
    if (roll < 0) return i;
  }
  return weights.length - 1;
}
