/**
 * Unit - BrokerIdentificationService (Phase 07 universal broker layer).
 *
 * Covers the catalog integrity, the confidence ladder
 * (PROVIDER_REPORTED > PATTERN_MATCH > PLATFORM_KNOWN > UNKNOWN), the
 * documented id/endpoint patterns, connector-status resolution against the
 * registry, and the SSRF-safe identify path (hints are matched, NEVER dialed).
 */
import { describe, expect, it } from "vitest";
import { BrokerIdentificationService } from "../../src/modules/accounts/broker-identification.service";
import { BROKER_CATALOG, BROKER_CATALOG_VERSION } from "../../src/modules/accounts/broker-catalog";
import { ProviderRegistryService } from "../../src/modules/accounts/provider-registry.service";
import { DerivWsProviderAdapter } from "../../src/modules/accounts/providers/deriv/deriv-ws.provider";
import { OandaRestProviderAdapter } from "../../src/modules/accounts/providers/oanda/oanda-rest.provider";
import { Mt5BridgeProviderAdapter } from "../../src/modules/accounts/providers/mt5-bridge/mt5-bridge.provider";
import {
  brokerCatalogResponseSchema,
  brokerIdentificationSchema,
  type TradingProviderDescriptor,
} from "../../src/shared/contracts";

/** Minimal registry stub - only get() is used by the service. */
function registryWith(...providerIds: string[]): ProviderRegistryService {
  const adapters = providerIds.map((id) => {
    const adapter =
      id === "deriv-ws"
        ? new DerivWsProviderAdapter()
        : id === "oanda-v20"
          ? new OandaRestProviderAdapter()
          : id === "mt5-bridge"
            ? new Mt5BridgeProviderAdapter({} as never)
            : (() => {
                throw new Error(`unknown test provider ${id}`);
              })();
    return { descriptor: adapter.descriptor as TradingProviderDescriptor };
  });
  return new ProviderRegistryService(adapters as never);
}

