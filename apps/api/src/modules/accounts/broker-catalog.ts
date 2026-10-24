/**
 * Broker catalog (Phase 07 - the universal "any broker" layer).
 *
 * A static, versioned identity registry of KNOWN brokers/platforms. Purpose:
 * answer "WHICH broker is this?" during a connection, for ANY broker -
 * whether or not Euforia ships a connector for it today.
 *
 * STRICT SCOPE (no fabrication): entries carry IDENTITY metadata only -
 * display names, platform families, and documented identification signals
 * (account-id shapes, endpoint hosts, server-name prefixes). NO capability
 * claims, NO API endpoints, NO authentication facts for brokers without a
 * connector: an entry never suggests Euforia can connect a broker it cannot.
 * Connector availability is resolved at runtime against the provider
 * registry (BrokerIdentificationService), never hardcoded here.
 *
 * Identification signals are REGEX SOURCES (compiled lazily, unit-tested):
 *  - EXTERNAL_ID: tested against the user-supplied external account id.
 *  - ENDPOINT: tested against an endpoint/server hint (matched only - the
 *    identify flow NEVER dials a client-supplied string, SSRF-safe).
 * A pattern is added ONLY for publicly documented identifier shapes.
 */
export type BrokerCatalogPatternKind = "EXTERNAL_ID" | "ENDPOINT";

export interface BrokerCatalogPattern {
  kind: BrokerCatalogPatternKind;
  /** Regex source - tested case-sensitively against the raw hint string. */
  regexSource: string;
  /** Human-readable evidence string recorded in the identification result. */
  signal: string;
}

export interface BrokerCatalogEntryDef {
  brokerId: string;
  displayName: string;
  /** Platform families this broker/platform operates on (broker vocabulary). */
  platforms: ReadonlyArray<
    "MANUAL" | "MT4" | "MT5" | "DERIV" | "BINANCE" | "CTRADER" | "OANDA" | "OTHER"
  >;
  /** Registry providerId when a real connector exists (availability resolved at runtime). */
  connectorProviderId: string | null;
  aliases: ReadonlyArray<string>;
  notes: string;
  patterns: ReadonlyArray<BrokerCatalogPattern>;
}

/** Catalog snapshot version - recorded in every connect-time identification. */
export const BROKER_CATALOG_VERSION = "2026-10.1";

/**
 * OANDA v20 account ids: "101-004-1234567-001" / "101-004-1234567"
 * (developer.oanda.com - three hyphen-separated segments).
 * Deriv loginids: CR… (real), VRTC… (virtual/demo), MRT/MVT… (Deriv MT5
 * real/virtual) - api.deriv.com account conventions.
 */
