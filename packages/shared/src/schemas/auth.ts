import { z } from "zod";

import { isoDateTimeSchema, uuidSchema } from "./primitives";

/**
 * Application authentication contract (COSMOZ - FRONTEND AUTHENTICATION
 * SYSTEM spec §6, §7, §79, §80).
 *
 * Design rules:
 * - This is the CANONICAL auth contract shared between the Next.js frontend
 *   and the future NestJS backend. The MSW mock engine implements it exactly,
 *   so swapping the mock for NestJS requires zero frontend restructuring.
 * - Account status drives dedicated UI states (§7) - the frontend never
 *   invents administrative reasons the backend does not send.
 * - Tokens: short-lived JWT-style access token (returned in the body, held
 *   in memory only) + rotating refresh token delivered as an HttpOnly
 *   cookie - the response NEVER carries the refresh token (§9, §10, §11).
 * - Security strings are centralized for i18n on the frontend side; the
 *   wire contract itself stays English-canonical.
 */

// ── Account status (§7) ──────────────────────────────────────────────────────

export const accountStatusSchema = z.enum([
  "ACTIVE",
  "PENDING_VERIFICATION",
  "SUSPENDED",
  "DEACTIVATED",
]);
export type AccountStatus = z.infer<typeof accountStatusSchema>;

// ── User (§6) ────────────────────────────────────────────────────────────────

export const authRoleSchema = z.enum(["TRADER", "ADMIN"]);
export type AuthRole = z.infer<typeof authRoleSchema>;

export const authPermissionSchema = z.enum([
  "trades:read",
  "trades:create",
  "trades:grade",
  "analytics:read",
  "journal:write",
  "session_live:use",
  "playbook:write",
  "settings:manage",
  "security:manage",
]);
export type AuthPermission = z.infer<typeof authPermissionSchema>;

export const authUserSchema = z.object({
  id: uuidSchema,
  email: z.string().email(),
  name: z.string().min(1),
  status: accountStatusSchema,
  emailVerifiedAt: isoDateTimeSchema.nullable(),
  roles: z.array(authRoleSchema).min(1),
  permissions: z.array(authPermissionSchema),
  createdAt: isoDateTimeSchema,
});
export type AuthUser = z.infer<typeof authUserSchema>;

// ── Session metadata (§22, §23 - backend-provided only, no invented geo) ─────

export const authSessionSchema = z.object({
  id: z.string().min(1),
  device: z.string().min(1),
  browser: z.string().min(1),
  os: z.string().min(1),
  ipMasked: z.string().min(1),
  location: z.string().min(1),
  createdAt: isoDateTimeSchema,
  lastActivityAt: isoDateTimeSchema,
  current: z.boolean(),
});
export type AuthSession = z.infer<typeof authSessionSchema>;

// ── Shared password rule (aligned with the Security center contract) ─────────

export const authPasswordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(128, "Use at most 128 characters");
export type AuthPassword = z.infer<typeof authPasswordSchema>;

// ── Registration (§15) ───────────────────────────────────────────────────────

export const registerInputSchema = z.object({
  name: z.string().min(2, "Enter your name").max(80),
  email: z.string().email("Enter a valid email address"),
  password: authPasswordSchema,
});
export type RegisterInput = z.infer<typeof registerInputSchema>;

// ── Login (§14, §25) ─────────────────────────────────────────────────────────

export const loginInputSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
  remember: z.boolean(),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

/**
 * Two success shapes, discriminated: direct authentication, or an MFA
 * challenge the UI must complete (§14, §25). `demoCode` is the mocked
 * authenticator stand-in (mock engine only).
 */
export const authSuccessSchema = z.object({
  user: authUserSchema,
  accessToken: z.string().min(10),
  accessTokenExpiresAt: isoDateTimeSchema,
  session: authSessionSchema,
});
export type AuthSuccess = z.infer<typeof authSuccessSchema>;

/**
 * Mock-delivery affordance: in the MSW environment no mail service exists,
 * so the one-time verification token rides along with an explicit
 * `delivery: "MOCKED"` marker (same precedent as the 2FA demoCode). A real
 * backend never returns `verificationToken`.
 */
export const registerResponseSchema = z.object({
  user: authUserSchema,
  status: accountStatusSchema,
  /**
   * Verification fields are only present on the PENDING_VERIFICATION path;
   * an ACTIVE auto-login response omits them and carries `session` instead.
   */
  verificationSentAt: isoDateTimeSchema.optional(),
  delivery: z.enum(["EMAIL", "MOCKED"]).optional(),
  verificationToken: z.string().min(10).optional(),
  verificationExpiresAt: isoDateTimeSchema.nullable().optional(),
  /**
   * Auto-login affordance: when registration lands on an ACTIVE account
   * (email verification not required), the backend returns the same
   * credentials a successful login would, so the client goes straight to
   * the dashboard instead of bouncing back to /login. Optional - pending
   * accounts omit it.
   */
  session: authSuccessSchema.optional(),
});
export type RegisterResponse = z.infer<typeof registerResponseSchema>;

