/**
 * Accounts application service (Phase 3 §32–§35).
 *
 * Meaningful application boundaries: this service owns the connection
 * lifecycle use cases (connect / test / reconnect / disconnect) and the
 * read side (list / details / snapshot / positions / orders / deals /
 * broker session). Synchronization orchestration lives in TradingSyncService.
 *
 * Invariants enforced here (§35):
 *  - every lookup is ownership-scoped (userId from the auth principal, never
 *    from the client) - foreign ids are 404, never leaky;
 *  - the provider must be registered (422 UNSUPPORTED_PROVIDER otherwise);
 *  - the environment is explicit (validated by the shared input schema);
 *  - permissions come ONLY from the provider descriptor - the client can
 *    never grant them;
 *  - credentials are validated with the provider BEFORE persistence,
 *    encrypted at rest, never returned;
 *  - a disconnected account cannot be tested or synchronized (422
 *    NOT_CONNECTED) and cannot reconnect while CONNECTED (409).
 */
import { randomBytes } from "node:crypto";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { z, type ZodTypeAny } from "zod";
import type { RootLogger } from "../../infrastructure/logging/logger.factory";
import { ROOT_LOGGER } from "../../infrastructure/logging/logger.factory";
import { APP_CONFIG } from "../../config/app-config";
import type { AppConfig } from "../../config/app-config";
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  RateLimitError,
} from "../../shared/errors/app-error";
import {
  TRADING_ERROR_CODES,
  type BridgePairing,
  type BrokerCatalogResponse,
  type BrokerIdentifyInput,
  type BrokerIdentifyResponse,
  type TradingAccountConnectInput,
  type TradingAccountUpdateInput,
  type TradingProviderDescriptor,
  type TradingReconnectInput,
  type TradingSyncRunsResponse,
  type BrokerAccountSnapshot,
  type BrokerPosition,
  type BrokerOrder,
} from "../../shared/contracts";
import type { ProviderCredentials, ProviderRequestContext } from "./provider.types";
import { ProviderError, withProviderTimeout } from "./provider.types";
import { normalizeProviderError } from "./trading-sync.service";
import { normalizedAccountInfoSchema, normalizedSnapshotSchema } from "./normalization";
import { AccountsRepository } from "./accounts.repository";
import type { TradingAccountRow, TradingConnectionRow } from "./accounts.repository";
import { CredentialsEncryptionService } from "./credentials-encryption.service";
import { ProviderRegistryService } from "./provider-registry.service";
import { BrokerIdentificationService } from "./broker-identification.service";
import { TradingSyncService } from "./trading-sync.service";
import { SecurityEventService } from "../security/security-event.service";
import type { UserRow } from "../identity/identity.repository";
import { toAccountDetails, toJournalAccount, toSnapshotView, toSynchronizationView, toSyncRunView, isoDateTime } from "./mappers";

@Injectable()
export class TradingAccountService {
  constructor(
    private readonly repository: AccountsRepository,
    private readonly registry: ProviderRegistryService,
    private readonly credentials: CredentialsEncryptionService,
    private readonly sync: TradingSyncService,
    private readonly events: SecurityEventService,
    private readonly brokerIdentification: BrokerIdentificationService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Optional() @Inject(ROOT_LOGGER) private readonly logger?: RootLogger,
  ) {}

  // ── Reads ──────────────────────────────────────────────────────────────────

  /** Provider registry listing (metadata only - §44). */
  listProviders(): { providers: TradingProviderDescriptor[] } {
    return { providers: this.registry.list() };
  }

  /**
   * Phase 07 - the universal broker catalog: every known broker/platform
   * with HONEST connector status (resolved against the registry). Identity
   * metadata only - no capability claims for brokers without a connector.
   */
  listBrokers(): BrokerCatalogResponse {
    return this.brokerIdentification.catalogForClient();
  }

  /**
   * Phase 07 - rule-based broker identification from hints. NO provider
   * call, NO secrets accepted: the answer is "which broker does this look
   * like", with evidence signals and an honest UNKNOWN when nothing matches.
   */
  identifyBroker(hints: BrokerIdentifyInput): BrokerIdentifyResponse {
    return { identification: this.brokerIdentification.identify(hints) };
  }

  /** Journal identity contract - exactly the shared accountSchema list. */
  async list(userId: string): Promise<{ accounts: ReturnType<typeof toJournalAccount>[] }> {
    const rows = await this.repository.listAccountsByUser(userId);
    return { accounts: rows.map(toJournalAccount) };
  }

  async getDetails(userId: string, accountId: string): Promise<{ account: ReturnType<typeof toAccountDetails> }> {
    const { account, descriptor, connection, snapshot, latestRun, resourceTimestamps } =
      await this.loadFull(userId, accountId);
    return {
      account: toAccountDetails({
        account,
        descriptor,
        connection,
        snapshot,
        latestRun,
        resourceTimestamps,
        nowMs: Date.now(),
      }),
    };
  }

