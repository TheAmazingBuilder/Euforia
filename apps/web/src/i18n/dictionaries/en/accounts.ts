import type { Dictionary } from "@/i18n/dictionaries/en";

/**
 * EN dictionary — ACCOUNTS namespace (Phase 02). The Accounts & Trading
 * Connectivity module. Values are STATIC strings — components compose
 * dynamic parts themselves (dict.* pattern, no {var} templates).
 *
 * Voice contract: the module describes what the platform CAN do today and
 * never implies a live broker integration that does not exist. The only
 * connectable provider in this phase is the mock adapter — every surface
 * labels it as simulated (isMock), and deferred providers say so plainly.
 * No copy offers execution actions: Euforia is read-only by construction.
 */

export type AccountsDict = Dictionary["accounts"];

export const accountsDict = {
  page: {
    title: "Accounts",
    subtitle:
      "Connect the trading accounts you trade elsewhere and read them here - balances, positions and history, synced from the provider. Euforia never places, modify or closes orders on your behalf.",
    add: "Connect account",
    count: "accounts connected",
  },

  states: {
    loading: "Loading your connected accounts…",
    emptyTitle: "No trading account connected yet",
    emptyBody:
      "Accounts connect read-only: Euforia reads balances, positions and history from your provider and never trades. Connect your first account to bring it into the workspace.",
    emptyProvidersNote:
      "Live broker integrations are rolling out phase by phase. What you can connect today is listed below - anything marked planned is not connectable yet.",
    errorTitle: "Accounts could not be loaded",
    errorBody: "The platform could not reach the accounts service. Your data is untouched - retry when ready.",
    staleCacheNote: "Showing the last successfully loaded data - the refresh failed.",
  },

  summary: {
    accounts: "Accounts",
    connected: "Connected",
    attention: "Needs attention",
    openPositions: "Open positions",
    mixedCurrenciesHint:
      "Accounts use different currencies - totals are not aggregated. Each account reads in its own currency.",
  },

  card: {
    openDetail: "Open account details",
    balance: "Balance",
    equity: "Equity",
    unavailable: "Not reported",
    lastSync: "Last sync",
    neverSynced: "Never synced",
    positions: "positions",
    simulatedBadge: "Simulated provider",
    credentialsHint: "Credential",
    detail: "Details",
    testConnection: "Test connection",
    sync: "Sync now",
    syncing: "Syncing…",
  },

  detail: {
    title: "Account details",
    overviewTab: "Overview",
    positionsTab: "Positions",
    ordersTab: "Orders",
    dealsTab: "Deals",
    connectionSection: "Connection",
    detectedBroker: "Detected broker",
    snapshotSection: "Latest snapshot",
    activitySection: "Provider activity",
    syncSection: "Synchronization",
    balance: "Balance",
    equity: "Equity",
    provider: "Provider",
    platform: "Platform",
    environment: "Environment",
    externalId: "External account",
    currency: "Currency",
    startingBalance: "Starting balance",
    connectedSince: "Connected since",
    lastSyncAt: "Last successful sync",
    method: "Method",
    permissions: "Granted permissions",
    connectionStatus: "Connection status",
    syncStatus: "Data freshness",
    lastRun: "Last sync run",
    runDuration: "Duration",
    runCounts: "Records upserted",
    runError: "Reported error",
    runPartialNote: "Some segments failed - the persisted segments stay; sync again for a full run.",
    // Phase 05 — synchronization history + per-resource freshness
    historySection: "Sync history",
    historyEmpty: "No synchronization has run yet.",
    historyTriggerManual: "Manual",
    historyTriggerScheduled: "Scheduled",
    historyTriggerInitial: "Initial",
    freshnessAsOf: "Updated",
    freshnessFresh: "Fresh",
    freshnessStale: "Stale",
    freshnessNever: "Never synced",
    rename: "Rename",
    disconnect: "Disconnect",
    reconnect: "Reconnect",
    syncNow: "Sync now",
    syncPartial: "Partially synced",
    testConnection: "Test connection",
    renameTitle: "Rename account",
    renameLabel: "Display name",
    renameHint:
      "The label is yours - the provider, environment and external account id are anchored to the connection and never editable here.",
    disconnectTitle: "Disconnect this account?",
    disconnectBody:
      "The stored credential is destroyed and the connection closes. Journal history stays - every imported record remains in your trades. You can reconnect later with fresh credentials.",
    disconnectConfirmLabel: "Disconnect account",
    positionsEmpty: "No open positions reported by the provider.",
    ordersEmpty: "No pending orders reported by the provider.",
    dealsEmpty: "No fills reported yet.",
    positionsNeverSynced:
      "Positions appear after the first successful synchronization.",
    simulatedNote:
      "This account runs on the Euforia mock provider - every value on this page is simulated data for development.",
    reconnectTitle: "Reconnect with fresh credentials",
    reconnectLabel: "API key / secret",
    reconnectHint:
      "The stored credential was rejected or the connection closed. Enter the current credential to re-authenticate - it is encrypted server-side and never displayed again.",
    unsupportedNote: "This provider does not report this activity.",
  },

  connect: {
    title: "Connect a trading account",
    step: "Step",
    of: "of",
    providerStep: "Provider",
    environmentStep: "Environment",
    identityStep: "Account",
    back: "Back",
    next: "Continue",
    submit: "Connect read-only",
    connecting: "Connecting…",
    providerTitle: "Choose a provider",
    providerBody:
      "Only providers with a working connection path are selectable. Every known broker stays visible, honestly labeled.",
    providerAvailable: "Connectable",
    providerPlanned: "Planned - not connectable yet",
    providerRecognized: "Recognized - connector not yet available",
    providerRecognizedSection: "Recognized brokers (no connector yet)",
    providerMockNote:
      "Development provider - simulates a read-only MT5-style broker. Every value it produces is synthetic.",
    detectedBroker: "Detected broker",
    detectedConfidence: {
      PROVIDER_REPORTED: "confirmed by the provider",
      PATTERN_MATCH: "matched a documented account format",
      PLATFORM_KNOWN: "provider platform",
      UNKNOWN: "no match yet - the broker is confirmed when the connection is validated",
    },
    environmentTitle: "Account environment",
    environmentBody: "The provider serves only the environments listed here - pick the one this account trades on.",
    environmentDemo: "Practice account - simulated funds, nothing real at risk.",
    environmentLive: "Real account - trades execute with your own funds.",
    environmentPropFirm: "Funded evaluation - trade the firm's capital under its risk rules.",
    identityTitle: "Identify the account",
    externalIdLabel: "Account number at the provider",
    externalIdHint: "The login or account id your provider shows - e.g. an MT5 login number.",
    displayNameLabel: "Display name (optional)",
    displayNameHint: "Defaults to the provider name and environment.",
    secretLabel: "Read-only credential",
    secretHint:
      "Sent once over an encrypted channel, stored server-side with AES-256-GCM, and never displayed or returned again - only a masked hint stays visible.",
    // Phase 08 — PLATFORM_BRIDGE providers (MT5 terminal bridge): no client
    // secret exists. Euforia generates the bridge secret server-side; the
    // broker password never leaves the user's terminal.
    bridge: {
      explainer:
        "Euforia generates the bridge secret - your broker password never leaves your terminal.",
      identityNote:
        "No API key or password to type here. After connecting, a pairing sheet shows how to attach the MT5 Expert Advisor.",
      successTitle: "Terminal pairing",
      successBody:
        "Keep this sheet open, attach the Expert Advisor in your MT5 terminal - data starts flowing with the first push.",
      done: "Done",
    },
    successTitle: "Account connected",
    successBody:
      "The initial synchronization ran - balances and history are readable in the account details. Data refreshes when you sync; nothing is live-streamed.",
    errors: {
      unsupportedProvider: "This provider is not supported yet.",
      unsupportedAccount: "The provider does not serve this account environment.",
      duplicate: "This account is already connected.",
      invalidCredentials: "The provider rejected these credentials.",
      rateLimited: "Too many attempts - wait a moment and retry.",
      generic: "The connection could not be established.",
    },
  },

  /**
   * Phase 08 — MT5 terminal bridge. One namespace serves BOTH pairing
   * surfaces: the connect-time sheet (connect-account-dialog) and the
   * account-detail pairing dialog. The secret is re-readable here BY
   * DESIGN (unlike API-key credentials) — rotating it invalidates the
   * previous terminal configuration.
   */
  bridge: {
    sectionTitle: "MT5 bridge",
    statusConnecting: "Waiting for the first push - attach the EA in your MT5 terminal.",
    statusConnected: "Terminal connected - data is current as of the last push.",
    pairingButton: "Pairing sheet",
    rotateButton: "Rotate secret",
    rotatePending: "Rotating…",
    rotateWarning:
      "The previous terminal configuration was invalidated - re-enter the new key and secret in the EA.",
    rotateToast: "Secret rotated - the old terminal configuration no longer works.",
    downloadButton: "Download EA",
    panelTitle: "MT5 terminal pairing",
    panelIntro:
      "One-time configuration for the EuforiaBridge Expert Advisor. Keep this sheet until the terminal is attached.",
    ingestUrlLabel: "Ingest URL",
    bridgeKeyLabel: "Bridge key",
    secretLabel: "Bridge secret",
    secretReveal: "Reveal",
    secretHide: "Hide",
    secretOnceWarning:
      "Shown only here - you can view it again from this account's MT5 bridge card.",
    copy: "Copy",
    copied: "Copied",
    eaLabel: "Expert Advisor",
    eaVersion: "version",
    stepsTitle: "Setup - 4 steps",
    steps: {
      one: "Download the EA and drop it into your terminal's MQL5/Experts folder (File → Open Data Folder).",
      two: "In MT5, allow WebRequest for the ingest URL above (Tools → Options → Expert Advisors).",
      three: "Attach EuforiaBridge to any chart of this account and paste the bridge key and secret into the EA inputs.",
      four: "Keep the terminal running - the EA pushes a signed snapshot every 30 seconds.",
    },
  },

  test: {
    title: "Connection health",
    subtitle:
      "Four named checks run against the stored credential - results are honest per check, never all-or-nothing.",
    run: "Run checks",
    running: "Running checks…",
    rerun: "Run again",
    allGood: "All checks passed.",
    someFailed: "Some checks failed - the failing check explains what to do.",
    checks: {
      authentication: "Authentication",
      connectivity: "Connectivity",
      providerResponse: "Provider response",
      permissions: "Permissions",
    },
  },

  status: {
    connected: "Connected",
    connecting: "Connecting",
    disconnected: "Disconnected",
    connectionError: "Connection error",
    syncing: "Syncing",
    fresh: "Fresh",
    delayed: "Delayed",
    stale: "Stale",
    syncError: "Sync error",
    neverSynced: "Never synced",
    freshnessNote:
      "Fresh means the last successful sync completed within the freshness window - polling providers are never real-time.",
  },

  errors: {
    load: "Accounts could not be loaded.",
    connect: "The connection could not be established.",
    rename: "The account could not be renamed.",
    disconnect: "The account could not be disconnected.",
    reconnect: "The reconnection failed.",
    sync: "The synchronization failed.",
    test: "The connection test failed.",
    pairing: "The pairing sheet could not be loaded.",
    rotate: "The secret could not be rotated.",
  },
} as const;