export const BROKER_CATALOG: ReadonlyArray<BrokerCatalogEntryDef> = [
  {
    brokerId: "deriv",
    displayName: "Deriv",
    platforms: ["DERIV"],
    connectorProviderId: "deriv-ws",
    aliases: ["Binary.com", "binary.com"],
    notes: "Connected through the official Deriv WebSocket API with a Read-scope API token.",
    patterns: [
      {
        kind: "EXTERNAL_ID",
        regexSource: "^(CR|MRT|MVT|VRTC)\\d{4,}$",
        signal: "loginid matches the Deriv account format (CR/VRTC/MRT/MVT prefix)",
      },
      {
        kind: "ENDPOINT",
        regexSource: "^(ws|api)\\.(derivws|binaryws)\\.com$|^app\\.deriv\\.com$",
        signal: "endpoint host is a documented Deriv API gateway",
      },
    ],
  },
  {
    brokerId: "oanda",
    displayName: "OANDA",
    platforms: ["OANDA"],
    connectorProviderId: "oanda-v20",
    aliases: ["OANDA Corporation", "fxTrade"],
    notes: "Connected through the official OANDA v20 REST API with a personal access token.",
    patterns: [
      {
        kind: "EXTERNAL_ID",
        regexSource: "^\\d{1,4}-\\d{1,3}-\\d{6,8}(-\\d{2,3})?$",
        signal: "account id matches the OANDA v20 format (hyphen-separated segments)",
      },
      {
        kind: "ENDPOINT",
        regexSource: "^api-fx(practice|trade)\\.oanda\\.com$",
        signal: "endpoint host is a documented OANDA v20 REST host",
      },
    ],
  },
  {
    brokerId: "icmarkets",
    displayName: "IC Markets",
    platforms: ["MT4", "MT5", "CTRADER"],
    // Phase 08 - reachable through the MT5 terminal bridge (the EA runs in
    // the user's own terminal; broker credentials never leave it). MT4 and
    // cTrader paths stay gated on their own decisions.
    connectorProviderId: "mt5-bridge",
    aliases: ["IC Markets Global", "ICMarkets", "Raw Trading Ltd"],
    notes: "Connects through the MT5 Terminal Bridge (EuforiaBridge EA in your own terminal). MT4/cTrader paths are separate decisions.",
    patterns: [
      {
        kind: "ENDPOINT",
        regexSource: "^ICMarkets",
        signal: "server name matches the documented ICMarkets server naming (e.g. ICMarketsSC-MT5)",
      },
    ],
  },
  {
    brokerId: "pepperstone",
    displayName: "Pepperstone",
    platforms: ["MT4", "MT5", "CTRADER"],
    connectorProviderId: null,
    aliases: ["Pepperstone Group"],
    notes: "Access paths are MT4/MT5/cTrader platform integrations - gated on the MT5 decision (U1) and the cTrader decision.",
    patterns: [
      {
        kind: "ENDPOINT",
        regexSource: "^Pepperstone-",
        signal: "server name matches the documented Pepperstone server naming",
      },
    ],
  },
  {
    brokerId: "exness",
    displayName: "Exness",
    platforms: ["MT4", "MT5"],
    connectorProviderId: null,
    aliases: ["Exness Group"],
    notes: "Access path is the MT4/MT5 platform integration - gated on the MT5 decision (U1).",
    patterns: [
      {
        kind: "ENDPOINT",
        regexSource: "^Exness",
        signal: "server name matches the documented Exness server naming",
      },
    ],
  },
  {
    brokerId: "xm",
    displayName: "XM",
    platforms: ["MT4", "MT5"],
    connectorProviderId: null,
    aliases: ["XM Global", "Trading Point"],
    notes: "Access path is the MT4/MT5 platform integration - gated on the MT5 decision (U1).",
    patterns: [
      {
        kind: "ENDPOINT",
        regexSource: "^XM(Global|UK|Standard|Ultra|Zero|MT4|MT5)",
        signal: "server name matches the documented XM server naming",
      },
    ],
  },
  {
    brokerId: "fxtm",
    displayName: "FXTM (ForexTime)",
    platforms: ["MT4", "MT5"],
    connectorProviderId: null,
    aliases: ["ForexTime"],
    notes: "Access path is the MT4/MT5 platform integration - gated on the MT5 decision (U1).",
    patterns: [
      {
        kind: "ENDPOINT",
        regexSource: "^(ForexTime|FXTM)",
        signal: "server name matches the documented ForexTime/FXTM server naming",
      },
    ],
  },
  {
    brokerId: "fpmarkets",
    displayName: "FP Markets",
    platforms: ["MT4", "MT5", "CTRADER"],
    connectorProviderId: null,
    aliases: ["First Prudential Markets"],
    notes: "Access paths are MT4/MT5/cTrader platform integrations.",
    patterns: [],
  },
  {
    brokerId: "avatrade",
    displayName: "AvaTrade",
    platforms: ["MT4", "MT5"],
    connectorProviderId: null,
    aliases: ["Ava Trade"],
    notes: "Access path is the MT4/MT5 platform integration - gated on the MT5 decision (U1).",
    patterns: [],
  },
  {
    brokerId: "vantage",
    displayName: "Vantage",
    platforms: ["MT4", "MT5"],
    connectorProviderId: null,
    aliases: ["Vantage FX", "Vantage International"],
    notes: "Access path is the MT4/MT5 platform integration - gated on the MT5 decision (U1).",
    patterns: [],
  },
  {
    brokerId: "eightcap",
    displayName: "Eightcap",
    platforms: ["MT4", "MT5"],
    connectorProviderId: null,
    aliases: ["Eightcap Global"],
    notes: "Access path is the MT4/MT5 platform integration - gated on the MT5 decision (U1).",
    patterns: [],
  },
  {
    brokerId: "interactivebrokers",
    displayName: "Interactive Brokers",
    platforms: ["OTHER"],
    connectorProviderId: null,
    aliases: ["IBKR", "Interactive Brokers LLC"],
    notes: "Official Client Portal Web API exists but requires individual account configuration and approval steps - not part of the current connector roadmap.",
    patterns: [
      {
        kind: "ENDPOINT",
        regexSource: "^api\\.interactivebrokers\\.com$",
        signal: "endpoint host is the documented IBKR Client Portal Web API host",
      },
    ],
  },
  {
    brokerId: "binance",
    displayName: "Binance",
    platforms: ["BINANCE"],
    connectorProviderId: null,
    aliases: ["Binance.com"],
    notes: "Public exchange REST API exists; an exchange connector is a separate product decision outside the Accounts roadmap scope.",
    patterns: [
      {
        kind: "ENDPOINT",
        regexSource: "^api\\.binance\\.com$",
        signal: "endpoint host is the documented Binance public API host",
      },
    ],
  },
  {
    brokerId: "metatrader-platform",
    displayName: "MetaTrader (MT4/MT5)",
    platforms: ["MT4", "MT5"],
    connectorProviderId: null,
    aliases: ["MetaQuotes", "MT4", "MT5"],
    notes: "The MetaQuotes terminal/gateway integration is gated on decision U1 (self-hosted bridge vs cloud gateway vs documented defer) - broker entries above list per-broker access.",
    patterns: [],
  },
  {
    brokerId: "ctrader-platform",
    displayName: "cTrader",
    platforms: ["CTRADER"],
    connectorProviderId: null,
    aliases: ["Spotware", "cTrader Open API"],
    notes: "cTrader Open API (OAuth 2.0 + protobuf over WebSocket) - implementation stopped pending explicit owner approval.",
    patterns: [],
  },
  {
    brokerId: "tradingview",
    displayName: "TradingView",
    platforms: ["OTHER"],
    connectorProviderId: null,
    aliases: ["TradingView Inc."],
    notes: "No account-data interface exists - chart embedding is not brokerage-account access (documented verdict, doc D).",
    patterns: [],
  },
  {
    brokerId: "plus500",
    displayName: "Plus500",
    platforms: ["OTHER"],
    connectorProviderId: null,
    aliases: ["Plus500 Ltd"],
    notes: "Proprietary platform without a public retail account-data API.",
    patterns: [],
  },
  {
    brokerId: "etoro",
    displayName: "eToro",
    platforms: ["OTHER"],
    connectorProviderId: null,
    aliases: ["eToro Group"],
    notes: "Proprietary platform without a public retail account-data API.",
    patterns: [],
  },
];