export const mfaRequiredSchema = z.object({
  mfaRequired: z.literal(true),
  challengeToken: z.string().min(10),
  challengeExpiresAt: isoDateTimeSchema,
  method: z.enum(["AUTHENTICATOR_APP", "EMAIL"]),
  demoCode: z.string().regex(/^\d{6}$/).optional(),
});
export type MfaRequired = z.infer<typeof mfaRequiredSchema>;

export const loginResponseSchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("AUTHENTICATED") }).merge(authSuccessSchema),
  z.object({ outcome: z.literal("MFA_REQUIRED") }).merge(mfaRequiredSchema),
]);
export type LoginResponse = z.infer<typeof loginResponseSchema>;

// ── MFA challenge (§25) - TOTP code or recovery code ─────────────────────────

export const mfaChallengeInputSchema = z.object({
  challengeToken: z.string().min(10),
  code: z
    .string()
    .regex(/^\d{6}$/, "Enter the 6-digit code from your chosen method"),
});
export type MfaChallengeInput = z.infer<typeof mfaChallengeInputSchema>;

export const mfaRecoveryInputSchema = z.object({
  challengeToken: z.string().min(10),
  recoveryCode: z
    .string()
    .regex(/^[\dA-F]{4}-[\dA-F]{4}$/, "Recovery codes look like 4 characters, a dash, 4 characters"),
});
export type MfaRecoveryInput = z.infer<typeof mfaRecoveryInputSchema>;

// ── Refresh (§9, §10) - cookie-carried, never in the body ────────────────────

export const refreshResponseSchema = authSuccessSchema;
export type RefreshResponse = z.infer<typeof refreshResponseSchema>;

// ── Current user (§9 P0.9 - GET /auth/me) ────────────────────────────────────

export const authMeResponseSchema = z.object({
  user: authUserSchema,
  session: authSessionSchema,
});
export type AuthMeResponse = z.infer<typeof authMeResponseSchema>;

// ── Email verification (§17, §36) ────────────────────────────────────────────

export const verifyEmailInputSchema = z.object({
  token: z.string().min(10),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailInputSchema>;

export const verifyEmailResponseSchema = z.object({
  user: authUserSchema,
  verifiedAt: isoDateTimeSchema,
});
export type VerifyEmailResponse = z.infer<typeof verifyEmailResponseSchema>;

export const resendVerificationResponseSchema = z.object({
  sent: z.literal(true),
  delivery: z.enum(["EMAIL", "MOCKED"]),
  verificationToken: z.string().min(10).optional(),
  verificationExpiresAt: isoDateTimeSchema.nullable(),
});
export type ResendVerificationResponse = z.infer<
  typeof resendVerificationResponseSchema
>;

// ── Password recovery (§18, §19) ─────────────────────────────────────────────

export const forgotPasswordInputSchema = z.object({
  email: z.string().email("Enter a valid email address"),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordInputSchema>;

/**
 * Generic anti-enumeration shape: always `sent: true` for well-formed
 * requests - whether or not the account exists is never revealed (§18).
 */
export const forgotPasswordResponseSchema = z.object({
  sent: z.literal(true),
  delivery: z.enum(["EMAIL", "MOCKED"]),
  resetToken: z.string().min(10).optional(),
  resetExpiresAt: isoDateTimeSchema.nullable(),
});
export type ForgotPasswordResponse = z.infer<
  typeof forgotPasswordResponseSchema
>;

export const resetPasswordInputSchema = z.object({
  token: z.string().min(10),
  password: authPasswordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordInputSchema>;

export const resetPasswordResponseSchema = z.object({
  resetAt: isoDateTimeSchema,
});
export type ResetPasswordResponse = z.infer<typeof resetPasswordResponseSchema>;

// ── Error payloads (§38 - normalized, non-sensitive) ─────────────────────────

export const authErrorCodeSchema = z.enum([
  "INVALID_CREDENTIALS",
  "EMAIL_NOT_VERIFIED",
  "ACCOUNT_SUSPENDED",
  "ACCOUNT_DEACTIVATED",
  "MFA_REQUIRED",
  "INVALID_MFA_CODE",
  "INVALID_CHALLENGE",
  "RATE_LIMITED",
  "INVALID_TOKEN",
  "EXPIRED_TOKEN",
  "TOKEN_ALREADY_USED",
  "EMAIL_ALREADY_USED",
  "VALIDATION_ERROR",
  "NETWORK_ERROR",
  "SERVER_ERROR",
]);
export type AuthErrorCode = z.infer<typeof authErrorCodeSchema>;
