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
