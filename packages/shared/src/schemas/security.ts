import { z } from "zod";

import { integrationKindSchema, integrationPermissionSchema, integrationStatusSchema } from "./integration";
import { isoDateTimeSchema, uuidSchema } from "./primitives";

/**
 * Security & Account Protection module (MASTER PROMPT §1–§21).
 *
 * Design rules:
 * - Secrets NEVER appear in any response: API keys are stored as prefix +
 *   fingerprint, and the one-time secret is returned exactly once, at
 *   creation (§8, §16).
 * - Sensitive actions require a short-lived re-authentication token obtained
 *   with the account password; failed attempts are rate-limited (§13, §14).
 * - The security event log is APPEND-ONLY - no endpoint can edit or delete
 *   an event (§18).
 * - The protection checklist states hard facts with a defined methodology -
 *   no invented composite score (§4).
 * - Data minimization: IPs and locations are masked before they reach the
 *   client (§11, §19).
 */

// ── Event types (§10) ────────────────────────────────────────────────────────

/**
 * THE event catalog - one coherent security-event architecture (Phase 16 §38):
 * the backend emits exactly these values, the frontend labels exactly these.
 * The four TRADING_ACCOUNT_* values record connection-lifecycle facts emitted
 * by the Accounts context (Phase 3) through the same append-only log - sync
 * success stays in the sync-run records (signal density).
 */
export const securityEventTypeSchema = z.enum([
  "LOGIN_SUCCESS",
  "LOGIN_FAILED",
  "LOGOUT",
  "PASSWORD_CHANGED",
  "PASSWORD_RESET_REQUESTED",
  "EMAIL_VERIFIED",
  "TFA_ENABLED",
  "TFA_DISABLED",
  "TFA_CHALLENGE_FAILED",
  "RECOVERY_CODES_REGENERATED",
  "API_KEY_CREATED",
  "API_KEY_REVOKED",
  "INTEGRATION_CONNECTED",
  "INTEGRATION_DISCONNECTED",
  "SESSION_REVOKED",
  "SENSITIVE_SETTINGS_CHANGED",
  "REAUTH_OK",
  "REAUTH_FAILED",
  "ACCOUNT_DELETION_REQUESTED",
  "TRADING_ACCOUNT_CONNECTED",
  "TRADING_ACCOUNT_CONNECTION_FAILED",
  "TRADING_ACCOUNT_DISCONNECTED",
  "TRADING_ACCOUNT_SYNC_FAILED",
  // Phase 19 - OCR / screenshot recognition lifecycle facts emitted by the
  // OCR context through the same append-only log (Phase 19 §48). Only events
  // that actually fit the audit model exist: no PROCESSING_STARTED (the
  // request-scoped pipeline would double-log every upload).
  "OCR_UPLOAD",
  "OCR_PROCESSING_FAILED",
  "OCR_RESULT_CONFIRMED",
  "OCR_RESULT_DELETED",
  // Phase 21 - the sanctioned confirmation→Trade bridge (§77/§83). The import
  // runs through Trading Core's canonical creation path; the skip event keeps
  // honest evidence when the confirmed values could not resolve into a trade.
  "OCR_TRADE_IMPORTED",
  "OCR_TRADE_IMPORT_SKIPPED",
  // V2 §32 - explicit reprocess (a fresh recognition from the same asset).
  "OCR_REPROCESSED",
  // V2 §28 - screenshot collection lifecycle facts.
  "OCR_COLLECTION_CREATED",
  "OCR_COLLECTION_DELETED",
]);
export type SecurityEventType = z.infer<typeof securityEventTypeSchema>;

export const securityEventSchema = z.object({
  id: uuidSchema,
  at: isoDateTimeSchema,
  type: securityEventTypeSchema,
  /** Who performed it - the user, a session, or "system". */
  actor: z.string().min(1),
  /** Sanitized human context - never contains secret material (§16). */
  context: z.string().min(1),
  outcome: z.enum(["SUCCESS", "FAILURE"]),
});
export type SecurityEvent = z.infer<typeof securityEventSchema>;

// ── Rate-limit policy (§14 - declared, adaptive at the API layer) ────────────

export const rateLimitRuleSchema = z.object({
  scope: z.string().min(1),
  limit: z.number().int().positive(),
  windowLabel: z.string().min(1),
  detail: z.string().min(1),
});
export type RateLimitRule = z.infer<typeof rateLimitRuleSchema>;

// ── Sessions (§7) & devices (§12) ────────────────────────────────────────────

export const securitySessionSchema = z.object({
  id: z.string().min(1),
  device: z.string().min(1),
  browser: z.string().min(1),
  os: z.string().min(1),
  /** Masked IP - full addresses never leave the server (§11). */
  ipMasked: z.string().min(1),
  /** Approximate location only, where legally/technically appropriate. */
  location: z.string().min(1),
  lastActivityAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
  current: z.boolean(),
});
export type SecuritySession = z.infer<typeof securitySessionSchema>;

// ── Two-factor (§6) ──────────────────────────────────────────────────────────

