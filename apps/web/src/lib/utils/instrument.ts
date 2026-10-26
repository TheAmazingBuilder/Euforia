import type { AssetClass } from "@cosmoz/shared";

/**
 * Instrument display helpers - asset-class aware UI copy.
 * Labels are driven by instrument metadata, never by per-asset-class
 * constants in business code (trade-entry-ux.md §4 "Asset-class adaptation").
 */

const ASSET_CLASS_BADGES: Record<AssetClass, string> = {
  FOREX: "FX",
  CRYPTO: "Crypto",
  SYNTHETIC: "Synthetic",
  INDEX: "Index",
  METAL: "Metal",
  ENERGY: "Energy",
};

/** Compact badge label for an asset class ("FX", "Synthetic"…). */
export function assetClassBadge(assetClass: AssetClass): string {
  return ASSET_CLASS_BADGES[assetClass];
}

const SIZE_UNIT_LABELS: Record<AssetClass, string> = {
  FOREX: "lots",
  CRYPTO: "units",
  SYNTHETIC: "stake",
  INDEX: "units",
  METAL: "oz",
  ENERGY: "units",
};

/** Unit word for the position size of an asset class ("lots"/"stake"/"units"). */
export function sizeUnitLabel(assetClass: AssetClass): string {
  return SIZE_UNIT_LABELS[assetClass];
}
