/**
 * Contract-test harness (Phase 0 §Q "contract-test harness" deliverable).
 *
 * Proves the shared contract package is liftable into the backend verbatim
 * through the src/shared/contracts barrel — the same import surface future
 * bounded contexts will use for request/response validation.
 */
import { describe, expect, it } from "vitest";
import {
  COSMOZ_VERSION,
  capabilitySupportLevel,
  connectionCapabilityOverrideSchema,
  dateKeySchema,
  decimalStringSchema,
  isoDateTimeSchema,
  tradingProviderDescriptorSchema,
  TRADING_ERROR_CODES,
  uuidSchema,
} from "../../src/shared/contracts";

describe("shared contracts liftability", () => {
  it("exposes the shared version constant", () => {
    expect(typeof COSMOZ_VERSION).toBe("string");
    expect(COSMOZ_VERSION.length).toBeGreaterThan(0);
  });

  it("decimalStringSchema — money/prices are strings on the wire, never numbers", () => {
    expect(decimalStringSchema.safeParse("12.50000000").success).toBe(true);
    expect(decimalStringSchema.safeParse("-0.5").success).toBe(true);
    // A JS number must NEVER be accepted where a decimal string is required.
    expect(decimalStringSchema.safeParse(12.5).success).toBe(false);
    expect(decimalStringSchema.safeParse("NaN").success).toBe(false);
  });

  it("isoDateTimeSchema — UTC ISO-8601 with Z suffix is mandatory", () => {
    expect(isoDateTimeSchema.safeParse("2026-10-03T09:30:00Z").success).toBe(true);
    expect(isoDateTimeSchema.safeParse("2026-10-03T09:30:00+02:00").success).toBe(false);
    expect(isoDateTimeSchema.safeParse("2026-10-03").success).toBe(false);
  });

  it("dateKeySchema — calendar-validated YYYY-MM-DD", () => {
    expect(dateKeySchema.safeParse("2026-10-03").success).toBe(true);
    expect(dateKeySchema.safeParse("2026-13-40").success).toBe(false);
  });

  it("uuidSchema — stable identifier format", () => {
    expect(uuidSchema.safeParse("01890a5d-ac96-774b-bcce-b302099a8057").success).toBe(true);
    expect(uuidSchema.safeParse("not-a-uuid").success).toBe(false);
  });

  // ── Phase 03 — capability model V2 (doc B §4.2) + error table ────────────

  it("tradingProviderDescriptorSchema accepts BOTH capability shapes (per-adapter migration)", () => {
    const v1Descriptor = {
      providerId: "MOCK",
      providerName: "Mock",
      platform: "MT5",
      supportedEnvironments: ["DEMO"],
      supportedConnectionMethods: ["API_KEY"],
      supportedPermissions: ["READ_ACCOUNT"],
      capabilities: { account: true, snapshot: true, positions: true, orders: false, deals: true, history: true },
      isMock: true,
    };
    const v2Descriptor = {
      providerId: "oanda-v20",
      providerName: "OANDA v20 REST",
      platform: "OANDA",
      supportedEnvironments: ["DEMO", "LIVE"],
      supportedConnectionMethods: ["API_KEY"],
      supportedPermissions: ["READ_ACCOUNT"],
      capabilities: {
        accountDiscovery: { support: "UNKNOWN" },
        accountMetadata: { support: "SUPPORTED", retrieval: "POLL" },
        balanceEquity: { support: "SUPPORTED", retrieval: "POLL" },
        marginInfo: { support: "SUPPORTED" },
        openPositions: { support: "SUPPORTED" },
        orders: { support: "SUPPORTED" },
        deals: { support: "SUPPORTED" },
        historyDepth: { support: "UNKNOWN", limitation: "U2" },
        streamingAccountUpdates: { support: "UNSUPPORTED" },
        streamingPositions: { support: "UNSUPPORTED" },
        streamingOrderDealUpdates: { support: "UNSUPPORTED" },
        connectionValidation: { support: "SUPPORTED" },
        credentialRevocation: { support: "SUPPORTED" },
      },
      isMock: false,
    };
    expect(tradingProviderDescriptorSchema.safeParse(v1Descriptor).success).toBe(true);
    expect(tradingProviderDescriptorSchema.safeParse(v2Descriptor).success).toBe(true);
  });

  it("capabilitySupportLevel bridges V1 booleans and V2 three-state declarations", () => {
    const v1 = { account: true, snapshot: true, positions: false, orders: true, deals: true, history: false };
    expect(capabilitySupportLevel(v1, "balanceEquity")).toBe("SUPPORTED");
    expect(capabilitySupportLevel(v1, "openPositions")).toBe("UNSUPPORTED");
    // V1 cannot express UNKNOWN — keys outside its 6 booleans answer UNKNOWN.
    expect(capabilitySupportLevel(v1, "accountDiscovery")).toBe("UNKNOWN");
    expect(capabilitySupportLevel(v1, "streamingAccountUpdates")).toBe("UNKNOWN");
    const v2 = {
      accountDiscovery: { support: "UNKNOWN" },
      accountMetadata: { support: "SUPPORTED" },
      balanceEquity: { support: "SUPPORTED" },
      marginInfo: { support: "UNKNOWN" },
      openPositions: { support: "SUPPORTED" },
      orders: { support: "UNSUPPORTED" },
      deals: { support: "SUPPORTED" },
      historyDepth: { support: "UNKNOWN" },
      streamingAccountUpdates: { support: "UNSUPPORTED" },
      streamingPositions: { support: "UNSUPPORTED" },
      streamingOrderDealUpdates: { support: "UNSUPPORTED" },
      connectionValidation: { support: "SUPPORTED" },
      credentialRevocation: { support: "SUPPORTED" },
    } as const;
    expect(capabilitySupportLevel(v2, "orders")).toBe("UNSUPPORTED");
    expect(capabilitySupportLevel(v2, "deals")).toBe("SUPPORTED");
    expect(capabilitySupportLevel(v2, "accountDiscovery")).toBe("UNKNOWN");
  });

  it("connectionCapabilityOverrideSchema — connection-scoped narrowing with a mandatory reason", () => {
    expect(
      connectionCapabilityOverrideSchema.safeParse({
        capability: "deals",
        support: "UNSUPPORTED",
        reason: "practice accounts expose no order history",
      }).success,
    ).toBe(true);
    expect(
      connectionCapabilityOverrideSchema.safeParse({ capability: "deals", support: "UNSUPPORTED" }).success,
    ).toBe(false); // reason mandatory — conditions attach with evidence
    expect(
      connectionCapabilityOverrideSchema.safeParse({ capability: "notAKey", support: "SUPPORTED", reason: "x" }).success,
    ).toBe(false);
  });

  it("TRADING_ERROR_CODES includes the Phase 03 capability code (422-class)", () => {
    expect(TRADING_ERROR_CODES.UNSUPPORTED_CAPABILITY).toBe("UNSUPPORTED_CAPABILITY");
  });
});
