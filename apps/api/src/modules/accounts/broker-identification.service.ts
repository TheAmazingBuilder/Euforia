/**
 * BrokerIdentificationService (Phase 07 - universal broker layer).
 *
 * Answers "WHICH broker is this?" for any connection attempt - the owner's
 * requirement that Euforia welcome ANY broker, not only the implemented
 * connectors. Three entry points:
 *
 *  1. catalogForClient() - the versioned catalog with HONEST connector
 *     status per broker (resolved against the provider registry at call
 *     time), powering the Accounts UI broker picker.
 *  2. identify(hints) - rule-based identification for the identify endpoint.
 *     NO outbound call, NO secrets accepted, client-supplied endpoint strings
 *     are matched against catalog patterns and never dialed (SSRF-safe by
 *     construction).
 *  3. identifyAtConnect(...) - the connect-time capture: the adapter's
 *     PROVIDER-REPORTED broker identity (strongest evidence, e.g. Deriv's
 *     landing company) takes priority; catalog patterns and the registry
 *     descriptor fall through in that order. The result is persisted on the
 *     TradingAccount (brokerIdentity JSON) with its confidence and signals.
 *
 * Honesty ladder (confidence, strongest first):
 *   PROVIDER_REPORTED → PATTERN_MATCH → PLATFORM_KNOWN → UNKNOWN.
 * UNKNOWN is a first-class result - never fabricated into a guess.
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

    // 1) ENDPOINT patterns (host/server hint - matched, never dialed).
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
   * descriptor platform. The result is persisted verbatim (JSON column) -
   * a snapshot of what the evidence supported at connect time.
   */
  identifyAtConnect(input: {
    providerId: string;
    externalAccountId: string;
    endpoint?: string | null;
    providerReported: { brokerName: string | null; accountClass: "REAL" | "DEMO" | null } | null | undefined;
  }): BrokerIdentification {
    const descriptor = this.registry.get(input.providerId)?.descriptor ?? null;
    const signals: string[] = [];
    const brokerName = input.providerReported?.brokerName?.trim() ?? "";

    // No provider-reported label: use the server hint and account id. The
    // endpoint is matched against static patterns only and is never dialed.
    if (!brokerName) {
      return this.identify({
        providerId: input.providerId,
        externalAccountId: input.externalAccountId,
        ...(input.endpoint ? { endpoint: input.endpoint } : {}),
      });
    }

    signals.push(`provider-reported broker identity: ${brokerName}`);
    if (input.providerReported?.accountClass) {
      signals.push(`provider-reported account class: ${input.providerReported.accountClass}`);
    }

    // Resolve a broker name before consulting providerId. Several brands can
    // share mt5-bridge; using the first providerId match would label Axi and
    // PU Prime accounts as IC Markets. Name/endpoint evidence is more specific.
    const nameMatch = this.matchBrokerName(brokerName);
    const endpointMatch = input.endpoint
      ? this.matchPatterns(input.endpoint, "ENDPOINT")
      : null;
    const entry =
      nameMatch ??
      endpointMatch?.entry ??
      this.entryByProviderId(input.providerId);

    if (nameMatch) {
      signals.push(`catalog entry matched provider-reported broker name: ${nameMatch.displayName}`);
    } else if (endpointMatch) {
      signals.push(endpointMatch.pattern.signal);
    } else if (entry) {
      signals.push(`catalog entry: ${entry.displayName}`);
    } else {
      signals.push("provider-reported name did not match a specific broker catalog entry");
    }

    return {
      brokerId: entry?.brokerId ?? "unknown",
      // Preserve the exact broker label reported by MT5; never replace a
      // legal entity name with a guessed display label.
      displayName: brokerName,
      platform: entry?.connectorProviderId === "mt5-bridge"
        ? "MT5"
        : entry?.platforms[0] ?? descriptor?.platform ?? "OTHER",
      confidence: "PROVIDER_REPORTED",
      connectorStatus: entry
        ? this.connectorStatusFor(entry)
        : descriptor
          ? "CONNECTOR_AVAILABLE"
          : "CONNECTOR_NOT_IMPLEMENTED",
      providerId: entry?.connectorProviderId ?? (descriptor ? input.providerId : null),
      signals,
      identifiedAt: isoDateTime(new Date()),
    };
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
    const matches = BROKER_CATALOG.filter((entry) => entry.connectorProviderId === providerId);
    // A connector can serve multiple broker brands (e.g. mt5-bridge), so it
    // only identifies a brand when exactly one catalog entry owns that id.
    return matches.length === 1 ? matches[0] ?? null : null;
  }

  /** Match a provider-reported company label to a known broker, conservatively. */
  private matchBrokerName(value: string): BrokerCatalogEntryDef | null {
    const normalize = (input: string) => input.toLowerCase().replace(/[^a-z0-9]/g, "");
    const candidate = normalize(value);
    if (!candidate) return null;

    const matches = BROKER_CATALOG.flatMap((entry) =>
      [entry.displayName, ...entry.aliases].map((alias) => ({
        entry,
        normalizedAlias: normalize(alias),
      })),
    )
      .filter(({ normalizedAlias }) =>
        normalizedAlias.length > 0 &&
        (candidate === normalizedAlias ||
          (normalizedAlias.length >= 5 && candidate.includes(normalizedAlias))),
      )
      .sort((a, b) => b.normalizedAlias.length - a.normalizedAlias.length);

    return matches[0]?.entry ?? null;
  }

  private entryByPlatform(platform: TradingProviderDescriptor["platform"]): BrokerCatalogEntryDef | null {
    // If only the generic terminal is known, do not guess which MT5 broker
    // sits behind it by returning the first broker in catalog order.
    return (
      BROKER_CATALOG.find((entry) => entry.brokerId === "metatrader-platform" && entry.platforms.includes(platform)) ??
      BROKER_CATALOG.find((entry) => entry.platforms.includes(platform)) ??
      null
    );
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
      platform: entry.connectorProviderId === "mt5-bridge" ? "MT5" : entry.platforms[0] ?? descriptor?.platform ?? "OTHER",
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

/** Re-exported for convenience - the persisted-JSON boundary schema. */
export { brokerIdentificationSchema };
