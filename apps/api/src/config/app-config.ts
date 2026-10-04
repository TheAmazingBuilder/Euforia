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
  };
  accounts: {
    /** AES-256-GCM key encrypting trading credentials at rest (§22). */
    credentialsEncryptionKey: Buffer;
    /** Per-call timeout applied to trading provider adapter calls. */
    providerTimeoutMs: number;
    /** Whether the mock trading provider may be registered (§57). */
    mockProviderEnabled: boolean;
  };
  trades: {
    /** Local filesystem storage root for trade-screenshot binaries (§39). */
    screenshotsRoot: string;
    /** Max decoded binary size accepted for one trade screenshot. */
    screenshotMaxBytes: number;
  };
  auth: {
    jwtSecret: string;
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
    },
    accounts: {
      credentialsEncryptionKey: Buffer.from(env.ACCOUNTS_CREDENTIALS_ENCRYPTION_KEY, "base64"),
      providerTimeoutMs: env.ACCOUNTS_PROVIDER_TIMEOUT_MS,
      mockProviderEnabled:
        env.ACCOUNTS_MOCK_PROVIDER !== undefined
          ? env.ACCOUNTS_MOCK_PROVIDER === "enabled"
          : env.NODE_ENV !== "production",
    },
    trades: {
      screenshotsRoot: env.TRADES_SCREENSHOTS_ROOT,
      screenshotMaxBytes: env.TRADES_SCREENSHOT_MAX_BYTES,
    },
    auth: {
      jwtSecret: env.AUTH_JWT_SECRET,
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