  /** GET /accounts - full details for every owned account (details-view shape). */
  async listDetails(userId: string, nowMs: number): Promise<{ accounts: Array<ReturnType<typeof toAccountDetails>> }> {
    const rows = await this.repository.listAccountsByUser(userId);
    const accounts = await Promise.all(
      rows.map(async (row) => {
        const full = await this.loadFull(userId, row.id);
        return toAccountDetails({ ...full, nowMs });
      }),
    );
    return { accounts };
  }

  /**
   * PATCH /accounts/:accountId - rename the journal label (the one documented
   * journal-side edit; provider-anchored identity is never client-mutable).
   */
  async updateAccount(
    userId: string,
    accountId: string,
    input: TradingAccountUpdateInput,
  ): Promise<ReturnType<typeof toAccountDetails>> {
    const { account } = await this.loadOwned(userId, accountId);
    if (input.name !== undefined) {
      await this.repository.renameAccount(account.id, userId, input.name);
    }
    const full = await this.loadFull(userId, accountId);
    return toAccountDetails({ ...full, nowMs: Date.now() });
  }

  async getSnapshot(userId: string, accountId: string) {
    const { snapshot } = await this.loadFull(userId, accountId);
    return { snapshot: toSnapshotView(snapshot) };
  }

  /** Latest run + derived synchronization status (observable sync state, §50). */
  async getSyncStatus(userId: string, accountId: string) {
    const { account, connection } = await this.loadOwned(userId, accountId);
    const latestRun = await this.repository.latestSyncRun(account.id);
    return {
      accountId: account.id,
      synchronization: toSynchronizationView(
        connection?.lastSyncAt ?? null,
        latestRun,
        Date.now(),
      ),
    };
  }

  async getPositions(userId: string, accountId: string): Promise<{ positions: BrokerPosition[] }> {
    const { account } = await this.loadFull(userId, accountId);
    const rows = await this.repository.listPositions(account.id);
    return {
      positions: rows.map((row) => ({
        id: row.externalPositionId,
        symbol: row.symbol,
        direction: row.side as BrokerPosition["direction"],
        volume: row.volume.toFixed(),
        entryPrice: row.entryPrice.toFixed(),
        currentPrice: decimal(row.currentPrice),
        stopLoss: decimal(row.stopLoss),
        takeProfit: decimal(row.takeProfit),
        unrealizedPnl: decimal(row.profit),
        openedAt: isoDateTime(row.openedAt),
      })),
    };
  }

  async getOrders(userId: string, accountId: string): Promise<{ orders: BrokerOrder[] }> {
    const { account } = await this.loadFull(userId, accountId);
    const rows = await this.repository.listOrders(account.id);
    return {
      orders: rows.map((row) => ({
        id: row.externalOrderId,
        symbol: row.symbol,
        type: row.type,
        price: row.price.toFixed(),
        stopLoss: decimal(row.stopLoss),
        takeProfit: decimal(row.takeProfit),
        volume: row.volume.toFixed(),
        createdAt: isoDateTime(row.providerCreatedAt ?? row.syncedAt),
      })),
    };
  }

  async getDeals(userId: string, accountId: string) {
    const { account } = await this.loadFull(userId, accountId);
    const rows = await this.repository.listDeals(account.id);
    return {
      deals: rows.map((row) => ({
        id: row.id,
        externalDealId: row.externalDealId,
        symbol: row.symbol,
        side: row.side as "BUY" | "SELL",
        volume: row.volume.toFixed(),
        price: decimal(row.price),
        profit: decimal(row.profit),
        commission: decimal(row.commission),
        swap: decimal(row.swap),
        executedAt: isoDateTime(row.executedAt),
      })),
    };
  }

  // ── Connection lifecycle ───────────────────────────────────────────────────