export const twoFactorStateSchema = z.object({
  enabled: z.boolean(),
  /** True between enable() and confirm() - codes not active yet. */
  pending: z.boolean(),
  method: z.enum(["AUTHENTICATOR_APP", "EMAIL"]).nullable(),
  pendingMethod: z.enum(["AUTHENTICATOR_APP", "EMAIL"]).nullable().optional(),
  enabledAt: isoDateTimeSchema.nullable(),
  /** When 2FA was last turned OFF - fuels the >7-day inbox reminder. */
  disabledAt: isoDateTimeSchema.nullable(),
  lastVerifiedAt: isoDateTimeSchema.nullable(),
  recoveryCodesRemaining: z.number().int().nonnegative(),
});
export type TwoFactorState = z.infer<typeof twoFactorStateSchema>;

/**
 * One-time enrollment payload (§6). Returned exactly once by the enable
 * action - recovery codes are never displayed again afterwards.
 * `demoCode` is the MOCKED authenticator stand-in (no real authenticator
 * exists in the mock environment) - the real backend NEVER returns it
 * (it would expose the current TOTP), hence optional.
 */
export const twoFactorEnrollmentSchema = z.object({
  secret: z.string().min(1),
  demoCode: z.string().regex(/^\d{6}$/).optional(),
  recoveryCodes: z.array(z.string().regex(/^\d{4}-\d{4}$/)).length(10),
});
export type TwoFactorEnrollment = z.infer<typeof twoFactorEnrollmentSchema>;

// ── API keys (§8) ────────────────────────────────────────────────────────────

export const apiKeyScopeSchema = z.enum([
  "read:trades",
  "read:analytics",
  "write:journal",
  "read:calendar",
]);
export type ApiKeyScope = z.infer<typeof apiKeyScopeSchema>;

export const apiKeyViewSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1),
  /** Prefix only - the secret is discarded after the one-time reveal. */
  prefix: z.string().min(1),
  /** Short SHA-256 fingerprint so users can recognize the key later. */
  fingerprint: z.string().min(1),
  scopes: z.array(apiKeyScopeSchema).min(1),
  createdAt: isoDateTimeSchema,
  lastUsedAt: isoDateTimeSchema.nullable(),
  expiresAt: isoDateTimeSchema.nullable(),
  revoked: z.boolean(),
});
export type ApiKeyView = z.infer<typeof apiKeyViewSchema>;

/**
 * Creation response - the ONLY response that ever carries the plaintext
 * secret (§8: "Never store or display plaintext API secrets after creation").
 */
export const apiKeyCreatedSchema = z.object({
  key: apiKeyViewSchema,
  secret: z.string().min(1),
});
export type ApiKeyCreated = z.infer<typeof apiKeyCreatedSchema>;

// ── Connected accounts (§9 - Security's view over Integrations) ──────────────

export const connectedAccountSchema = z.object({
  providerId: z.string().min(1),
  providerName: z.string().min(1),
  kind: integrationKindSchema,
  status: integrationStatusSchema,
  /** Masked account identifier - never a password, key or token. */
  identifier: z.string().min(1),
  permissions: z.array(integrationPermissionSchema),
  lastSyncAt: isoDateTimeSchema.nullable(),
  /** What Security stores for this provider - masked vault hint or "none". */
  credentialHint: z.string().min(1),
});
export type ConnectedAccount = z.infer<typeof connectedAccountSchema>;

// ── Login history (§11) ──────────────────────────────────────────────────────

export const loginRecordSchema = z.object({
  id: uuidSchema,
  at: isoDateTimeSchema,
  success: z.boolean(),
  device: z.string().min(1),
  browser: z.string().min(1),
  os: z.string().min(1),
  ipMasked: z.string().min(1),
  location: z.string().min(1),
  /** Failure reason only - sanitized, no secret material. */
  reason: z.string().nullable(),
});
export type LoginRecord = z.infer<typeof loginRecordSchema>;

// ── Protection checklist (§4 - defined methodology, no fake score) ───────────

export const protectionCheckSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  detail: z.string().min(1),
  pass: z.boolean(),
  /** How this check is evaluated - the declared methodology. */
  methodology: z.string().min(1),
});
export type ProtectionCheck = z.infer<typeof protectionCheckSchema>;

// ── Aggregate response ───────────────────────────────────────────────────────

export const securityAuthStateSchema = z.object({
  email: z.string().min(3),
  emailVerified: z.boolean(),
  passwordLastChangedAt: isoDateTimeSchema,
  passwordMinLength: z.number().int().positive(),
});

export const securityRetentionSchema = z.object({
  securityEventsDays: z.number().int().positive(),
  loginHistoryDays: z.number().int().positive(),
});

export const securityScoreSchema = z.object({
  /** 0–100 - share of protection checks passing (real state, server-computed). */
  score: z.number().min(0).max(100),
  passed: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  rating: z.enum(["STRONG", "FAIR", "WEAK"]),
});
export type SecurityScore = z.infer<typeof securityScoreSchema>;

