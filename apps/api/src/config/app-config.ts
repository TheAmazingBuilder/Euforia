import { validateEnv, type Env } from "./env.schema";

/**
 * Typed, immutable application configuration.
 * Built once from validated environment variables — the ONLY place that
 * reads `process.env` in the application (besides the env schema itself).
 */
export interface AppConfig {
  env: Env["NODE_ENV"];
  isProduction: boolean;
  isDevelopment: boolean;
  port: number;
  /** PostgreSQL connection string — never logged, never returned to clients. */
  databaseUrl: string;
  corsOrigins: readonly string[];
  logLevel: Env["LOG_LEVEL"];
  bodyLimitBytes: number;
  trustProxy: boolean;
  rateLimit: { windowSeconds: number; max: number };
  marketServiceUrl?: string;
  ocr: {
    /** FastAPI sidecar base URL — absent means the sidecar is not registered. */
    serviceUrl?: string;
    /** Shared secret for service-to-service auth (§27) — never logged. */
    serviceToken?: string;
    /** Whether the deterministic mock engine may be registered (§57). */
    mockEngineEnabled: boolean;
    /** Max decoded binary size per screenshot upload (§8). */
    uploadMaxBytes: number;
    /** Decompression-bomb pixel guard (§38). */
    imageMaxPixels: number;
    /** Sidecar call timeout (§26). */
    engineTimeoutMs: number;
    /** Extra attempts for TRANSIENT engine failures (§34). */
    engineMaxRetries: number;
    /** Local filesystem storage root for screenshot binaries (§6). */
    storageRoot: string;
    /** Screenshot retention window in days (0 disables, engine quality §4.2). */
    retentionDays: number;
    /** Minimum delay between two lazy retention sweeps (recognition V1). */
    retentionSweepMs: number;
    /** Max decoded binary size accepted for one PDF statement upload (V2). */
    pdfMaxBytes: number;
  };
  accounts: {
    /** AES-256-GCM key encrypting trading credentials at rest (§22). */
    credentialsEncryptionKey: Buffer;
    /** Per-call timeout applied to trading provider adapter calls. */
    providerTimeoutMs: number;
    /** Whether the mock trading provider may be registered (§57). */
    mockProviderEnabled: boolean;
    /** Whether the real OANDA v20 REST adapter is registered (Phase 03). */
    oandaEnabled: boolean;
    /** OANDA REST base-URL override (tests/region edge); null = route by environment. */
    oandaRestUrlOverride: string | null;
    /** Whether the real Deriv WS adapter is registered (Phase 07). */
    derivEnabled: boolean;
    /** Deriv WS endpoint override (tests/fixture server); null = official endpoint. */
    derivWsUrlOverride: string | null;
    /** Deriv application id (developers.deriv.com registration; dev default documented). */
    derivAppId: string;
    /** Whether the MT5 terminal bridge adapter is registered (Phase 08). */
    mt5BridgeEnabled: boolean;
    /** Phase 05 — background sync scheduler gate (never on by default, §57). */
    syncSchedulerEnabled: boolean;
    /** Phase 05 — base interval between scheduler sweeps (jittered per tick). */
    syncIntervalMs: number;
    /** Phase 05 — bounded concurrency across connections per sweep (§9.1). */
    syncMaxConcurrency: number;
    /** Phase 05 — RUNNING runs older than this are CANCELLED (§15 recovery). */
    syncStaleRunMs: number;
    /** Phase 05 — bounded retries per segment for transient failures (§15). */
    syncSegmentRetries: number;
  };
  trades: {
    /** Local filesystem storage root for trade-screenshot binaries (§39). */
    screenshotsRoot: string;
    /** Max decoded binary size accepted for one trade screenshot. */
    screenshotMaxBytes: number;
  };
  calendar: {
    /** Past half of the canonical eco sync window (§23) — Analytics correlation depth. */
    windowPastDays: number;
    /** Future half of the canonical eco sync window (§23) — planner/news-blocker horizon. */
    windowFutureDays: number;
  };
  integrations: {
    /** AES-256-GCM key encrypting webhook signing secrets at rest (§14). */
    webhookEncryptionKey: Buffer;
  };
  auth: {
    jwtSecret: string;
    jwtIssuer: string;
    jwtAudience: string;
    mfaEncryptionKey: Buffer;
    accessTtlSeconds: number;
    refreshRememberDays: number;
    refreshSessionHours: number;
    emailVerificationHours: number;
    passwordResetMinutes: number;
    mfaChallengeMinutes: number;
    reauthMinutes: number;
    webAppUrl: string;
    emailFrom: string;
    requireEmailVerification: boolean;
  };
}

let cached: AppConfig | undefined;