  /**
   * Connect = validate credentials with the provider, then register account +
   * connection atomically, then run the initial synchronization (§17). The
   * HTTP request is not held hostage by slow providers: every adapter call is
   * timeout-guarded, and an initial-sync failure still returns the registered
   * account (with the failure visible in the details view).
   */
  async connect(input: {
    userId: string;
    user: UserRow;
    payload: TradingAccountConnectInput;
    requestId: string | null;
    limiter: { check(scope: string, key: string): { allowed: boolean; retryAfterSeconds: number }; hit(scope: string, key: string): void };
  }): Promise<ReturnType<typeof toAccountDetails>> {
    const check = input.limiter.check("connect", input.userId);
    if (!check.allowed) {
      throw new RateLimitError(
        "Too many connection attempts. Please wait before trying again.",
        TRADING_ERROR_CODES.RATE_LIMITED,
        check.retryAfterSeconds,
      );
    }
    input.limiter.hit("connect", input.userId);

    const adapter = this.registry.require(input.payload.providerId);

    if (
      input.payload.brokerId &&
      !adapter.descriptor.supportedConnectionMethods.includes("PLATFORM_BRIDGE")
    ) {
      throw new BusinessRuleError(
        "A broker selection is only accepted for a shared terminal bridge connection.",
        TRADING_ERROR_CODES.UNSUPPORTED_PROVIDER,
      );
    }

    // Phase 08 - PLATFORM_BRIDGE connections pair instead of validating
    // credentials: the terminal is external, the secret is SERVER-generated,
    // and the first accepted push IS the validation. Broker credentials
    // never reach Euforia (feasibility doc §credentials - MT5 paths).
    if (adapter.descriptor.supportedConnectionMethods.includes("PLATFORM_BRIDGE")) {
      return this.connectBridge(input, adapter);
    }

    if (!input.payload.credentials?.secret) {
      throw new BusinessRuleError(
        "A secret is required for this provider.",
        TRADING_ERROR_CODES.INVALID_CREDENTIALS,
      );
    }
    const credentials: ProviderCredentials = {
      method: "API_KEY",
      secret: input.payload.credentials.secret,
    };

    // Validate with the provider BEFORE persisting anything (§17 step order).
    let accountInfo;
    let snapshot;
    try {
      const timeoutMs = this.config.accounts.providerTimeoutMs;
      await withProviderTimeout(adapter.testConnection(credentials), timeoutMs);
      const context: ProviderRequestContext = {
        credentials,
        externalAccountId: input.payload.externalAccountId,
        environment: input.payload.environment,
      };
      accountInfo = await withProviderTimeout(adapter.fetchAccountInfo(context), timeoutMs);
      snapshot = await withProviderTimeout(adapter.fetchSnapshot(context), timeoutMs);
      // Normalization boundary - unknown currency shapes are provider failures.
      const safeInfo = assertValid(normalizedAccountInfoSchema, accountInfo);
      assertValid(normalizedSnapshotSchema, snapshot);
      if (!adapter.descriptor.supportedEnvironments.includes(input.payload.environment)) {
        throw new ProviderError(
          "UNSUPPORTED_ACCOUNT",
          "The provider does not support this account environment.",
        );
      }
      // Duplicate check happens here AND via the DB unique constraint (race-safe).
      const duplicate = await this.repository.findAccountByExternal(
        input.userId,
        input.payload.providerId,
        input.payload.externalAccountId,
      );
      if (duplicate) {
        throw new ConflictError(
          "This trading account is already connected.",
          TRADING_ERROR_CODES.DUPLICATE_ACCOUNT,
        );
      }

      const count = await this.repository.countAccountsByUser(input.userId);
      const name =
        input.payload.displayName ??
        `${adapter.descriptor.providerName} ${input.payload.environment}`;
      // Phase 07 - identify the broker AT CONNECTION TIME (owner requirement:
      // "which broker is this?"). Provider-reported identity (e.g. Deriv
      // landing company) wins; catalog patterns + registry platform fall
      // through. The snapshot is persisted with its evidence signals.
      const brokerIdentification = this.brokerIdentification.identifyAtConnect({
        providerId: adapter.descriptor.providerId,
        externalAccountId: input.payload.externalAccountId,
        providerReported: safeInfo.brokerIdentity ?? null,
      });
      const { account } = await this.repository.createAccountWithConnection({
        account: {
          userId: input.userId,
          name,
          type: input.payload.environment,
          broker: adapter.descriptor.platform,
          currency: safeInfo.currency,
          // Provider-reported balance at connect is the journal anchor (§25).
          startingBalance: snapshot.balance ?? "0",
          isDefault: count === 0,
          externalAccountId: input.payload.externalAccountId,
          providerId: adapter.descriptor.providerId,
          brokerId: brokerIdentification.brokerId,
          brokerIdentity: brokerIdentification,
        },
        connection: {
          method: "API_KEY",
          credentialsEnc: this.credentials.encrypt(input.payload.credentials.secret),
          credentialsHint: CredentialsEncryptionService.hint(input.payload.credentials.secret),
          permissions: [...adapter.descriptor.supportedPermissions],
          lastConnectedAt: new Date(),
        },
      });

      await this.events.record({
        userId: input.userId,
        type: "TRADING_ACCOUNT_CONNECTED",
        actor: input.user.email,
        context: `Connected ${adapter.descriptor.providerName} account ${input.payload.externalAccountId} (${input.payload.environment}), read-only. Broker identified: ${brokerIdentification.displayName} (${brokerIdentification.confidence}).`,
      });

      // Initial synchronization - failures never invalidate the registration.
      const connection = await this.repository.findConnectionByAccountId(account.id);
      if (connection) {
        try {
          await this.sync.runInitialSync({
            userId: input.userId,
            account,
            connection,
            credentials,
            requestId: input.requestId,
          });
        } catch (error) {
          this.logger?.warn(
            { userId: input.userId, accountId: account.id, err: error instanceof Error ? error.message : "unknown" },
            "initial synchronization failed after connect",
          );
        }
      }

      const details = await this.getDetails(input.userId, account.id);
      return details.account;
    } catch (error) {
      if (error instanceof ConflictError) throw error;
      await this.events.record({
        userId: input.userId,
        type: "TRADING_ACCOUNT_CONNECTION_FAILED",
        actor: input.user.email,
        context: `Connection to ${input.payload.providerId} failed (external account ${input.payload.externalAccountId}).`,
        outcome: "FAILURE",
      });
      throw normalizeProviderError(error);
    }
  }