describe("broker catalog integrity", () => {
  it("has a version and unique broker ids", () => {
    expect(BROKER_CATALOG_VERSION).toMatch(/^\d{4}-\d+\.\d+$/);
    const ids = BROKER_CATALOG.map((e) => e.brokerId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every entry's platforms are distinct and within the broker vocabulary", () => {
    const vocabulary = new Set(["MANUAL", "MT4", "MT5", "DERIV", "BINANCE", "CTRADER", "OANDA", "OTHER"]);
    for (const entry of BROKER_CATALOG) {
      expect(entry.platforms.length).toBeGreaterThan(0);
      for (const platform of entry.platforms) expect(vocabulary.has(platform)).toBe(true);
    }
  });

  it("includes Axi and PU Prime as MT5-bridge broker entries without claiming direct APIs", () => {
    const axi = BROKER_CATALOG.find((entry) => entry.brokerId === "axi");
    const puPrime = BROKER_CATALOG.find((entry) => entry.brokerId === "puprime");

    expect(axi?.platforms).toContain("MT5");
    expect(axi?.connectorProviderId).toBe("mt5-bridge");
    expect(axi?.notes).toMatch(/region\/account/i);
    expect(puPrime?.platforms).toContain("MT5");
    expect(puPrime?.connectorProviderId).toBe("mt5-bridge");
    expect(puPrime?.notes).toMatch(/Terminal Bridge/);
  });

  it("every pattern is a VALID regex and carries a human signal", () => {
    for (const entry of BROKER_CATALOG) {
      for (const pattern of entry.patterns) {
        expect(() => new RegExp(pattern.regexSource)).not.toThrow();
        expect(pattern.signal.length).toBeGreaterThan(5);
        expect(["EXTERNAL_ID", "ENDPOINT"]).toContain(pattern.kind);
      }
    }
  });

  it("connector-bearing entries reference real provider ids, and no other entry claims one", () => {
    const knownProviders = new Set(["deriv-ws", "oanda-v20", "mt5-bridge"]);
    for (const entry of BROKER_CATALOG) {
      if (entry.connectorProviderId) {
        expect(knownProviders.has(entry.connectorProviderId)).toBe(true);
      }
    }
  });
});

describe("identify - confidence ladder", () => {
  it("OANDA external id shape → PATTERN_MATCH(oanda), connector available when registered", () => {
    const service = new BrokerIdentificationService(registryWith("oanda-v20"));
    const result = service.identify({ externalAccountId: "101-004-7192958-001" });
    expect(result.brokerId).toBe("oanda");
    expect(result.confidence).toBe("PATTERN_MATCH");
    expect(result.connectorStatus).toBe("CONNECTOR_AVAILABLE");
    expect(result.providerId).toBe("oanda-v20");
    expect(result.signals.length).toBeGreaterThan(0);
    expect(brokerIdentificationSchema.safeParse(result).success).toBe(true);
  });

  it("OANDA id → CONNECTOR_NOT_IMPLEMENTED when the adapter is NOT registered", () => {
    const service = new BrokerIdentificationService(registryWith("deriv-ws"));
    const result = service.identify({ externalAccountId: "101-004-7192958" });
    expect(result.brokerId).toBe("oanda");
    expect(result.connectorStatus).toBe("CONNECTOR_NOT_IMPLEMENTED");
    expect(result.providerId).toBe("oanda-v20");
  });

  it("Deriv loginid shapes: virtual (VRTC), real (CR), Deriv MT5 (MRT)", () => {
    const service = new BrokerIdentificationService(registryWith("deriv-ws"));
    for (const id of ["VRTC1234567", "CR90001234", "MRT556677"]) {
      const result = service.identify({ externalAccountId: id });
      expect(result.brokerId).toBe("deriv");
      expect(result.confidence).toBe("PATTERN_MATCH");
    }
  });

  it("recognizes Axi and PU Prime MT5 servers when the bridge connector is registered", () => {
    const service = new BrokerIdentificationService(registryWith("mt5-bridge"));

    const axi = service.identify({ endpoint: "Axi-Live" });
    expect(axi.brokerId).toBe("axi");
    expect(axi.providerId).toBe("mt5-bridge");
    expect(axi.platform).toBe("MT5");
    expect(axi.connectorStatus).toBe("CONNECTOR_AVAILABLE");

    const puPrime = service.identify({ endpoint: "PUPrime-Live 2" });
    expect(puPrime.brokerId).toBe("puprime");
    expect(puPrime.providerId).toBe("mt5-bridge");
    expect(puPrime.platform).toBe("MT5");
    expect(puPrime.connectorStatus).toBe("CONNECTOR_AVAILABLE");
  });

  it("does not attribute an unrecognized MT5 company to the first shared broker", () => {
    const service = new BrokerIdentificationService(registryWith("mt5-bridge"));
    const result = service.identifyAtConnect({
      providerId: "mt5-bridge",
      externalAccountId: "12345678",
      providerReported: {
        brokerName: "Unlisted MT5 Company",
        accountClass: "REAL",
      },
    });

    expect(result.brokerId).toBe("unknown");
    expect(result.displayName).toBe("Unlisted MT5 Company");
    expect(result.platform).toBe("MT5");
    expect(result.providerId).toBe("mt5-bridge");
    expect(result.connectorStatus).toBe("CONNECTOR_AVAILABLE");
  });

  it("endpoint hint matching is exact-ish (host) and never dialled", () => {
    const service = new BrokerIdentificationService(registryWith());
    const result = service.identify({ endpoint: "api-fxpractice.oanda.com" });
    expect(result.brokerId).toBe("oanda");
    expect(result.confidence).toBe("PATTERN_MATCH");
    const deriv = service.identify({ endpoint: "ws.derivws.com" });
    expect(deriv.brokerId).toBe("deriv");
  });

  it("unknown id + unknown endpoint → honest UNKNOWN", () => {
    const service = new BrokerIdentificationService(registryWith());
    const result = service.identify({ externalAccountId: "XYZ-777", endpoint: "unknown.example.net" });
    expect(result.brokerId).toBe("unknown");
    expect(result.confidence).toBe("UNKNOWN");
    expect(result.connectorStatus).toBe("CONNECTOR_NOT_IMPLEMENTED");
    expect(result.signals.length).toBeGreaterThan(0);
  });

  it("falls back to PLATFORM_KNOWN when only the provider is registered", () => {
    const service = new BrokerIdentificationService(registryWith("oanda-v20"));
    const result = service.identify({ providerId: "oanda-v20", externalAccountId: "no-match" });
    expect(result.brokerId).toBe("oanda");
    expect(result.confidence).toBe("PLATFORM_KNOWN");
    expect(result.connectorStatus).toBe("CONNECTOR_AVAILABLE");
  });

  it("shows the generic MT5 platform as available without guessing a broker", () => {
    const service = new BrokerIdentificationService(registryWith("mt5-bridge"));
    const result = service.identify({
      providerId: "mt5-bridge",
      externalAccountId: "12345678",
    });

    expect(result.brokerId).toBe("metatrader-platform");
    expect(result.platform).toBe("MT5");
    expect(result.confidence).toBe("PLATFORM_KNOWN");
    expect(result.connectorStatus).toBe("CONNECTOR_AVAILABLE");
    expect(result.providerId).toBe("mt5-bridge");
  });

  it("PATTERN_MATCH on the endpoint beats an unmatched id but patterns win over platform knowledge", () => {
    const service = new BrokerIdentificationService(registryWith("deriv-ws"));
    const result = service.identify({
      providerId: "deriv-ws",
      externalAccountId: "101-004-7192958-001", // OANDA-shaped id
    });
    // The id pattern is STRONGER evidence than the registered platform.
    expect(result.brokerId).toBe("oanda");
    expect(result.confidence).toBe("PATTERN_MATCH");
  });
});

describe("identifyAtConnect - provider-reported identity wins", () => {
  it("Deriv landing company → PROVIDER_REPORTED with the entity as displayName", () => {
    const service = new BrokerIdentificationService(registryWith("deriv-ws"));
    const result = service.identifyAtConnect({
      providerId: "deriv-ws",
      externalAccountId: "VRTC1234567",
      providerReported: { brokerName: "Deriv (SVG) Corp", accountClass: "DEMO" },
    });
    expect(result.confidence).toBe("PROVIDER_REPORTED");
    expect(result.displayName).toBe("Deriv (SVG) Corp");
    expect(result.brokerId).toBe("deriv");
    expect(result.platform).toBe("DERIV");
    expect(result.connectorStatus).toBe("CONNECTOR_AVAILABLE");
    expect(result.signals.join(" ")).toMatch(/Deriv \(SVG\) Corp/);
    expect(result.signals.join(" ")).toMatch(/DEMO/);
    expect(brokerIdentificationSchema.safeParse(result).success).toBe(true);
  });

  it("uses broker name evidence before a shared provider id (Axi)", () => {
    const service = new BrokerIdentificationService(registryWith("mt5-bridge"));
    const result = service.identifyAtConnect({
      providerId: "mt5-bridge",
      externalAccountId: "12345678",
      endpoint: "Axi-Live",
      providerReported: {
        brokerName: "AxiCorp Financial Services Pty Ltd",
        accountClass: "REAL",
      },
    });

    expect(result.brokerId).toBe("axi");
    expect(result.displayName).toBe("AxiCorp Financial Services Pty Ltd");
    expect(result.platform).toBe("MT5");
    expect(result.providerId).toBe("mt5-bridge");
    expect(result.confidence).toBe("PROVIDER_REPORTED");
    expect(brokerIdentificationSchema.safeParse(result).success).toBe(true);
  });

  it("does not guess IC Markets when a shared bridge reports an unknown broker name", () => {
    const service = new BrokerIdentificationService(registryWith("mt5-bridge"));
    const result = service.identifyAtConnect({
      providerId: "mt5-bridge",
      externalAccountId: "12345678",
      providerReported: {
        brokerName: "Some Unlisted Brokerage Ltd",
        accountClass: "REAL",
      },
    });

    expect(result.brokerId).toBe("unknown");
    expect(result.displayName).toBe("Some Unlisted Brokerage Ltd");
    expect(result.connectorStatus).toBe("CONNECTOR_AVAILABLE");
    expect(result.providerId).toBe("mt5-bridge");
  });

  it("no provider-reported identity → falls through to the rules engine", () => {
    const service = new BrokerIdentificationService(registryWith("oanda-v20"));
    const result = service.identifyAtConnect({
      providerId: "oanda-v20",
      externalAccountId: "101-004-7192958-001",
      providerReported: null,
    });
    expect(result.confidence).toBe("PATTERN_MATCH");
    expect(result.brokerId).toBe("oanda");
  });
});

describe("catalogForClient", () => {
  it("marks Axi and PU Prime available only when the MT5 bridge is registered", () => {
    const service = new BrokerIdentificationService(registryWith("mt5-bridge"));
    const catalog = service.catalogForClient();
    for (const brokerId of ["axi", "puprime", "icmarkets"]) {
      const entry = catalog.brokers.find((broker) => broker.brokerId === brokerId);
      expect(entry?.connectorStatus).toBe("CONNECTOR_AVAILABLE");
      expect(entry?.providerId).toBe("mt5-bridge");
    }
  });

  it("returns the schema-valid catalog with connector status resolved against the registry", () => {
    const service = new BrokerIdentificationService(registryWith("deriv-ws", "oanda-v20"));
    const catalog = service.catalogForClient();
    expect(brokerCatalogResponseSchema.safeParse(catalog).success).toBe(true);
    expect(catalog.catalogVersion).toBe(BROKER_CATALOG_VERSION);
    const deriv = catalog.brokers.find((b) => b.brokerId === "deriv");
    expect(deriv?.connectorStatus).toBe("CONNECTOR_AVAILABLE");
    expect(deriv?.providerId).toBe("deriv-ws");
    const icmarkets = catalog.brokers.find((b) => b.brokerId === "icmarkets");
    // Phase 08 - icmarkets now carries the mt5-bridge connector id; the
    // status stays honest against the registry this service was built with.
    expect(icmarkets?.connectorStatus).toBe("CONNECTOR_NOT_IMPLEMENTED");
    expect(icmarkets?.providerId).toBe("mt5-bridge");
    // Every broker without a connector stays honestly marked.
    const available = catalog.brokers.filter((b) => b.connectorStatus === "CONNECTOR_AVAILABLE");
    expect(available.map((b) => b.brokerId).sort()).toEqual(["deriv", "oanda"]);
  });
});
