/**
 * BrokerIdentificationService (Phase 07 — universal broker layer).
 *
 * Answers "WHICH broker is this?" for any connection attempt — the owner's
 * requirement that Euforia welcome ANY broker, not only the implemented
 * connectors. Three entry points:
 *
 *  1. catalogForClient() — the versioned catalog with HONEST connector
 *     status per broker (resolved against the provider registry at call
 *     time), powering the Accounts UI broker picker.
 *  2. identify(hints) — rule-based identification for the identify endpoint.
 *     NO outbound call, NO secrets accepted, client-supplied endpoint strings
 *     are matched against catalog patterns and never dialed (SSRF-safe by
 *     construction).
 *  3. identifyAtConnect(...) — the connect-time capture: the adapter's
 *     PROVIDER-REPORTED broker identity (strongest evidence, e.g. Deriv's
 *     landing company) takes priority; catalog patterns and the registry
 *     descriptor fall through in that order. The result is persisted on the
 *     TradingAccount (brokerIdentity JSON) with its confidence and signals.
 *
 * Honesty ladder (confidence, strongest first):
 *   PROVIDER_REPORTED → PATTERN_MATCH → PLATFORM_KNOWN → UNKNOWN.
 * UNKNOWN is a first-class result — never fabricated into a guess.
 */
import { Injectable } from "@nestjs/common";
import {
  brokerIdentificationSchema,
  type BrokerCatalogResponse,
  type BrokerIdentification,
  type BrokerIdentifyInput,
  type TradingProviderDescriptor,
} from "../../shared/contracts";
import { ProviderRegistryService } from "./provider-registry.service";
import { isoDateTime } from "./mappers";
import {
  BROKER_CATALOG,
  BROKER_CATALOG_VERSION,
  type BrokerCatalogEntryDef,
} from "./broker-catalog";

@Injectable()
export class BrokerIdentificationService {
  constructor(private readonly registry: ProviderRegistryService) {}

  // ── Catalog (client-facing) ────────────────────────────────────────────────

  /** The catalog with connector status resolved against the live registry. */
  catalogForClient(): BrokerCatalogResponse {
    return {
      catalogVersion: BROKER_CATALOG_VERSION,
      brokers: BROKER_CATALOG.map((entry) => ({
        brokerId: entry.brokerId,
        displayName: entry.displayName,
        platforms: [...entry.platforms],
        connectorStatus: this.connectorStatusFor(entry),
        providerId: entry.connectorProviderId,
        aliases: [...entry.aliases],
        notes: entry.notes,
      })),
    };
  }

  /** CONNECTOR_AVAILABLE only when the registry CURRENTLY holds the adapter. */
  private connectorStatusFor(entry: BrokerCatalogEntryDef): BrokerIdentification["connectorStatus"] {
    if (entry.connectorProviderId && this.registry.get(entry.connectorProviderId)) {
      return "CONNECTOR_AVAILABLE";
    }
    return "CONNECTOR_NOT_IMPLEMENTED";
  }

  // ── Identify (endpoint) ────────────────────────────────────────────────────

  /**
   * Rule-based identification from hints. Priority: documented catalog
   * patterns (endpoint hint first, then external id shape) → known registry
   * platform → honest UNKNOWN. Makes no outbound call of any kind.
   */
  identify(hints: BrokerIdentifyInput): BrokerIdentification {
    const signals: string[] = [];
    const descriptor = hints.providerId
      ? this.registry.get(hints.providerId)?.descriptor ?? null
      : null;

    // 1) ENDPOINT patterns (host/server hint — matched, never dialed).
    if (hints.endpoint) {
      const endpointMatch = this.matchPatterns(hints.endpoint, "ENDPOINT");
      if (endpointMatch) {
        signals.push(endpointMatch.pattern.signal);
        return this.buildResult(endpointMatch.entry, "PATTERN_MATCH", signals, descriptor);
      }
      signals.push(`endpoint hint "${hints.endpoint}" matched no catalog pattern`);
    }

    // 2) EXTERNAL_ID patterns (documented account-id shapes).
    if (hints.externalAccountId) {
      const idMatch = this.matchPatterns(hints.externalAccountId, "EXTERNAL_ID");
      if (idMatch) {
        signals.push(idMatch.pattern.signal);
        return this.buildResult(idMatch.entry, "PATTERN_MATCH", signals, descriptor);
      }
      signals.push("external account id matched no documented catalog pattern");
    }

    // 3) Platform knowledge from the registry descriptor.
    if (descriptor) {
      signals.push(`provider "${descriptor.providerId}" is registered (platform ${descriptor.platform})`);
      return this.buildResultForPlatform(descriptor, signals);
    }

    return this.unknownResult(signals);
  }

  // ── Connect-time identification ────────────────────────────────────────────