  // ── Phase 08 - MT5 terminal bridge (PLATFORM_BRIDGE lifecycle) ─────────────

  /**
   * Bridge pairing connect: register the account + connection in CONNECTING
   * state, generate the bridge secret SERVER-SIDE, and return the pairing
   * sheet (shown once in the UI; re-viewable through the dedicated endpoint;
   * rotatable). No provider call is possible yet - the EA may not exist.
   * The journal anchor facts (currency, balance) are corrected by the first
   * ACCOUNT_INFO/SNAPSHOT pushes.
   */
  private async connectBridge(
    input: {
      userId: string;
      user: UserRow;
      payload: TradingAccountConnectInput;
      requestId: string | null;
    },
    adapter: { readonly descriptor: TradingProviderDescriptor },
  ): Promise<ReturnType<typeof toAccountDetails>> {
    if (input.payload.credentials?.secret) {
      throw new BusinessRuleError(
        "A bridge account does not take a secret here - Euforia generates one for the terminal.",
        TRADING_ERROR_CODES.INVALID_CREDENTIALS,
      );
    }
    // MT5 logins are numeric (4–12 digits documented convention).
    if (!/^\d{4,12}$/.test(input.payload.externalAccountId)) {
      throw new BusinessRuleError(
        "An MT5 login is a numeric account number (e.g. 52988790).",
        TRADING_ERROR_CODES.INVALID_CREDENTIALS,
      );
    }

    const selectedBroker = input.payload.brokerId
      ? this.brokerIdentification.catalogForClient().brokers.find(
          (entry) =>
            entry.brokerId === input.payload.brokerId &&
            entry.providerId === adapter.descriptor.providerId &&
            entry.connectorStatus === "CONNECTOR_AVAILABLE",
        )
      : null;
    if (input.payload.brokerId && !selectedBroker) {
      throw new BusinessRuleError(
        "The selected broker does not have an available connector for this provider.",
        TRADING_ERROR_CODES.UNSUPPORTED_PROVIDER,
      );
    }

    const accountBrokerId = selectedBroker?.brokerId ?? "unknown";
    const duplicate = await this.repository.findAccountByExternal(
      input.userId,
      adapter.descriptor.providerId,
      input.payload.externalAccountId,
      accountBrokerId,
    );
    if (duplicate) {
      throw new ConflictError(
        "This trading account is already connected.",
        TRADING_ERROR_CODES.DUPLICATE_ACCOUNT,
      );
    }

    const count = await this.repository.countAccountsByUser(input.userId);
    const name =
      input.payload.displayName ??
      `${selectedBroker?.displayName ?? adapter.descriptor.providerName} ${input.payload.environment}`;
    const { keyId, secret } = this.generateBridgeKey();
    // Journal anchor placeholders, corrected by the first pushes: "USD" is
    // the terminal-side default the pairing guide mandates; the connection
    // stays CONNECTING and the snapshot null until real data arrives - the
    // pending state is always visible in the UI.
    const { account } = await this.repository.createAccountWithConnection({
      account: {
        userId: input.userId,
        name,
        type: input.payload.environment,
        broker: adapter.descriptor.platform,
        currency: "USD",
        startingBalance: "0",
        isDefault: count === 0,
        externalAccountId: input.payload.externalAccountId,
        providerId: adapter.descriptor.providerId,
        brokerId: accountBrokerId,
        brokerIdentity: {
          brokerId: "unknown",
          displayName: "Unknown broker",
          platform: adapter.descriptor.platform,
          confidence: "UNKNOWN",
          connectorStatus: "CONNECTOR_AVAILABLE",
          providerId: adapter.descriptor.providerId,
          signals: [
            "terminal platform MT5 - the broker is identified from the terminal's own report on first push",
          ],
          identifiedAt: isoDateTime(new Date()),
        },
      },
      connection: {
        method: "PLATFORM_BRIDGE",
        credentialsEnc: this.credentials.encrypt(secret),
        credentialsHint: CredentialsEncryptionService.hint(secret),
        permissions: [...adapter.descriptor.supportedPermissions],
        lastConnectedAt: new Date(),
        expectedBrokerId: selectedBroker?.brokerId ?? null,
        status: "CONNECTING",
        bridgeKeyId: keyId,
      },
    });

    await this.events.record({
      userId: input.userId,
      type: "TRADING_ACCOUNT_CONNECTED",
      actor: input.user.email,
      context: `MT5 bridge pairing created for account ${input.payload.externalAccountId} (${input.payload.environment}) - awaiting first terminal push.`,
    });

    const details = await this.getDetails(input.userId, account.id);
    return { ...details.account, pairing: this.buildPairing(keyId, secret) };
  }

  /** Fresh routing key + secret (secret shown only in pairing views, §22). */
  private generateBridgeKey(): { keyId: string; secret: string } {
    return {
      keyId: `brg_${randomBytes(8).toString("hex")}`,
      secret: `bks_${randomBytes(32).toString("base64url")}`,
    };
  }