export const securityOverviewResponseSchema = z.object({
  auth: securityAuthStateSchema,
  twoFactor: twoFactorStateSchema,
  sessions: z.array(securitySessionSchema),
  apiKeys: z.array(apiKeyViewSchema),
  connectedAccounts: z.array(connectedAccountSchema),
  events: z.array(securityEventSchema),
  logins: z.array(loginRecordSchema),
  protection: z.array(protectionCheckSchema),
  /** Checklist score derived from the SAME checks - real state, not vibes. */
  securityScore: securityScoreSchema,
  rateLimits: z.array(rateLimitRuleSchema),
  retention: securityRetentionSchema,
});
export type SecurityOverviewResponse = z.infer<
  typeof securityOverviewResponseSchema
>;

// ── Re-authentication (§13) ──────────────────────────────────────────────────

export const reauthInputSchema = z.object({
  password: z.string().min(1),
});
export type ReauthInput = z.infer<typeof reauthInputSchema>;

export const reauthResponseSchema = z.object({
  /** Short-lived bearer for ONE sensitive action. Never persisted client-side. */
  token: z.string().min(1),
  expiresAt: isoDateTimeSchema,
});
export type ReauthResponse = z.infer<typeof reauthResponseSchema>;

/** Re-auth guard result used by every sensitive mutation. */
export const sensitiveActionInputSchema = z.object({
  reauthToken: z.string().min(1),
});
export type SensitiveActionInput = z.infer<typeof sensitiveActionInputSchema>;

// ── Sensitive actions ────────────────────────────────────────────────────────

export const passwordChangeInputSchema = sensitiveActionInputSchema.extend({
  newPassword: z.string().min(10, "Use at least 10 characters"),
});
export type PasswordChangeInput = z.infer<typeof passwordChangeInputSchema>;

export const twoFactorConfirmInputSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});
export type TwoFactorConfirmInput = z.infer<typeof twoFactorConfirmInputSchema>;

export const apiKeyCreateInputSchema = sensitiveActionInputSchema.extend({
  name: z.string().min(1).max(64),
  scopes: z.array(apiKeyScopeSchema).min(1),
  expiresInDays: z.number().int().positive().nullable(),
});
export type ApiKeyCreateInput = z.infer<typeof apiKeyCreateInputSchema>;

export const apiKeyRevokeInputSchema = sensitiveActionInputSchema;
export type ApiKeyRevokeInput = z.infer<typeof apiKeyRevokeInputSchema>;

export const sessionRevokeInputSchema = z.object({
  /** A specific session id, or a bulk scope. */
  sessionId: z.string().min(1).nullable(),
  scope: z.enum(["one", "others", "all"]),
});
export type SessionRevokeInput = z.infer<typeof sessionRevokeInputSchema>;

export const sessionRevokeResponseSchema = z.object({
  revokedCount: z.number().int().nonnegative(),
  /** Revoking the current session would end it in production. */
  currentSessionAffected: z.boolean(),
});
export type SessionRevokeResponse = z.infer<typeof sessionRevokeResponseSchema>;

export const recoveryRegenerateResponseSchema = z.object({
  recoveryCodes: z.array(z.string().regex(/^\d{4}-\d{4}$/)).length(10),
});
export type RecoveryRegenerateResponse = z.infer<
  typeof recoveryRegenerateResponseSchema
>;

// ── Paginated audit trail (Phase 16 §28/§29) ─────────────────────────────────

/**
 * Stable keyset pagination - the security event log grows indefinitely and
 * is NEVER returned unbounded. `cursor` is opaque to clients (base64url of
 * "<at ISO>|<id>"); the server orders by (at DESC, id DESC) and pages on
 * that compound key, so inserts never shift a page. Canonical shape here;
 * the API derives the coerced wire variant (query strings) from it.
 */
export const pageCursorSchema = z.string().min(1).max(256);

export const securityEventPageQuerySchema = z.object({
  limit: z.number().int().min(1).max(100).default(30),
  cursor: pageCursorSchema.optional(),
  type: securityEventTypeSchema.optional(),
  outcome: z.enum(["SUCCESS", "FAILURE"]).optional(),
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
});
export type SecurityEventPageQuery = z.infer<typeof securityEventPageQuerySchema>;

export const securityEventPageSchema = z.object({
  items: z.array(securityEventSchema),
  /** Null on the last page - the walk is complete. */
  nextCursor: pageCursorSchema.nullable(),
});
export type SecurityEventPage = z.infer<typeof securityEventPageSchema>;

export const loginRecordPageQuerySchema = z.object({
  limit: z.number().int().min(1).max(100).default(30),
  cursor: pageCursorSchema.optional(),
  success: z.boolean().optional(),
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
});
export type LoginRecordPageQuery = z.infer<typeof loginRecordPageQuerySchema>;

export const loginRecordPageSchema = z.object({
  items: z.array(loginRecordSchema),
  nextCursor: pageCursorSchema.nullable(),
});
export type LoginRecordPage = z.infer<typeof loginRecordPageSchema>;
