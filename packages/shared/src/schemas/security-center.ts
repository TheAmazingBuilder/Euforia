import { z } from "zod";

import { isoDateTimeSchema } from "./primitives";
import { loginOutcomeSchema } from "./security";

/**
 * Security Center contracts — the professional security surface: typed
 * audit events, API keys (secrets returned EXACTLY ONCE then only masked),
 * 2FA enrollment with one-time recovery codes, enriched sessions and login
 * history, and re-authentication for sensitive actions.
 *
 * Security rules baked into these schemas:
 * - plaintext API keys / recovery codes exist in exactly ONE response shape
 *   (the creation/setup response) and never again,
 * - stored state only ever exposes masked keys and recovery-code COUNTS,
 * - IP addresses are masked at the source (ipMasked),
 * - sensitive mutations carry a short-lived reauthToken issued by
 *   POST /security/reauth (§13 sensitive action protection),
 * - audit events are append-only: no mutation or delete endpoint exists.
 *
 * Demo honesty: the mock backend keeps no real credential; flows are
 * realistic in shape and every screen says so.
 */

// ── Sessions & devices (§7, §12) ────────────────────────────────────────────

export const securitySessionV2Schema = z.object({
  id: z.string().min(1),
  device: z.string().min(1),
  browser: z.string().min(1),
  os: z.string().min(1),
  location: z.string().min(1),
  /** Masked at the source — the full IP never reaches the client. */
  ipMasked: z.string().min(1),
  createdAt: isoDateTimeSchema,
  lastActiveAt: isoDateTimeSchema,
  /** The session making the request — it cannot revoke itself. */
  current: z.boolean(),
});
export type SecuritySessionV2 = z.infer<typeof securitySessionV2Schema>;

// ── Login history (§11) ─────────────────────────────────────────────────────

export const securityLoginV2Schema = z.object({
  id: z.string().min(1),
  at: isoDateTimeSchema,
  device: z.string().min(1),
  browser: z.string().min(1),
  os: z.string().min(1),
  location: z.string().min(1),
  ipMasked: z.string().min(1),
  outcome: loginOutcomeSchema,
  /** Failure reason only — success rows carry null. */
  reason: z.string().nullable(),
});
export type SecurityLoginV2 = z.infer<typeof securityLoginV2Schema>;

export const securityLoginHistoryResponseSchema = z.object({
  logins: z.array(securityLoginV2Schema),
});
export type SecurityLoginHistoryResponse = z.infer<typeof securityLoginHistoryResponseSchema>;

// ── API keys (§8) ───────────────────────────────────────────────────────────

export const apiKeyScopeSchema = z.enum([
  "read:journal",
  "write:journal",
  "read:analytics",
  "export:data",
  "read:market",
]);
export type ApiKeyScope = z.infer<typeof apiKeyScopeSchema>;

export const apiKeyStatusSchema = z.enum(["active", "revoked", "expired"]);
export type ApiKeyStatus = z.infer<typeof apiKeyStatusSchema>;

export const apiKeySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** The ONLY representation of the key the client ever sees post-creation. */
  maskedKey: z.string().min(1),
  scopes: z.array(apiKeyScopeSchema).min(1),
  status: apiKeyStatusSchema,
  createdAt: isoDateTimeSchema,
  lastUsedAt: isoDateTimeSchema.nullable(),
  expiresAt: isoDateTimeSchema.nullable(),
  revokedAt: isoDateTimeSchema.nullable(),
});
export type ApiKey = z.infer<typeof apiKeySchema>;

export const apiKeysResponseSchema = z.object({
  keys: z.array(apiKeySchema),
});
export type ApiKeysResponse = z.infer<typeof apiKeysResponseSchema>;

export const createApiKeyInputSchema = z.object({
  name: z.string().min(1).max(64),
  scopes: z.array(apiKeyScopeSchema).min(1),
  expiresInDays: z.number().int().min(1).max(365).nullable(),
  reauthToken: z.string().min(1),
});
export type CreateApiKeyInput = z.infer<typeof createApiKeyInputSchema>;

/** The plaintext key appears here and NOWHERE else — never again, ever. */
export const createApiKeyResponseSchema = z.object({
  key: apiKeySchema,
  plaintext: z.string().min(8),
});
export type CreateApiKeyResponse = z.infer<typeof createApiKeyResponseSchema>;

export const revokeApiKeyInputSchema = z.object({
  reauthToken: z.string().min(1),
});
export type RevokeApiKeyInput = z.infer<typeof revokeApiKeyInputSchema>;

export const revokeApiKeyResponseSchema = z.object({
  id: z.string().min(1),
  revoked: z.boolean(),
});
export type RevokeApiKeyResponse = z.infer<typeof revokeApiKeyResponseSchema>;

// ── Two-factor authentication (§6) ──────────────────────────────────────────

/**
 * Enrollment payload — secret, otpauth URI and recovery codes are shown
 * ONCE during setup. The backend stores only its own copy of the secret
 * and a recovery-code COUNT; the client cannot fetch them again.
 */