  private buildPairing(keyId: string, secret: string): BridgePairing {
    return {
      bridgeKeyId: keyId,
      secret,
      ingestPath: "/api/v1/trading-accounts/bridge/ingest",
      headers: {
        key: "X-Bridge-Key",
        timestamp: "X-Bridge-Timestamp",
        signature: "X-Bridge-Signature",
        eventId: "X-Bridge-Event-Id",
      },
      serialization:
        'signature = HMAC_SHA256(secret, `${timestampMs}.${JSON.stringify({eventId, kind, payload})}`)',
      pushIntervalSeconds: 30,
      ea: {
        fileName: "EuforiaBridge.mq5",
        downloadPath: "/bridge/EuforiaBridge.mq5",
        version: "1.0.2",
      },
    };
  }

  /** Pairing sheet re-view (owner-only; the EA setup may need it again). */
  async getBridgePairing(userId: string, accountId: string): Promise<{ pairing: BridgePairing }> {
    const { connection } = await this.loadOwned(userId, accountId);
    if (!connection || connection.method !== "PLATFORM_BRIDGE" || !connection.bridgeKeyId) {
      throw new BusinessRuleError(
        "This account is not a terminal bridge connection.",
        TRADING_ERROR_CODES.UNSUPPORTED_PROVIDER,
      );
    }
    const secret = this.credentials.decrypt(connection.credentialsEnc);
    if (!secret) {
      throw new BusinessRuleError(
        "The bridge secret was destroyed. Rotate it to pair the terminal again.",
        TRADING_ERROR_CODES.INVALID_CREDENTIALS,
      );
    }
    return { pairing: this.buildPairing(connection.bridgeKeyId, secret) };
  }

  /** Rotate the bridge secret: the old terminal configuration stops working. */
  async rotateBridgeSecret(userId: string, user: UserRow, accountId: string) {
    const { connection } = await this.loadOwned(userId, accountId);
    if (!connection || connection.method !== "PLATFORM_BRIDGE") {
      throw new BusinessRuleError(
        "This account is not a terminal bridge connection.",
        TRADING_ERROR_CODES.UNSUPPORTED_PROVIDER,
      );
    }
    const { keyId, secret } = this.generateBridgeKey();
    await this.repository.rotateBridgeCredentials(accountId, {
      bridgeKeyId: keyId,
      credentialsEnc: this.credentials.encrypt(secret),
      credentialsHint: CredentialsEncryptionService.hint(secret),
    });
    await this.events.record({
      userId,
      type: "TRADING_ACCOUNT_BRIDGE_ROTATED",
      actor: user.email,
      context: `Bridge secret rotated for account ${connection.bridgeKeyId ? "(paired terminal)" : accountId} - the previous terminal configuration is invalidated.`,
    });
    const pairing = this.buildPairing(keyId, secret);
    const details = await this.getDetails(userId, accountId);
    return { account: { ...details.account, pairing } };
  }

  // Key + encrypted secret are persisted atomically; the connection status
  // stays as-is and the next accepted push re-proves the terminal.

