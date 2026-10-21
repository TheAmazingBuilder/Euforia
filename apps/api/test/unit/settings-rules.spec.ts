/**
 * Unit — Settings domain rules (Phase 15 §38): defaults, per-domain merge,
 * reset scoping, full-doc invariant, read-mirror resolution and the §33
 * audit triage. Pure functions — no framework, no database.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_USER_PREFERENCES,
  userPreferencesSchema,
  type UserPreferences,
} from "../../src/shared/contracts";
import {
  PREFERENCE_DOMAIN_SCHEMAS,
  buildFreshPreferences,
  extractSensitiveChanges,
  mergeDomain,
  parseStoredPreferences,
  resetDomainToDefaults,
} from "../../src/modules/settings/domain/settings-rules";
import { resolveProfileTimezone, toPreferences } from "../../src/modules/settings/settings.mappers";

const NOW = new Date("2026-10-04T00:00:00.000Z");

function freshDoc(): UserPreferences {
  return buildFreshPreferences("11111111-1111-4111-8111-111111111111", NOW);
}

describe("buildFreshPreferences", () => {
  it("seeds every domain from the safe shared defaults + envelope", () => {
    const doc = freshDoc();
    expect(doc.userId).toBe("11111111-1111-4111-8111-111111111111");
    expect(doc.updatedAt).toBe(NOW.toISOString());
    for (const domain of ["trading", "risk", "journal", "notifications", "appearance", "dashboard", "academy", "privacy", "localization"] as const) {
      expect(doc[domain]).toEqual(DEFAULT_USER_PREFERENCES[domain]);
    }
    expect(userPreferencesSchema.safeParse(doc).success).toBe(true);
  });

  it("deep-clones — mutating the doc never leaks into the shared defaults", () => {
    const doc = freshDoc();
    doc.appearance.theme = "LIGHT";
    expect(DEFAULT_USER_PREFERENCES.appearance.theme).toBe("DARK_BLUE");
  });
});

describe("parseStoredPreferences", () => {
  it("returns defaults for an absent raw doc", () => {
    const doc = parseStoredPreferences(null, "u", NOW);
    expect(doc.appearance).toEqual(DEFAULT_USER_PREFERENCES.appearance);
  });

  it("accepts a valid stored doc and revalidates against the contract", () => {
    const stored = freshDoc();
    expect(parseStoredPreferences(stored, "u", NOW).trading).toEqual(stored.trading);
  });

  it("rejects a corrupted stored doc (defense in depth)", () => {
    expect(() => parseStoredPreferences({ trading: "nope" }, "u", NOW)).toThrow();
  });
});

describe("mergeDomain", () => {
  it("replaces ONLY the target domain and refreshes updatedAt", () => {
    const previous = freshDoc();
    const parsed = PREFERENCE_DOMAIN_SCHEMAS.appearance.parse({
      theme: "LIGHT",
      density: "COMPACT",
      defaultDashboardLayout: "RISK_FIRST",
      pnlDisplay: "R_MULTIPLE",
    });
    const next = mergeDomain(previous, "appearance", parsed, NOW);
    expect(next.appearance.theme).toBe("LIGHT");
    expect(next.appearance.density).toBe("COMPACT");
    expect(next.updatedAt).toBe(NOW.toISOString());
    // Unrelated domains are untouched, never reset.
    expect(next.risk).toEqual(previous.risk);
    expect(next.trading).toEqual(previous.trading);
    expect(next.localization).toEqual(previous.localization);
  });

  it("keeps the full-document invariant — a bad domain value cannot persist", () => {
    expect(() => PREFERENCE_DOMAIN_SCHEMAS.risk.parse({ garbage: true })).toThrow();
  });
});

describe("resetDomainToDefaults", () => {
  it("restores one domain to defaults and nothing else (§37)", () => {
    const previous = freshDoc();
    previous.appearance.theme = "LIGHT";
    previous.risk.defaultRiskPerTradePct = 0.5;
    const next = resetDomainToDefaults(previous, "appearance", NOW);
    expect(next.appearance).toEqual(DEFAULT_USER_PREFERENCES.appearance);
    expect(next.risk.defaultRiskPerTradePct).toBe(0.5); // other domains untouched
  });
});

describe("extractSensitiveChanges (§33 audit triage)", () => {
  it("flags timezone changes only when the value actually changed", () => {
    const previous = freshDoc();
    const nextSame = { ...previous, localization: { ...previous.localization } };
    expect(extractSensitiveChanges("localization", previous, nextSame)).toEqual([]);

    const nextChanged = {
      ...previous,
      localization: { ...previous.localization, timezone: "Europe/Paris" },
    };
    expect(extractSensitiveChanges("localization", previous, nextChanged)).toEqual([
      "Timezone changed to Europe/Paris.",
    ]);
  });

  it("flags every privacy update (consent surface)", () => {
    const previous = freshDoc();
    const next = mergeDomain(previous, "privacy", PREFERENCE_DOMAIN_SCHEMAS.privacy.parse({
      ...previous.privacy,
      usageAnalytics: false,
    }), NOW);
    expect(extractSensitiveChanges("privacy", previous, next)).toEqual([
      "Privacy preferences updated.",
    ]);
  });

  it("flags default-account changes including the cleared state", () => {
    const previous = freshDoc();
    const withAccount = mergeDomain(previous, "trading", PREFERENCE_DOMAIN_SCHEMAS.trading.parse({
      ...previous.trading,
      defaultAccountId: "22222222-2222-4222-8222-222222222222",
    }), NOW);
    expect(extractSensitiveChanges("trading", previous, withAccount)).toEqual([
      "Default trading account changed.",
    ]);

    const cleared = mergeDomain(withAccount, "trading", PREFERENCE_DOMAIN_SCHEMAS.trading.parse({
      ...withAccount.trading,
      defaultAccountId: null,
    }), NOW);
    expect(extractSensitiveChanges("trading", withAccount, cleared)).toEqual([
      "Default trading account cleared.",
    ]);
  });

  it("never flags cosmetic domains (appearance/journal/…)", () => {
    const previous = freshDoc();
    const next = resetDomainToDefaults(previous, "journal", NOW);
    expect(extractSensitiveChanges("journal", previous, next)).toEqual([]);
  });
});

describe("read-side timezone mirror (settings.mappers)", () => {
  it("overrides the stored mirror with the profile timezone on every read", () => {
    const row = { preferences: { ...freshDoc(), localization: { ...freshDoc().localization, timezone: "Europe/Paris" } } };
    const served = toPreferences(row, "America/Toronto");
    expect(served.localization.timezone).toBe("America/Toronto");
  });

  it("falls back to the safe default timezone when the profile has none", () => {
    expect(resolveProfileTimezone(null)).toBe(DEFAULT_USER_PREFERENCES.localization.timezone);
    expect(resolveProfileTimezone(undefined)).toBe(DEFAULT_USER_PREFERENCES.localization.timezone);
    expect(resolveProfileTimezone("Europe/Paris")).toBe("Europe/Paris");
  });
});
