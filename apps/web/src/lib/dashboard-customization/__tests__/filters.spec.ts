import { describe, expect, it } from "vitest";
import type { DashboardFilters } from "@cosmoz/shared";

import {
  DEFAULT_DASHBOARD_FILTERS,
  DASHBOARD_PERIOD_OPTIONS,
  activeFilterChips,
  activeFilterCount,
  filtersEqual,
  filtersToSuiteFilters,
  isDefaultFilters,
  normalizeDashboardFilters,
} from "../filters";

describe("normalizeDashboardFilters", () => {
  it("passes a valid document through", () => {
    const filters = {
      period: "THIS_MONTH",
      accountId: "0b8f6e1e-7d2a-4c1b-9a2a-000000000001",
      strategyId: "none",
      direction: "BUY",
    } as const;
    expect(normalizeDashboardFilters(filters)).toEqual(filters);
  });

  it("falls back to defaults for non-object input", () => {
    expect(normalizeDashboardFilters(null)).toEqual(DEFAULT_DASHBOARD_FILTERS);
    expect(normalizeDashboardFilters("nonsense")).toEqual(DEFAULT_DASHBOARD_FILTERS);
    expect(normalizeDashboardFilters(undefined)).toEqual(DEFAULT_DASHBOARD_FILTERS);
  });

  it("falls back to defaults for an invalid document (bad uuid)", () => {
    expect(normalizeDashboardFilters({ accountId: "not-a-uuid" })).toEqual(
      DEFAULT_DASHBOARD_FILTERS,
    );
    expect(normalizeDashboardFilters({ period: "SOMEDAY" })).toEqual(
      DEFAULT_DASHBOARD_FILTERS,
    );
  });

  it("salvages valid dimensions when the date dimension is invalid", () => {
    const accountId = "0b8f6e1e-7d2a-4c1b-9a2a-000000000002";
    // CUSTOM without bounds degrades to ALL but keeps other dimensions.
    expect(normalizeDashboardFilters({ period: "CUSTOM", accountId })).toEqual({
      period: "ALL",
      accountId,
    });
    // Inverted custom bounds degrade to ALL too (never a fabricated window).
    expect(
      normalizeDashboardFilters({
        period: "CUSTOM",
        customFrom: "2026-05-02",
        customTo: "2026-05-01",
      }),
    ).toEqual({ period: "ALL" });
  });

  it("accepts a well-formed CUSTOM range", () => {
    const filters = normalizeDashboardFilters({
      period: "CUSTOM",
      customFrom: "2026-01-01",
      customTo: "2026-01-31",
    });
    expect(filters.period).toBe("CUSTOM");
    expect(filters.customFrom).toBe("2026-01-01");
  });
});

describe("period options", () => {
  it("only offers presets that exist in the suite contract", () => {
    // Every offered preset must be a real analyticsPeriodSchema value —
    // inventing LAST_7 would silently 422 on the server.
    const known = [
      "TODAY", "YESTERDAY", "THIS_WEEK", "LAST_WEEK", "THIS_MONTH",
      "LAST_MONTH", "THIS_QUARTER", "THIS_YEAR", "LAST_30", "LAST_90",
      "YTD", "ALL", "CUSTOM",
    ];
    for (const option of DASHBOARD_PERIOD_OPTIONS) {
      expect(known).toContain(option);
    }
    expect(DASHBOARD_PERIOD_OPTIONS).not.toContain("LAST_7");
  });
});

describe("filtersEqual / isDefaultFilters", () => {
  it("is order-insensitive and treats absent as undefined", () => {
    const accountId = "0b8f6e1e-7d2a-4c1b-9a2a-000000000003";
    const a: DashboardFilters = { period: "ALL", accountId };
    const b: DashboardFilters = { accountId, period: "ALL" };
    expect(filtersEqual(a, b)).toBe(true);
  });

  it("detects divergence on any dimension", () => {
    expect(isDefaultFilters({ period: "ALL" })).toBe(true);
    expect(isDefaultFilters({ period: "TODAY" })).toBe(false);
    expect(
      isDefaultFilters({
        period: "ALL",
        direction: "SELL",
      }),
    ).toBe(false);
  });
});

describe("chips", () => {
  it("extracts one chip per restricting dimension", () => {
    const chips = activeFilterChips({
      period: "LAST_30",
      accountId: "0b8f6e1e-7d2a-4c1b-9a2a-000000000004",
      strategyId: "none",
      direction: "BUY",
    });
    expect(chips.map((c) => c.dimension)).toEqual([
      "period",
      "account",
      "strategy",
      "direction",
    ]);
    expect(activeFilterCount({ period: "ALL" })).toBe(0);
  });
});

describe("filtersToSuiteFilters", () => {
  it("maps identity (strict subset of AnalyticsFilters)", () => {
    const filters = { period: "THIS_WEEK" } as const;
    expect(filtersToSuiteFilters(filters)).toEqual(filters);
  });
});