  /** Connection health check - 200 with per-check results, honest booleans. */
  async testConnection(userId: string, accountId: string) {
    const { account, connection, descriptor } = await this.loadFull(userId, accountId);
    if (!connection || connection.status === "DISCONNECTED" || !connection.credentialsEnc) {
      throw new BusinessRuleError(
        "This account is not connected. Reconnect it first.",
        TRADING_ERROR_CODES.NOT_CONNECTED,
      );
    }
    const adapter = this.registry.require(connection.providerId);

    // Phase 08 - bridge health is answered from the PAIRING FACTS (there is
    // no provider to dial): secret presence, first-push state, cache reads.
    if (connection.method === "PLATFORM_BRIDGE") {
      const secret = this.credentials.decrypt(connection.credentialsEnc);
      const bridgeContext: ProviderRequestContext = {
        credentials: { method: "PLATFORM_BRIDGE", secret: secret ?? "" },
        externalAccountId: account.externalAccountId,
        environment: account.type as ProviderRequestContext["environment"],
        bridgeKeyId: connection.bridgeKeyId,
      };
      const checks: Array<{ name: string; ok: boolean; detail: string }> = [];
      checks.push({
        name: "authentication",
        ok: Boolean(secret) && Boolean(connection.bridgeKeyId),
        detail:
          secret && connection.bridgeKeyId
            ? "Bridge secret present and keyed."
            : "The bridge secret is missing. Rotate it to pair again.",
      });
      const awaiting = connection.status !== "CONNECTED";
      checks.push({
        name: "connectivity",
        ok: !awaiting,
        detail: awaiting
          ? "Awaiting the first push from the terminal (attach the EuforiaBridge EA)."
          : "The terminal bridge has pushed at least one accepted event.",
      });
      try {
        const snap = await adapter.fetchSnapshot(bridgeContext);
        assertValid(normalizedSnapshotSchema, snap);
        checks.push({
          name: "providerResponse",
          ok: true,
          detail: "Cached bridge snapshot validated.",
        });
      } catch (error) {
        checks.push({ name: "providerResponse", ok: false, detail: providerDetail(error) });
      }
      const readPermissions = descriptor.supportedPermissions.filter((p) => p.startsWith("READ_"));
      checks.push({
        name: "permissions",
        ok: readPermissions.length > 0,
        detail:
          readPermissions.length > 0
            ? `Read-only permission set granted: ${readPermissions.join(", ")}.`
            : "The provider granted no read permissions.",
      });
      const ok = checks.every((check) => check.ok);
      return { ok, checks: checks as typeof checks };
    }

    const secret = this.credentials.decrypt(connection.credentialsEnc);
    if (!secret) {
      throw new BusinessRuleError(
        "The stored credentials could not be used. Please reconnect the account.",
        TRADING_ERROR_CODES.INVALID_CREDENTIALS,
      );
    }
    const credentials: ProviderCredentials = { method: "API_KEY", secret };
    const timeoutMs = this.config.accounts.providerTimeoutMs;
    const context: ProviderRequestContext = {
      credentials,
      externalAccountId: account.externalAccountId,
      environment: account.type as ProviderRequestContext["environment"],
    };

    const checks: Array<{ name: string; ok: boolean; detail: string }> = [];
    let authenticationOk = true;

    try {
      await withProviderTimeout(adapter.testConnection(credentials), timeoutMs);
      checks.push({ name: "authentication", ok: true, detail: "Credentials accepted by the provider." });
    } catch (error) {
      authenticationOk = false;
      checks.push({ name: "authentication", ok: false, detail: providerDetail(error) });
    }

    if (authenticationOk) {
      try {
        const info = await withProviderTimeout(adapter.fetchAccountInfo(context), timeoutMs);
        assertValid(normalizedAccountInfoSchema, info);
        checks.push({ name: "connectivity", ok: true, detail: "Account metadata retrieved." });
      } catch (error) {
        checks.push({ name: "connectivity", ok: false, detail: providerDetail(error) });
      }
      try {
        const snap = await withProviderTimeout(adapter.fetchSnapshot(context), timeoutMs);
        assertValid(normalizedSnapshotSchema, snap);
        checks.push({ name: "providerResponse", ok: true, detail: "Snapshot response validated." });
      } catch (error) {
        checks.push({ name: "providerResponse", ok: false, detail: providerDetail(error) });
      }
    } else {
      checks.push({ name: "connectivity", ok: false, detail: "Skipped - authentication failed." });
      checks.push({ name: "providerResponse", ok: false, detail: "Skipped - authentication failed." });
    }

    // Permissions are static descriptor facts (§24) - read-only by construction.
    const readPermissions = descriptor.supportedPermissions.filter((p) => p.startsWith("READ_"));
    const permissionsOk = readPermissions.length > 0;
    checks.push({
      name: "permissions",
      ok: permissionsOk,
      detail: permissionsOk
        ? `Read-only permission set granted: ${readPermissions.join(", ")}.`
        : "The provider granted no read permissions.",
    });

    const ok = checks.every((check) => check.ok);
    if (!ok) {
      const failed = checks.find((check) => !check.ok && check.name === "authentication");
      if (failed) {
        await this.repository.setConnectionError(accountId, "The provider rejected the stored credentials.");
      }
    }
    return { ok, checks: checks as typeof checks };
  }

  /** Reconnect with FRESH credentials - only for non-CONNECTED connections. */
  async reconnect(input: {
    userId: string;
    user: UserRow;
    accountId: string;
    payload: TradingReconnectInput;
    requestId: string | null;
  }): Promise<ReturnType<typeof toAccountDetails>> {
    const { account, connection } = await this.loadOwned(input.userId, input.accountId);
    if (!connection) {
      throw new NotFoundError("The requested resource does not exist.");
    }
    if (connection.status === "CONNECTED") {
      throw new ConflictError(
        "This account is already connected. Disconnect it first.",
        TRADING_ERROR_CODES.ALREADY_CONNECTED,
      );
    }
    // Phase 08 - bridge connections hold no user-supplied credential to
    // refresh: rotation replaces the secret, the next push re-proves it.
    if (connection.method === "PLATFORM_BRIDGE") {
      throw new BusinessRuleError(
        "A terminal bridge connection does not reconnect with credentials - rotate the bridge secret instead.",
        TRADING_ERROR_CODES.UNSUPPORTED_PROVIDER,
      );
    }
    const adapter = this.registry.require(connection.providerId);
    const credentials: ProviderCredentials = {
      method: "API_KEY",
      secret: input.payload.credentials.secret,
    };
    try {
      const timeoutMs = this.config.accounts.providerTimeoutMs;
      await withProviderTimeout(adapter.testConnection(credentials), timeoutMs);
      await withProviderTimeout(
        adapter.fetchAccountInfo({
          credentials,
          externalAccountId: account.externalAccountId,
          environment: account.type as ProviderRequestContext["environment"],
        }),
        timeoutMs,
      );
    } catch (error) {
      await this.events.record({
        userId: input.userId,
        type: "TRADING_ACCOUNT_CONNECTION_FAILED",
        actor: input.user.email,
        context: `Reconnection to ${connection.providerId} failed (external account ${account.externalAccountId}).`,
        outcome: "FAILURE",
      });
      throw normalizeProviderError(error);
    }
    await this.repository.reconnectConnection(account.id, {
      credentialsEnc: this.credentials.encrypt(input.payload.credentials.secret),
      credentialsHint: CredentialsEncryptionService.hint(input.payload.credentials.secret),
      lastConnectedAt: new Date(),
    });
    await this.events.record({
      userId: input.userId,
      type: "TRADING_ACCOUNT_CONNECTED",
      actor: input.user.email,
      context: `Reconnected ${connection.providerId} account ${account.externalAccountId} with fresh credentials.`,
    });

    const refreshed = await this.repository.findConnectionByAccountId(account.id);
    if (refreshed) {
      try {
        await this.sync.runInitialSync({
          userId: input.userId,
          account,
          connection: refreshed,
          credentials,
          requestId: input.requestId,
        });
      } catch (error) {
        this.logger?.warn(
          { userId: input.userId, accountId: account.id, err: error instanceof Error ? error.message : "unknown" },
          "initial synchronization failed after reconnect",
        );
      }
    }
    const details = await this.getDetails(input.userId, account.id);
    return details.account;
  }