  /**
   * The connect-time capture (§8 "identify the broker during connection"):
   * provider-reported identity wins; then catalog patterns; then the
   * descriptor platform. The result is persisted verbatim (JSON column) —
   * a snapshot of what the evidence supported at connect time.
   */
  identifyAtConnect(input: {
    providerId: string;
    externalAccountId: string;
    providerReported: { brokerName: string | null; accountClass: "REAL" | "DEMO" | null } | null | undefined;
  }): BrokerIdentification {
    const descriptor = this.registry.get(input.providerId)?.descriptor ?? null;
    const signals: string[] = [];

    if (input.providerReported?.brokerName) {
      signals.push(`provider-reported broker identity: ${input.providerReported.brokerName}`);
      if (input.providerReported.accountClass) {
        signals.push(`provider-reported account class: ${input.providerReported.accountClass}`);
      }
      // Match the catalog entry for connector status/platform context — the
      // DISPLAY NAME stays the provider-reported entity (most specific).
      const entry =
        this.entryByProviderId(input.providerId) ??
        (descriptor ? this.entryByPlatform(descriptor.platform) : null) ??
        null;
      if (entry && entry.brokerId !== input.providerId.replace(/-ws$/, "")) {
        signals.push(`catalog entry: ${entry.displayName}`);
      }
      return {
        brokerId: entry?.brokerId ?? "unknown",
        displayName: input.providerReported.brokerName,
        platform: entry?.platforms[0] ?? descriptor?.platform ?? "OTHER",
        confidence: "PROVIDER_REPORTED",
        connectorStatus: entry
          ? this.connectorStatusFor(entry)
          : "CONNECTOR_NOT_IMPLEMENTED",
        providerId: input.providerId,
        signals,
        identifiedAt: isoDateTime(new Date()),
      };
    }

    // No provider-reported identity → fall through to the rules engine.
    return this.identify({
      providerId: input.providerId,
      externalAccountId: input.externalAccountId,
    });
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private matchPatterns(
    value: string,
    kind: "EXTERNAL_ID" | "ENDPOINT",
  ): { entry: BrokerCatalogEntryDef; pattern: BrokerCatalogEntryDef["patterns"][number] } | null {
    for (const entry of BROKER_CATALOG) {
      for (const pattern of entry.patterns) {
        if (pattern.kind !== kind) continue;
        if (new RegExp(pattern.regexSource).test(value)) {
          return { entry, pattern };
        }
      }
    }
    return null;
  }

  private entryByProviderId(providerId: string): BrokerCatalogEntryDef | null {
    return (
      BROKER_CATALOG.find((entry) => entry.connectorProviderId === providerId) ?? null
    );
  }

  private entryByPlatform(platform: TradingProviderDescriptor["platform"]): BrokerCatalogEntryDef | null {
    return BROKER_CATALOG.find((entry) => entry.platforms.includes(platform)) ?? null;
  }

  private buildResult(
    entry: BrokerCatalogEntryDef,
    confidence: BrokerIdentification["confidence"],
    signals: string[],
    descriptor: TradingProviderDescriptor | null,
  ): BrokerIdentification {
    return {
      brokerId: entry.brokerId,
      displayName: entry.displayName,
      platform: entry.platforms[0] ?? descriptor?.platform ?? "OTHER",
      confidence,
      connectorStatus: this.connectorStatusFor(entry),
      providerId: entry.connectorProviderId,
      signals,
      identifiedAt: isoDateTime(new Date()),
    };
  }

  private buildResultForPlatform(
    descriptor: TradingProviderDescriptor,
    signals: string[],
  ): BrokerIdentification {
    const entry = this.entryByPlatform(descriptor.platform);
    if (entry) {
      signals.push(`catalog entry for platform ${descriptor.platform}: ${entry.displayName}`);
      return this.buildResult(entry, "PLATFORM_KNOWN", signals, descriptor);
    }
    return {
      brokerId: "unknown",
      displayName: "Unknown broker",
      platform: descriptor.platform,
      confidence: "PLATFORM_KNOWN",
      connectorStatus: "CONNECTOR_AVAILABLE",
      providerId: descriptor.providerId,
      signals,
      identifiedAt: isoDateTime(new Date()),
    };
  }

  private unknownResult(signals: string[]): BrokerIdentification {
    return {
      brokerId: "unknown",
      displayName: "Unknown broker",
      platform: "OTHER",
      confidence: "UNKNOWN",
      connectorStatus: "CONNECTOR_NOT_IMPLEMENTED",
      providerId: null,
      signals,
      identifiedAt: isoDateTime(new Date()),
    };
  }
}

/** Re-exported for convenience — the persisted-JSON boundary schema. */
export { brokerIdentificationSchema };