function build(env: Env): AppConfig {
  return {
    env: env.NODE_ENV,
    isProduction: env.NODE_ENV === "production",
    isDevelopment: env.NODE_ENV === "development",
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    corsOrigins: env.CORS_ORIGINS,
    logLevel: env.LOG_LEVEL,
    bodyLimitBytes: env.BODY_LIMIT_BYTES,
    trustProxy: env.TRUST_PROXY,
    rateLimit: {
      windowSeconds: env.RATE_LIMIT_WINDOW_SECONDS,
      max: env.RATE_LIMIT_MAX,
    },
    marketServiceUrl: env.MARKET_SERVICE_URL,
    ocr: {
      serviceUrl: env.OCR_SERVICE_URL,
      serviceToken: env.OCR_SERVICE_TOKEN,
      mockEngineEnabled:
        env.OCR_MOCK_ENGINE !== undefined
          ? env.OCR_MOCK_ENGINE === "enabled"
          : env.NODE_ENV !== "production",
      uploadMaxBytes: env.OCR_UPLOAD_MAX_BYTES,
      imageMaxPixels: env.OCR_IMAGE_MAX_PIXELS,
      engineTimeoutMs: env.OCR_ENGINE_TIMEOUT_MS,
      engineMaxRetries: env.OCR_ENGINE_MAX_RETRIES,
      storageRoot: env.OCR_STORAGE_ROOT,
      retentionDays: env.OCR_RETENTION_DAYS,
      retentionSweepMs: env.OCR_RETENTION_SWEEP_MS,
      pdfMaxBytes: env.OCR_PDF_MAX_BYTES,
    },
    accounts: {
      credentialsEncryptionKey: Buffer.from(env.ACCOUNTS_CREDENTIALS_ENCRYPTION_KEY, "base64"),
      providerTimeoutMs: env.ACCOUNTS_PROVIDER_TIMEOUT_MS,
      mockProviderEnabled:
        env.ACCOUNTS_MOCK_PROVIDER !== undefined
          ? env.ACCOUNTS_MOCK_PROVIDER === "enabled"
          : env.NODE_ENV !== "production",
      oandaEnabled: env.ACCOUNTS_OANDA_PROVIDER === "enabled",
      oandaRestUrlOverride: env.ACCOUNTS_OANDA_REST_URL ?? null,
      derivEnabled: env.ACCOUNTS_DERIV_PROVIDER === "enabled",
      derivWsUrlOverride: env.ACCOUNTS_DERIV_WS_URL ?? null,
      // Deriv's public example app id — development/verification only (see
      // env.schema.ts); real deployments register their own application id.
      derivAppId: env.ACCOUNTS_DERIV_APP_ID ?? "1089",
      mt5BridgeEnabled: env.ACCOUNTS_MT5_BRIDGE_PROVIDER === "enabled",
      syncSchedulerEnabled: env.ACCOUNTS_SYNC_SCHEDULER === "enabled",
      syncIntervalMs: env.ACCOUNTS_SYNC_INTERVAL_MS,
      syncMaxConcurrency: env.ACCOUNTS_SYNC_MAX_CONCURRENCY,
      syncStaleRunMs: env.ACCOUNTS_SYNC_STALE_RUN_MS,
      syncSegmentRetries: env.ACCOUNTS_SYNC_SEGMENT_RETRIES,
    },
    trades: {
      screenshotsRoot: env.TRADES_SCREENSHOTS_ROOT,
      screenshotMaxBytes: env.TRADES_SCREENSHOT_MAX_BYTES,
    },
    calendar: {
      windowPastDays: env.CALENDAR_WINDOW_PAST_DAYS,
      windowFutureDays: env.CALENDAR_WINDOW_FUTURE_DAYS,
    },
    integrations: {
      webhookEncryptionKey: Buffer.from(env.INTEGRATIONS_WEBHOOK_ENCRYPTION_KEY, "base64"),
    },
    auth: {
      jwtSecret: env.AUTH_JWT_SECRET,
      jwtIssuer: env.AUTH_JWT_ISSUER,
      jwtAudience: env.AUTH_JWT_AUDIENCE,
      mfaEncryptionKey: Buffer.from(env.AUTH_MFA_ENCRYPTION_KEY, "base64"),
      accessTtlSeconds: env.AUTH_ACCESS_TTL_SECONDS,
      refreshRememberDays: env.AUTH_REFRESH_REMEMBER_DAYS,
      refreshSessionHours: env.AUTH_REFRESH_SESSION_HOURS,
      emailVerificationHours: env.AUTH_EMAIL_VERIFICATION_HOURS,
      passwordResetMinutes: env.AUTH_PASSWORD_RESET_MINUTES,
      mfaChallengeMinutes: env.AUTH_MFA_CHALLENGE_MINUTES,
      reauthMinutes: env.AUTH_REAUTH_MINUTES,
      webAppUrl: env.WEB_APP_URL,
      emailFrom: env.EMAIL_FROM,
      requireEmailVerification: env.AUTH_REQUIRE_EMAIL_VERIFICATION,
    },
  };
}

/**
 * Load and validate configuration from `process.env`.
 * Memoized: the application validates its environment exactly once, at boot.
 * Throws {@link EnvValidationError} (safe: key paths only, no values).
 */
export function loadAppConfig(source?: Record<string, string | undefined>): AppConfig {
  if (!cached) {
    cached = build(validateEnv(source));
  }
  return cached;
}

/** Test helper — clears the memoized config. Not used in production code. */
export function resetAppConfigCache(): void {
  cached = undefined;
}

/** Injection token for the validated {@link AppConfig}. */
export const APP_CONFIG = Symbol("APP_CONFIG");