  /**
   * Disconnect (§52): destroys credentials, preserves every piece of Euforia
   * data (account, history, runs). Deletion is NOT offered in V1 - removal
   * semantics (soft/hard/anonymization) are an explicit product decision.
   */
  async disconnect(userId: string, user: UserRow, accountId: string) {
    const { account } = await this.loadOwned(userId, accountId);
    await this.repository.disconnectConnection(account.id);
    await this.events.record({
      userId,
      type: "TRADING_ACCOUNT_DISCONNECTED",
      actor: user.email,
      context: `Disconnected provider ${account.providerId} account ${account.externalAccountId}; history preserved.`,
    });
    return {
      accountId: account.id,
      status: "DISCONNECTED" as const,
      historyPreserved: true as const,
    };
  }

  /** Provider trigger endpoint - delegates with rate limiting (§37). */
  async synchronize(input: {
    userId: string;
    accountId: string;
    requestId: string | null;
    limiter: { check(scope: string, key: string): { allowed: boolean; retryAfterSeconds: number }; hit(scope: string, key: string): void };
  }) {
    this.sync.checkSyncRateLimit(input.limiter, input.userId);
    input.limiter.hit("sync", input.userId);
    const { account, connection } = await this.loadOwned(input.userId, input.accountId);
    if (!connection || connection.status !== "CONNECTED" || !connection.credentialsEnc) {
      throw new BusinessRuleError(
        "This account is not connected. Reconnect it before synchronizing.",
        TRADING_ERROR_CODES.NOT_CONNECTED,
      );
    }
    return this.sync.synchronize({
      userId: input.userId,
      account,
      connection,
      requestId: input.requestId,
    });
  }

  /**
   * Bounded synchronization history (Phase 05 §16) - keyset-paginated,
   * newest first. Ownership is enforced by loadOwned (foreign ids → 404,
   * IDOR-safe); the page size is server-bounded (max 50); the cursor is the
   * previous page's nextCursor (an ISO timestamp, strictly `<`).
   */
  async listSyncHistory(input: {
    userId: string;
    accountId: string;
    limit: number;
    before: Date | null;
  }): Promise<TradingSyncRunsResponse> {
    const { account } = await this.loadOwned(input.userId, input.accountId);
    const take = Math.min(Math.max(input.limit, 1), 50);
    const runs = await this.repository.listSyncRuns(account.id, {
      take: take + 1,
      before: input.before,
    });
    const hasMore = runs.length > take;
    const page = hasMore ? runs.slice(0, take) : runs;
    const oldest = page.length > 0 ? page[page.length - 1] : undefined;
    return {
      runs: page.map((row) => toSyncRunView(row)),
      nextCursor: hasMore && oldest ? isoDateTime(oldest.startedAt) : null,
    };
  }

  // ── Broker session (Session-Live panel contract) ───────────────────────────

