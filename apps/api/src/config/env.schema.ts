/**
 * COSMOZ API — environment contract (Foundation).
 *
 * All environment variables are validated at process start. Invalid or missing
 * configuration causes a CONTROLLED STARTUP FAILURE (fail fast) with an error
 * that lists invalid keys and reasons — never secret VALUES.
 *
 * Categories (Phase 1 mandate §8): application, database, security, CORS,
 * logging, rate limiting, external services.
 */
import { z } from "zod";

/** Wildcard origin is forbidden everywhere: credentials are always enabled. */
const corsOriginsSchema = z
  .string()
  .trim()
  .min(1, "CORS_ORIGINS is required")
  .transform((raw) =>
    raw
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0)
      .map((origin) => origin.replace(/\/+$/, "")),
  )
  .refine(
    (origins) => origins.length > 0,
    "CORS_ORIGINS must contain at least one origin",
  )
  .refine(
    (origins) => !origins.includes("*"),
    'CORS_ORIGINS must not contain "*" — use an explicit origin allowlist',
  )
  .refine(
    (origins) =>
      origins.every(
        (origin) =>
          origin.startsWith("http://") || origin.startsWith("https://"),
      ),
    "every CORS origin must start with http:// or https://",
  );

export const envSchema = z.object({
  // ── Application ────────────────────────────────────────────────────────────
  NODE_ENV: z.enum(["test", "development", "production"]).default("development"),
  PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65_535)
    .default(4000),

  // ── Database ───────────────────────────────────────────────────────────────
  DATABASE_URL: z
    .string()
    .trim()
    .min(1, "DATABASE_URL is required")
    .refine(
      (url) => url.startsWith("postgresql://") || url.startsWith("postgres://"),
      "DATABASE_URL must be a PostgreSQL connection string (postgresql://…)",
    ),

  // ── CORS ───────────────────────────────────────────────────────────────────
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000")
    .pipe(corsOriginsSchema),

  // ── Logging ────────────────────────────────────────────────────────────────
  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),

  // ── Security / requests ────────────────────────────────────────────────────
  // Default must always clear the largest domain upload cap (base64 data-URL
  // inflation ≈ 4/3 + JSON envelope) — superRefine below enforces the
  // invariant for explicit values, so an oversized screenshot reaches the
  // domain validator (422) instead of dying as a generic body-limit 413.
  BODY_LIMIT_BYTES: z.coerce.number().int().min(1024).max(16_777_216).default(9_437_184),
  TRUST_PROXY: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),

  // ── Rate limiting (global defaults) ────────────────────────────────────────
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).max(3_600).default(60),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100_000).default(120),

  // ── External services (optional — Foundation wires nothing) ────────────────
  MARKET_SERVICE_URL: z
    .string()
    .trim()
    .url("MARKET_SERVICE_URL must be a valid URL when provided")
    .optional()
    .or(z.literal("").transform(() => undefined)),

  // ── Accounts / Trading Connectivity (Phase 3) ──────────────────────────────
  /** AES-256-GCM key (base64, 32 bytes) encrypting trading credentials at rest (§22). */
  ACCOUNTS_CREDENTIALS_ENCRYPTION_KEY: z
    .string()
    .trim()
    .refine(
      (value) => {
        try {
          return Buffer.from(value, "base64").length === 32;
        } catch {
          return false;
        }
      },
      "ACCOUNTS_CREDENTIALS_ENCRYPTION_KEY must be base64 encoding exactly 32 bytes",
    ),
  /** Per-call timeout for trading provider adapter calls. */
  ACCOUNTS_PROVIDER_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(10_000),
  /**
   * Mock trading provider gate (§57 — production must never silently serve
   * mock data). Defaults to enabled in non-production, disabled in production;
   * an explicit value always wins.
   */
  ACCOUNTS_MOCK_PROVIDER: z.enum(["enabled", "disabled"]).optional(),
  /**
   * OANDA v20 REST adapter gate (Phase 03). A real adapter is NEVER enabled
   * by default — explicit opt-in per deployment (§57 policy applied to real
   * providers: enabled ⇒ the registry exposes oanda-v20 and connect calls
   * the real OANDA hosts with the user's stored token).
   */
  ACCOUNTS_OANDA_PROVIDER: z.enum(["enabled", "disabled"]).optional(),
  /**
   * OANDA REST base-URL override (tests/fixture server, region edge).
   * When unset the adapter routes by account environment:
   * DEMO → https://api-fxpractice.oanda.com, LIVE → https://api-fxtrade.oanda.com.
   * Never committed with credentials; the token itself stays in the vault.
   */
  ACCOUNTS_OANDA_REST_URL: z
    .string()
    .trim()
    .url("ACCOUNTS_OANDA_REST_URL must be a valid URL when provided")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  /**
   * Deriv WebSocket API adapter gate (Phase 07 — second real provider). Same
   * §57 policy as every real adapter: NEVER enabled by default — explicit
   * opt-in per deployment. Enabled ⇒ the registry exposes deriv-ws and
   * connect calls the official Deriv WS endpoint with the user's stored
   * read-scope API token.
   */
  ACCOUNTS_DERIV_PROVIDER: z.enum(["enabled", "disabled"]).optional(),
  /**
   * Deriv WebSocket endpoint override (tests/fixture server). When unset the
   * adapter uses the official documented endpoint (wss://ws.derivws.com/
   * websockets/v3?app_id=…). Never committed with credentials; the token
   * itself stays in the vault.
   */
  ACCOUNTS_DERIV_WS_URL: z
    .string()
    .trim()
    .url("ACCOUNTS_DERIV_WS_URL must be a valid URL when provided")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  /**
   * Deriv application id (developers.deriv.com dashboard registration —
   * official docs require every API call to carry the registering app's id).
   * Defaults to Deriv's public example app id 1089, which is suitable for
   * development/verification only; production deployments MUST register
   * their own application and set this variable (Phase 07 report §7).
   */
  ACCOUNTS_DERIV_APP_ID: z.string().trim().min(1).max(32).optional(),

  // ── Phase 08 — MT5 terminal bridge (PLATFORM_BRIDGE) ─────────────────────
  /**
   * MT5 terminal bridge gate (same §57 opt-in posture as every real
   * provider). When enabled, the bridge adapter registers and the accounts
   * surface accepts PLATFORM_BRIDGE pairings: the ingest endpoint becomes
   * reachable and the adapter serves data from the server-persisted push
   * log. No outbound call ever happens — the terminal pushes to us.
   */
  ACCOUNTS_MT5_BRIDGE_PROVIDER: z.enum(["enabled", "disabled"]).optional(),

  // ── Phase 05 — scheduled synchronization, freshness, recovery ─────────────
  /**
   * Background sync scheduler gate (Phase 05 §9). Like every real-provider
   * automation it is NEVER on by default: explicit opt-in per deployment
   * (§57 posture). Disabled ⇒ no timer runs, no automatic provider calls;
   * manual/initial synchronization keep working exactly as before.
   */
  ACCOUNTS_SYNC_SCHEDULER: z.enum(["enabled", "disabled"]).optional(),
  /** Base interval between scheduler sweeps (±10% jitter per tick). */
  ACCOUNTS_SYNC_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(60_000, "ACCOUNTS_SYNC_INTERVAL_MS must be at least one minute")
    .max(86_400_000)
    .default(900_000),
  /** Max connections synchronized in parallel per sweep (bounded concurrency, §9.1). */
  ACCOUNTS_SYNC_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(3),
  /** A RUNNING run older than this cannot be alive (watchdog bounds every
   * segment) — the recovery sweep marks it CANCELLED (§15 safe restart). */
  ACCOUNTS_SYNC_STALE_RUN_MS: z.coerce
    .number()
    .int()
    .min(30_000)
    .max(3_600_000)
    .default(120_000),
  /** Bounded retries per segment for TRANSIENT provider failures (§15). */
  ACCOUNTS_SYNC_SEGMENT_RETRIES: z.coerce.number().int().min(0).max(5).default(2),

  // ── OCR / Screenshot Recognition (Phase 19) ───────────────────────────────
  /**
   * FastAPI OCR sidecar base URL (e.g. http://127.0.0.1:3004). When unset the
   * FastAPI engine adapter is not registered — the deterministic mock engine
   * (OCR_MOCK_ENGINE) is then the only option, so production with a disabled
   * mock degrades to an explicit OCR_UNAVAILABLE, never a fake result.
   */
  OCR_SERVICE_URL: z
    .string()
    .trim()
    .url("OCR_SERVICE_URL must be a valid URL when provided")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  /**
   * Shared secret the API presents to the sidecar (service-to-service, §27).
   * Required when OCR_SERVICE_URL is set; must be at least 32 characters.
   */
  OCR_SERVICE_TOKEN: z
    .string()
    .trim()
    .min(32, "OCR_SERVICE_TOKEN must be at least 32 characters")
    .optional(),
  /** Mock OCR engine gate (same policy as ACCOUNTS_MOCK_PROVIDER, §57). */
  OCR_MOCK_ENGINE: z.enum(["enabled", "disabled"]).optional(),
  /** Max decoded binary size accepted for one screenshot upload. */
  OCR_UPLOAD_MAX_BYTES: z.coerce.number().int().min(10_240).max(8_388_608).default(6_291_456),
  /** Max pixel count per image — decompression-bomb guard (§38). */
  OCR_IMAGE_MAX_PIXELS: z.coerce.number().int().min(65_536).max(80_000_000).default(24_000_000),
  /** Per-sidecar-call timeout for the recognition request (§26/§56). */
  OCR_ENGINE_TIMEOUT_MS: z.coerce.number().int().min(2_000).max(120_000).default(30_000),
  /**
   * Local filesystem storage root for screenshot binaries (§6). The directory
   * is created on demand; paths are validated to stay inside it.
   */
  OCR_STORAGE_ROOT: z.string().trim().min(1).default(".data/ocr-storage"),
  /** Bounded retry attempts for TRANSIENT engine failures (§34) — extra attempts on top of the first call. */
  OCR_ENGINE_MAX_RETRIES: z.coerce.number().int().min(0).max(3).default(1),
  /** Screenshot retention (engine quality §4.2): binaries of CONFIRMED/FAILED
   *  recognitions older than this are purged (0 disables retention). */
  OCR_RETENTION_DAYS: z.coerce.number().int().min(0).max(3650).default(30),
  /** Minimum delay between two lazy retention sweeps (recognition V1 sweep
   *  throttle) — a burst of requests must not fan out into a burst of sweeps. */
  OCR_RETENTION_SWEEP_MS: z.coerce.number().int().min(1_000).max(86_400_000).default(900_000),
  /** Max decoded binary size accepted for one PDF statement upload (V2 —
   *  documents share the screenshot discipline with their own budget). */
  OCR_PDF_MAX_BYTES: z.coerce.number().int().min(10_240).max(8_388_608).default(6_291_456),

  // ── Trading Core / Journal (Phase 4) ───────────────────────────────────────
  /** Local filesystem storage root for trade-screenshot binaries (§39) —
   * metadata-only rows in PostgreSQL; binaries live under this root. */
  TRADES_SCREENSHOTS_ROOT: z.string().trim().min(1).default(".data/trades-screenshots"),
  /** Max decoded binary size accepted for one trade screenshot (wire limit). */
  TRADES_SCREENSHOT_MAX_BYTES: z.coerce
    .number()
    .int()
    .min(10_240)
    .max(8_000_000)
    .default(6_291_456),

  // ── Calendar / Economic events (Phase 13) ─────────────────────────────────
  /** Past half of the canonical eco-event sync window (§23) — the Analytics
   *  correlation depth (the reference engine ships -92 days of history). */
  CALENDAR_WINDOW_PAST_DAYS: z.coerce.number().int().min(1).max(365).default(92),
  /** Future half of the canonical eco-event sync window (§23) — the planner
   *  banner / news-blocker horizon (the reference engine ships +13 days). */
  CALENDAR_WINDOW_FUTURE_DAYS: z.coerce.number().int().min(1).max(60).default(13),

  // ── Integrations Hub (Phase 14) ───────────────────────────────────────────
  /** AES-256-GCM key (base64, 32 bytes) encrypting webhook signing secrets
   *  at rest (§14). Deliberately its OWN key — never the accounts credentials
   *  key and never the identity MFA key (key separation). */
  INTEGRATIONS_WEBHOOK_ENCRYPTION_KEY: z
    .string()
    .trim()
    .refine(
      (value) => {
        try {
          return Buffer.from(value, "base64").length === 32;
        } catch {
          return false;
        }
      },
      "INTEGRATIONS_WEBHOOK_ENCRYPTION_KEY must be base64 encoding exactly 32 bytes",
    ),

  // ── Authentication (Identity phase — REQUIRED, never defaulted) ────────────
  /** HS256 signing secret for short-lived access JWTs. ≥ 32 chars. */
  AUTH_JWT_SECRET: z
    .string()
    .trim()
    .min(32, "AUTH_JWT_SECRET must be at least 32 characters")
    .max(256),
  /** AES-256-GCM key (base64, 32 bytes) encrypting TOTP secrets at rest. */
  AUTH_MFA_ENCRYPTION_KEY: z
    .string()
    .trim()
    .refine(
      (value) => {
        try {
          return Buffer.from(value, "base64").length === 32;
        } catch {
          return false;
        }
      },
      "AUTH_MFA_ENCRYPTION_KEY must be base64 encoding exactly 32 bytes",
    ),
  /** JWT issuer/audience pinning (security-audit 2026-10-19 §1.8): access
   *  tokens carry iss/aud and verification REJECTS any mismatch. Defaults
   *  keep zero-config parity; override only for multi-deploy secrets. */
  AUTH_JWT_ISSUER: z.string().trim().min(1).max(128).default("cosmoz-api"),
  AUTH_JWT_AUDIENCE: z.string().trim().min(1).max(128).default("cosmoz-web"),
  AUTH_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3_600).default(900),
  AUTH_REFRESH_REMEMBER_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  AUTH_REFRESH_SESSION_HOURS: z.coerce.number().int().min(1).max(24 * 7).default(12),
  AUTH_EMAIL_VERIFICATION_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  AUTH_PASSWORD_RESET_MINUTES: z.coerce.number().int().min(5).max(1_440).default(30),
  AUTH_MFA_CHALLENGE_MINUTES: z.coerce.number().int().min(1).max(30).default(5),
  AUTH_REAUTH_MINUTES: z.coerce.number().int().min(1).max(30).default(5),
  /** Public web origin — used to build email links (verify/reset). */
  WEB_APP_URL: z
    .string()
    .trim()
    .url("WEB_APP_URL must be a valid URL")
    .default("http://localhost:3000"),
  /** From-header for transactional emails. */
  EMAIL_FROM: z.string().trim().min(3).default("Euforia <no-reply@cosmoz.app>"),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Cross-field invariant (§27): the sidecar URL without a shared secret would
 * mean unauthenticated internal calls — refuse to boot in that state.
 */
