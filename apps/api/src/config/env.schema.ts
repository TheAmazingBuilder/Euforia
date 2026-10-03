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
  BODY_LIMIT_BYTES: z.coerce.number().int().min(1024).max(16_777_216).default(1_048_576),
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
  EMAIL_FROM: z.string().trim().min(3).default("Cosmoz <no-reply@cosmoz.app>"),
});

export type Env = z.infer<typeof envSchema>;

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
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.join(".") || "(root)",
      message: issue.message,
    }));
    throw new EnvValidationError(issues);
  }
  return result.data;
}