  /**
   * GET /broker/session - the read-only Session-Live aggregate. Account
   * selection: the default CONNECTED account, else the most recent CONNECTED,
   * else an ERROR account (honest state), else NOT_CONFIGURED.
   */
  async getBrokerSession(userId: string) {
    const accounts = await this.repository.listAccountsByUser(userId);
    const withConnections = await Promise.all(
      accounts.map(async (account) => ({
        account,
        connection: await this.repository.findConnectionByAccountId(account.id),
      })),
    );
    const connected = withConnections.filter(
      (entry): entry is { account: TradingAccountRow; connection: TradingConnectionRow } =>
        entry.connection?.status === "CONNECTED",
    );
    const errored = withConnections.find(
      (entry) => entry.connection?.status === "ERROR",
    );

    const pick =
      connected.find((entry) => entry.account.isDefault) ?? connected[0] ?? undefined;
    if (!pick) {
      if (errored) {
        return {
          connected: false,
          state: "ERROR" as const,
          reason: errored.connection?.lastError ?? "The trading connection is in an error state.",
          account: null,
          positions: [] as BrokerPosition[],
          orders: [] as BrokerOrder[],
          lastSyncAt: null,
        };
      }
      return {
        connected: false,
        state: "NOT_CONFIGURED" as const,
        reason: "No trading account is connected yet. Connect a read-only account in Accounts.",
        account: null,
        positions: [] as BrokerPosition[],
        orders: [] as BrokerOrder[],
        lastSyncAt: null,
      };
    }

    const { account, connection } = pick;
    const [snapshot, positions, orders] = await Promise.all([
      this.repository.latestSnapshot(account.id),
      this.repository.listPositions(account.id),
      this.repository.listOrders(account.id),
    ]);
    const brokerAccount: BrokerAccountSnapshot | null = snapshot
      ? {
          broker: account.broker,
          accountNumber: account.externalAccountId,
          currency: account.currency as BrokerAccountSnapshot["currency"],
          balance: decimal(snapshot.balance),
          equity: decimal(snapshot.equity),
          unrealizedPnl: decimal(snapshot.unrealizedPnl),
          usedMargin: decimal(snapshot.margin),
          freeMargin: decimal(snapshot.freeMargin),
          marginLevel: decimal(snapshot.marginLevel),
        }
      : null;
    return {
      connected: true,
      state: "CONNECTED" as const,
      reason: null,
      account: brokerAccount,
      positions: positions.map((row) => ({
        id: row.externalPositionId,
        symbol: row.symbol,
        direction: row.side as BrokerPosition["direction"],
        volume: row.volume.toFixed(),
        entryPrice: row.entryPrice.toFixed(),
        currentPrice: decimal(row.currentPrice),
        stopLoss: decimal(row.stopLoss),
        takeProfit: decimal(row.takeProfit),
        unrealizedPnl: decimal(row.profit),
        openedAt: isoDateTime(row.openedAt),
      })),
      orders: orders.map((row) => ({
        id: row.externalOrderId,
        symbol: row.symbol,
        type: row.type,
        price: row.price.toFixed(),
        stopLoss: decimal(row.stopLoss),
        takeProfit: decimal(row.takeProfit),
        volume: row.volume.toFixed(),
        createdAt: isoDateTime(row.providerCreatedAt ?? row.syncedAt),
      })),
      lastSyncAt: connection.lastSyncAt ? isoDateTime(connection.lastSyncAt) : null,
    };
  }

  // ── internals ──────────────────────────────────────────────────────────────

  /** Ownership-scoped account load - foreign/unknown ids are 404 (IDOR-safe). */
  private async loadOwned(
    userId: string,
    accountId: string,
  ): Promise<{ account: TradingAccountRow; connection: TradingConnectionRow | null }> {
    const account = await this.repository.findAccountForUser(accountId, userId);
    if (!account) throw new NotFoundError();
    const connection = await this.repository.findConnectionByAccountId(account.id);
    return { account, connection };
  }

  /** Full aggregate for the details view, with the provider descriptor. */
  private async loadFull(userId: string, accountId: string) {
    const { account, connection } = await this.loadOwned(userId, accountId);
    const [snapshot, latestRun, resourceTimestamps] = await Promise.all([
      this.repository.latestSnapshot(account.id),
      this.repository.latestSyncRun(account.id),
      // Phase 05 - per-resource freshness anchor (§11).
      this.repository.latestResourceTimestamps(account.id),
    ]);
    return {
      account,
      connection,
      descriptor: this.descriptorFor(account),
      snapshot,
      latestRun,
      resourceTimestamps,
    };
  }

  /**
   * Descriptor for the account's provider. If a provider was deregistered
   * (e.g. the mock gate disabled after connecting), a minimal honest
   * descriptor is synthesized instead of failing the read.
   */
  private descriptorFor(account: TradingAccountRow): TradingProviderDescriptor {
    const adapter = this.registry.get(account.providerId);
    if (adapter) return adapter.descriptor;
    return {
      providerId: account.providerId,
      providerName: account.providerId,
      platform: account.broker as TradingProviderDescriptor["platform"],
      supportedEnvironments: [account.type as TradingProviderDescriptor["supportedEnvironments"][number]],
      supportedConnectionMethods: ["API_KEY"],
      supportedPermissions: [],
      capabilities: {
        account: false,
        snapshot: false,
        positions: false,
        orders: false,
        deals: false,
        history: false,
      },
      isMock: false,
    };
  }
}

/** Validate a normalized payload - provider-shape failures become ProviderError. */
function assertValid<S extends ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ProviderError(
      "INVALID_PROVIDER_RESPONSE",
      "The trading provider returned an unexpected response.",
    );
  }
  return result.data;
}

/** Sanitized check detail - stable text for ProviderError, generic otherwise. */
function providerDetail(error: unknown): string {
  if (error instanceof ProviderError) return error.message;
  return "The trading provider could not be reached.";
}

function decimal(value: Prisma.Decimal | null): string | null {
  return value === null ? null : value.toFixed();
}