const refinedEnvSchema = envSchema.superRefine((env, ctx) => {
  if (env.OCR_SERVICE_URL && !env.OCR_SERVICE_TOKEN) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["OCR_SERVICE_TOKEN"],
      message: "OCR_SERVICE_TOKEN is required when OCR_SERVICE_URL is set",
    });
  }
  // The body limit must clear every domain image cap (§85 coherence): the
  // wire carries base64 data URLs (≈ 4/3 of the decoded bytes) inside JSON.
  const largestUploadCap = Math.max(
    env.OCR_UPLOAD_MAX_BYTES,
    env.TRADES_SCREENSHOT_MAX_BYTES,
  );
  if (env.BODY_LIMIT_BYTES <= largestUploadCap + Math.floor(largestUploadCap / 3)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["BODY_LIMIT_BYTES"],
      message:
        "BODY_LIMIT_BYTES must exceed the largest image upload cap (OCR_UPLOAD_MAX_BYTES / TRADES_SCREENSHOT_MAX_BYTES) by the base64 inflation factor (×4/3)",
    });
  }
});

export class EnvValidationError extends Error {
  constructor(
    public readonly issues: ReadonlyArray<{ path: string; message: string }>,
  ) {
    super(
      `Invalid environment configuration: ${issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("; ")}`,
    );
    this.name = "EnvValidationError";
  }
}

/**
 * Validate raw environment input. Throws {@link EnvValidationError} carrying
 * only key paths and reasons — secret values never appear in the error.
 */
export function validateEnv(
  source: Record<string, string | undefined> = process.env,
): Env {
  const result = refinedEnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.join(".") || "(root)",
      message: issue.message,
    }));
    throw new EnvValidationError(issues);
  }
  return result.data;
}