export const twoFactorSetupResponseSchema = z.object({
  secret: z.string().min(1),
  otpauthUrl: z.string().min(1),
  recoveryCodes: z.array(z.string().min(1)).length(8),
});
export type TwoFactorSetupResponse = z.infer<typeof twoFactorSetupResponseSchema>;

export const twoFactorConfirmInputSchema = z.object({
  code: z.string().length(6),
});
export type TwoFactorConfirmInput = z.infer<typeof twoFactorConfirmInputSchema>;

export const twoFactorConfirmResponseSchema = z.object({
  enabled: z.boolean(),
  enabledAt: isoDateTimeSchema.nullable(),
});
export type TwoFactorConfirmResponse = z.infer<typeof twoFactorConfirmResponseSchema>;

export const disableTwoFactorInputSchema = z.object({
  reauthToken: z.string().min(1),
});
export type DisableTwoFactorInput = z.infer<typeof disableTwoFactorInputSchema>;

/** Status read model — recovery codes appear ONLY as a remaining count. */
export const twoFactorStatusSchema = z.object({
  enabled: z.boolean(),
  enabledAt: isoDateTimeSchema.nullable(),
  recoveryCodesLeft: z.number().int().min(0).nullable(),
});
export type TwoFactorStatus = z.infer<typeof twoFactorStatusSchema>;

// ── Re-authentication for sensitive actions (§13) ───────────────────────────

export const reauthInputSchema = z.object({
  password: z.string().min(1),
});
export type ReauthInput = z.infer<typeof reauthInputSchema>;

export const reauthResponseSchema = z.object({
  token: z.string().min(1),
  /** Short-lived by contract — the UI re-prompts after this window. */
  expiresInMs: z.number().int().positive(),
});
export type ReauthResponse = z.infer<typeof reauthResponseSchema>;

// ── Audit events (§10, §18) ─────────────────────────────────────────────────

export const securityEventKindSchema = z.enum([
  "login",
  "logout",
  "login_failed",
  "password_changed",
  "password_reset_requested",
  "two_factor_enabled",
  "two_factor_disabled",
  "recovery_codes_generated",
  "api_key_created",
  "api_key_revoked",
  "integration_connected",
  "integration_disconnected",
  "session_revoked",
  "sensitive_settings_changed",
  "data_exported",
]);
export type SecurityEventKind = z.infer<typeof securityEventKindSchema>;

export const securityAuditEventSchema = z.object({
  id: z.string().min(1),
  at: isoDateTimeSchema,
  kind: securityEventKindSchema,
  /** Who/what performed it — user or device label. */
  actor: z.string().min(1),
  detail: z.string().nullable(),
  outcome: z.enum(["success", "failure"]),
});
export type SecurityAuditEvent = z.infer<typeof securityAuditEventSchema>;

export const securityAuditResponseSchema = z.object({
  events: z.array(securityAuditEventSchema),
});
export type SecurityAuditResponse = z.infer<typeof securityAuditResponseSchema>;

// ── Overview (§4) — checklist-based readiness, NO invented score ────────────

export const securityControlActionSchema = z.enum([
  "enable_2fa",
  "rotate_password",
  "review_sessions",
  "review_api_keys",
]);
export type SecurityControlAction = z.infer<typeof securityControlActionSchema>;

export const securityControlSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  /** How this control is evaluated — the methodology is the UI. */
  detail: z.string().min(1),
  done: z.boolean(),
  action: securityControlActionSchema.nullable(),
  href: z.string().nullable(),
});
export type SecurityControl = z.infer<typeof securityControlSchema>;

export const securityCenterOverviewSchema = z.object({
  email: z.string().min(1),
  controls: z.array(securityControlSchema).min(1),
  twoFactor: twoFactorStatusSchema,
  passwordLastChangedAt: isoDateTimeSchema,
  activeSessionCount: z.number().int().min(0),
  activeApiKeyCount: z.number().int().min(0),
  connectedAccountCount: z.number().int().min(0),
  recentEvents: z.array(securityAuditEventSchema).max(6),
  recentLogins: z.array(securityLoginV2Schema).max(6),
});
export type SecurityCenterOverview = z.infer<typeof securityCenterOverviewSchema>;

// ── Sensitive mutations ─────────────────────────────────────────────────────

export const changePasswordV2InputSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
  reauthToken: z.string().min(1),
});
export type ChangePasswordV2Input = z.infer<typeof changePasswordV2InputSchema>;

export const changePasswordV2ResponseSchema = z.object({
  passwordLastChangedAt: isoDateTimeSchema,
});
export type ChangePasswordV2Response = z.infer<typeof changePasswordV2ResponseSchema>;

export const logoutSessionsResponseSchema = z.object({
  revoked: z.number().int().min(0),
  /** True when the caller's own session was ended too (logout all). */
  currentEnded: z.boolean(),
});
export type LogoutSessionsResponse = z.infer<typeof logoutSessionsResponseSchema>;

export const logoutOthersInputSchema = z.object({
  reauthToken: z.string().min(1),
});
export type LogoutOthersInput = z.infer<typeof logoutOthersInputSchema>;
