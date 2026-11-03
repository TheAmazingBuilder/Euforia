/**
 * Token-derived color helpers. The ONLY transformation allowed on theme
 * token values - components still never hardcode a hex (AGENTS.md golden
 * rule). Used to build translucent fills (chart areas, tints) from the
 * current theme's opaque tokens.
 */

/** "#RRGGBB" → "rgba(r, g, b, alpha)". Non-hex input passes through unchanged. */
export function withAlpha(hex: string, alpha: number): string {
  const normalized = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return hex;
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
