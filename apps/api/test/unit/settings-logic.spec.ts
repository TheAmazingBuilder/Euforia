/**
 * Unit - Settings pure logic (Phase 15 §38): defaults, one-domain merge,
 * one-domain reset, timezone write-through source.
 *
 * Invariants under test (§39):
 *   - updating one setting never mutates unrelated settings;
 *   - resetting Settings restores ONLY the targeted domain;
 *   - the defaults object itself is never mutated (safe re-provisioning).
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_USER_PREFERENCES,
  type UserPreferences,
} from "../../src/shared/contracts";
import {
  freshPreferencesDoc,
  mergeDomainIntoDoc,
  resetDomainInDoc,
  timezoneWriteThroughOf,
} from "../../src/modules/settings/settings.logic";

const NOW = new Date("2026-10-04T12:00:00.000Z");

describe("freshPreferencesDoc", () => {
  it("builds a complete document from safe defaults with server envelope", () => {
    const doc = freshPreferencesDoc("user-1", NOW);
    expect(doc.userId).toBe("user-1");
    expect(doc.updatedAt).toBe(NOW.toISOString());
    expect(doc.trading).toEqual(DEFAULT_USER_PREFERENCES.trading);
    expect(doc.risk).toEqual(DEFAULT_USER_PREFERENCES.risk);
    expect(doc.appearance.theme).toBe(DEFAULT_USER_PREFERENCES.appearance.theme);
    expect(doc.privacy.profileVisibility).toBe("PRIVATE");
  });

  it("deep-clones the defaults - mutating the doc never leaks into DEFAULT_USER_PREFERENCES", () => {
    const doc = freshPreferencesDoc("user-1", NOW);
    doc.trading.displayCurrency = "EUR";
    doc.journal.requiredFields.push("TAGS");
    expect(DEFAULT_USER_PREFERENCES.trading.displayCurrency).toBe("USD");
    expect(DEFAULT_USER_PREFERENCES.journal.requiredFields).toEqual(["STRATEGY", "STOP_LOSS"]);
  });
});

describe("mergeDomainIntoDoc", () => {
  it("replaces only the targeted domain and refreshes the envelope", () => {
    const doc = freshPreferencesDoc("user-1", NOW);
    const later = new Date(NOW.getTime() + 5_000);
    const next = mergeDomainIntoDoc(doc, "appearance", { theme: "LIGHT", density: "COMPACT", defaultDashboardLayout: "RISK_FIRST", pnlDisplay: "R_MULTIPLE" }, later);
    expect(next.appearance.theme).toBe("LIGHT");
    expect(next.updatedAt).toBe(later.toISOString());
    // §39 - sibling domains carried over verbatim.
    expect(next.trading).toEqual(doc.trading);
    expect(next.risk).toEqual(doc.risk);
    expect(next.journal).toEqual(doc.journal);
    expect(next.notifications).toEqual(doc.notifications);
    expect(next.privacy).toEqual(doc.privacy);
    expect(next.localization).toEqual(doc.localization);
  });

  it("never mutates the input document", () => {
    const doc = freshPreferencesDoc("user-1", NOW);
    const snapshot = structuredClone(doc);
    mergeDomainIntoDoc(doc, "risk", { ...DEFAULT_USER_PREFERENCES.risk, defaultRiskPerTradePct: 5 }, NOW);
    expect(doc).toEqual(snapshot as UserPreferences);
  });
});

describe("resetDomainInDoc", () => {
  it("restores ONLY the targeted domain to its defaults (§37)", () => {
    const later = new Date(NOW.getTime() + 5_000);
    const doc = mergeDomainIntoDoc(
      freshPreferencesDoc("user-1", NOW),
      "journal",
      { ...DEFAULT_USER_PREFERENCES.journal, requiredFields: ["STRATEGY", "STOP_LOSS", "TAGS", "PLANNED_RR"], requireScreenshot: true, defaultTemplate: "DEEP_REVIEW" },
      later,
    );
    const reset = resetDomainInDoc(doc, "journal", NOW);
    expect(reset.journal).toEqual(DEFAULT_USER_PREFERENCES.journal);
    expect(reset.trading).toEqual(doc.trading); // untouched
    expect(reset.risk).toEqual(doc.risk); // untouched
    expect(reset.updatedAt).toBe(NOW.toISOString());
  });

  it("resetting a domain does not clone defaults by reference (safe further edits)", () => {
    const doc = freshPreferencesDoc("user-1", NOW);
    const reset = resetDomainInDoc(doc, "journal", NOW);
    (reset.journal.requiredFields as string[]).push("TAGS");
    expect(DEFAULT_USER_PREFERENCES.journal.requiredFields).toEqual(["STRATEGY", "STOP_LOSS"]);
  });
});

describe("timezoneWriteThroughOf", () => {
  it("returns the timezone only from the localization domain (§15)", () => {
    expect(timezoneWriteThroughOf("localization", { timezone: "Europe/Paris" })).toBe("Europe/Paris");
    expect(timezoneWriteThroughOf("localization", {})).toBeNull();
    expect(timezoneWriteThroughOf("trading", { timezone: "Europe/Paris" })).toBeNull();
    expect(timezoneWriteThroughOf("appearance", { theme: "DARK" })).toBeNull();
  });
});
