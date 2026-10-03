import type {
  ApiKeyCreateInput,
  ApiKeyView,
  ConnectedAccount,
  LoginRecord,
  PasswordChangeInput,
  ReauthInput,
  RecoveryRegenerateResponse,
  SecurityEvent,
  SecurityEventType,
  SecurityOverviewResponse,
  SecuritySession,
  SessionRevokeInput,
  SessionRevokeResponse,
  TwoFactorConfirmInput,
  TwoFactorEnrollment,
  TwoFactorState,
} from "@cosmoz/shared";
import { integrationEngine } from "@/mocks/integration-engine";

/**
 * Security engine — the account-protection domain (MASTER PROMPT §1–§21).
 *
 * Responsibilities:
 * - append-only security event log (§18): no method can edit or erase an
 *   event, only append;
 * - re-authentication for sensitive actions with a short-lived single-use
 *   token, and rate limiting with lockout on failures (§13, §14);
 * - one-time secret disclosure: API keys and recovery codes are returned
 *   exactly once, then only ever referenced by prefix/fingerprint (§8, §16);
 * - session lifecycle (revoke one / others / all) (§7, §12);
 * - connected accounts derived LIVE from the Integration engine — Security
 *   is a consumer of Integrations state, never a second copy of it (§9).
 *
 * The engine is transport-free: MSW handlers map the discriminated results
 * to HTTP statuses.
 */

// ── Results (same shape as the Integration engine) ──────────────────────────

type Ok<T> = { ok: true; value: T };
type Fail = {
  ok: false;
  status: number;
  code: string;
  message: string;
  retryAfterMs?: number;
};
type Result<T> = Ok<T> | Fail;

const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
const fail = (
  status: number,
  code: string,
  message: string,
  retryAfterMs?: number,
): Fail => ({ ok: false, status, code, message, retryAfterMs });

// ── Constants ────────────────────────────────────────────────────────────────

/** The mock account password — surfaced as a demo hint in the re-auth dialog. */
export const DEMO_PASSWORD = "cosmoz-demo-2026";

const REAUTH_TOKEN_TTL_MS = 5 * 60 * 1000;
const REAUTH_MAX_FAILURES = 5;
const REAUTH_WINDOW_MS = 15 * 60 * 1000;
const RECOVERY_CODE_COUNT = 10;
const PASSWORD_MIN_LENGTH = 10;
const PASSWORD_MAX_AGE_DAYS = 180;
const MAX_HEALTHY_SESSIONS = 5;
const EVENTS_RETENTION_DAYS = 365;
const LOGIN_RETENTION_DAYS = 180;
const MAX_EVENTS_RETURNED = 60;
const MAX_LOGINS_RETURNED = 15;

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
/** Inbox reminder threshold — 2FA off for more than a week is actionable. */
const TWO_FACTOR_REMINDER_AFTER_DAYS = 7;

const nowIso = (): string => new Date().toISOString();

/** Small synchronous fingerprint — stand-in for the server-side SHA-256. */
function fingerprint(secret: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < secret.length; i += 1) {
    const ch = secret.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex = (n: number): string => (n >>> 0).toString(16).padStart(8, "0");
  return `${hex(h1)}${hex(h2)}`.slice(0, 12);
}

function randomHex(length: number): string {
  let out = "";
  while (out.length < length) {
    out += Math.floor(Math.random() * 16).toString(16);
  }
  return out.slice(0, length);
}

function generateRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () =>
    `${randomHex(4)}-${randomHex(4)}`.toUpperCase(),
  );
}

const daysAgoIso = (days: number, hourOffset = 0): string =>
  new Date(Date.now() - days * DAY_MS - hourOffset * HOUR_MS).toISOString();

// ── Engine ───────────────────────────────────────────────────────────────────

class SecurityEngine {
  private password = DEMO_PASSWORD;

  private auth = {
    email: "trader@cosmoz.app",
    emailVerified: true,
    passwordLastChangedAt: daysAgoIso(34),
    passwordMinLength: PASSWORD_MIN_LENGTH,
  };

  private twoFactor: TwoFactorState = {
    enabled: false,
    pending: false,
    method: null,
    enabledAt: null,
    // Seeded 10 days back so the >7-day inbox reminder is live in the demo.
    disabledAt: daysAgoIso(10),
    lastVerifiedAt: null,
    recoveryCodesRemaining: 0,
  };

  /** Pending enrollment — the only place the demo TOTP code exists. */
  private pendingEnrollment: TwoFactorEnrollment | null = null;

  // ── Auth-engine integration surface (ADDITIVE — application auth reads
  // the two-factor/password domain from here; the Security center stays the
  // single owner of these secrets and state) ──
  /** Code currently accepted by the mocked authenticator while 2FA is on. */
  private activeDemoCode: string | null = null;
  /** Unused recovery codes — consumed at login when 2FA is unreachable. */
  private recoveryCodes: string[] = [];

  private sessions: SecuritySession[] = [
    {
      id: "ses-current",
      device: "This device",
      browser: "Current browser",
      os: "This operating system",
      ipMasked: "24.114.•••.••",
      location: "Toronto, CA (approximate)",
      lastActivityAt: new Date(Date.now() - 2 * MINUTE_MS).toISOString(),
      createdAt: new Date(Date.now() - 47 * MINUTE_MS).toISOString(),
      current: true,
    },
    {
      id: "ses-mbp",
      device: "MacBook Pro",
      browser: "Safari 18",
      os: "macOS 15",
      ipMasked: "24.114.•••.••",
      location: "Toronto, CA (approximate)",
      lastActivityAt: new Date(Date.now() - 19 * HOUR_MS).toISOString(),
      createdAt: daysAgoIso(6),
      current: false,
    },
    {
      id: "ses-iphone",
      device: "iPhone 14 — Cosmoz PWA",
      browser: "Cosmoz PWA",
      os: "iOS 18",
      ipMasked: "99.42.•••.••",
      location: "Toronto, CA (approximate)",
      lastActivityAt: new Date(Date.now() - 3 * DAY_MS - 2 * HOUR_MS).toISOString(),
      createdAt: daysAgoIso(21),
      current: false,
    },
  ];

  private apiKeys: ApiKeyView[] = [
    {
      id: "9f1d2c34-7a61-4c88-9b10-3e2f5a6b7c8d",
      name: "Journal export script",
      prefix: "cz_live_7f3a…",
      fingerprint: "5b8e21c04aad",
      scopes: ["read:trades", "read:analytics"],
      createdAt: daysAgoIso(12),
      lastUsedAt: new Date(Date.now() - 2 * HOUR_MS).toISOString(),
      expiresAt: daysAgoIso(-18),
      revoked: false,
    },
  ];

  private events: SecurityEvent[] = [];
  private logins: LoginRecord[] = [];
  private reauthTokens = new Map<string, number>();
  private reauthFailures: number[] = [];
  private eventSeq = 0;

  constructor() {
    this.seedHistory();
  }

  // ── Seeded history (consistent with the initial account state) ────────────

  private seedHistory(): void {
    const pushEvent = (
      type: SecurityEventType,
      daysBack: number,
      hourBack: number,
      actor: string,
      context: string,
      outcome: "SUCCESS" | "FAILURE" = "SUCCESS",
    ) => {
      this.eventSeq += 1;
      this.events.push({
        id: `00000000-0000-4000-8000-${String(100000 + this.eventSeq).padStart(12, "0")}`,
        at: daysAgoIso(daysBack, hourBack),
        type,
        actor,
        context,
        outcome,
      });
    };

    pushEvent("EMAIL_VERIFIED", 62, 4, "trader@cosmoz.app", "Email address verified via confirmation link.");
    pushEvent("INTEGRATION_CONNECTED", 30, 6, "trader@cosmoz.app", "Deriv connected with read-only scope (account data + market data).");
    pushEvent("LOGIN_SUCCESS", 21, 1, "iPhone 14 — Cosmoz PWA", "Sign-in from Toronto, CA (approximate).");
    pushEvent("PASSWORD_CHANGED", 34, 2, "trader@cosmoz.app", "Password changed from an authenticated session. Other sessions stayed signed in.");
    pushEvent("API_KEY_CREATED", 12, 5, "trader@cosmoz.app", "API key “Journal export script” created with scopes read:trades, read:analytics. Secret shown once.");
    pushEvent("LOGIN_SUCCESS", 7, 3, "MacBook Pro", "Sign-in from Toronto, CA (approximate).");
    pushEvent("LOGIN_FAILED", 1, 5, "Unknown device", "Failed sign-in — wrong password. Rate limit recorded the attempt.", "FAILURE");
    pushEvent("LOGIN_SUCCESS", 0, 0.8, "This device", "Sign-in from Toronto, CA (approximate).");
    pushEvent("SENSITIVE_SETTINGS_CHANGED", 5, 8, "trader@cosmoz.app", "Profile timezone updated — sensitive setting change confirmed by re-authentication.");

    const login = (
      daysBack: number,
      hourBack: number,
      success: boolean,
      device: string,
      browser: string,
      os: string,
      ip: string,
      location: string,
      reason: string | null = null,
    ) => {
      this.logins.push({
        id: `00000000-0000-4000-9000-${String(200000 + this.logins.length).padStart(12, "0")}`,
        at: daysAgoIso(daysBack, hourBack),
        success,
        device,
        browser,
        os,
        ipMasked: ip,
        location,
        reason,
      });
    };

    login(0, 0.8, true, "This device", "Current browser", "This OS", "24.114.•••.••", "Toronto, CA");
    login(1, 5, false, "Unknown device", "Chrome 130", "Windows 11", "203.0.•••.••", "Frankfurt, DE", "Wrong password — attempt rate-limited and logged.");
    login(6, 3, true, "MacBook Pro", "Safari 18", "macOS 15", "24.114.•••.••", "Toronto, CA");
    login(12, 9, true, "This device", "Current browser", "This OS", "24.114.•••.••", "Toronto, CA");
    login(13, 2, true, "iPhone 14 — Cosmoz PWA", "Cosmoz PWA", "iOS 18", "99.42.•••.••", "Toronto, CA");
    login(19, 4, true, "MacBook Pro", "Safari 18", "macOS 15", "24.114.•••.••", "Toronto, CA");
    login(26, 6, true, "iPhone 14 — Cosmoz PWA", "Cosmoz PWA", "iOS 18", "99.42.•••.••", "Toronto, CA");
  }

  // ── Event log (§18 — append-only) ─────────────────────────────────────────

  private logEvent(
    type: SecurityEventType,
    actor: string,
    context: string,
    outcome: "SUCCESS" | "FAILURE" = "SUCCESS",
  ): void {
    this.eventSeq += 1;
    this.events.push({
      id: `00000000-0000-4000-8000-${String(100000 + this.eventSeq).padStart(12, "0")}`,
      at: nowIso(),
      type,
      actor,
      context,
      outcome,
    });
  }

  // ── Aggregate (§4, §5, §9, §10, §11, §12, §19) ────────────────────────────

  overview(): SecurityOverviewResponse {
    const nowMs = Date.now();

    const connectedAccounts: ConnectedAccount[] = integrationEngine
      .overview()
      .providers.map((provider) => ({
        providerId: provider.id,
        providerName: provider.name,
        kind: provider.kind,
        status: provider.status,
        identifier: provider.connectedAt
          ? `paired · ${provider.id}`
          : "not paired",
        permissions: provider.capabilities,
        lastSyncAt: provider.sync.lastSuccessAt,
        credentialHint: provider.credentials?.maskedHint ?? "— none stored —",
      }));

    const failed24h = this.events.filter(
      (event) =>
        event.type === "LOGIN_FAILED" &&
        nowMs - new Date(event.at).getTime() <= DAY_MS,
    ).length;

    const activeSessions = this.sessions.length;
    const activeKeys = this.apiKeys.filter((key) => !key.revoked);
    const passwordAgeDays = Math.floor(
      (nowMs - new Date(this.auth.passwordLastChangedAt).getTime()) / DAY_MS,
    );

    const protection: SecurityOverviewResponse["protection"] = [
      {
        id: "two-factor",
        label: "Two-factor authentication",
        detail: this.twoFactor.enabled
          ? `On — authenticator app, verified ${this.twoFactor.lastVerifiedAt === null ? "recently" : this.twoFactor.lastVerifiedAt.slice(0, 10)}.`
          : "Off — a second factor is not required yet.",
        pass: this.twoFactor.enabled,
        methodology: "Passes once the authenticator challenge has been confirmed after enrollment.",
      },
      {
        id: "recovery-codes",
        label: "Recovery codes available",
        detail: this.twoFactor.enabled
          ? `${this.twoFactor.recoveryCodesRemaining} of ${RECOVERY_CODE_COUNT} unused.`
          : "Unavailable while 2FA is off.",
        pass: this.twoFactor.enabled && this.twoFactor.recoveryCodesRemaining >= 6,
        methodology: "Passes while 2FA is on and at least 6 of 10 codes remain unused.",
      },
      {
        id: "email-verified",
        label: "Email verified",
        detail: this.auth.emailVerified
          ? `${this.auth.email} is confirmed.`
          : "The address has not been confirmed.",
        pass: this.auth.emailVerified,
        methodology: "Passes after the confirmation link has been used.",
      },
      {
        id: "password-freshness",
        label: "Password freshness",
        detail: `Changed ${passwordAgeDays} day(s) ago — rotation recommended every ${PASSWORD_MAX_AGE_DAYS}.`,
        pass: passwordAgeDays <= PASSWORD_MAX_AGE_DAYS,
        methodology: `Passes while the password is younger than ${PASSWORD_MAX_AGE_DAYS} days.`,
      },
      {
        id: "api-key-hygiene",
        label: "API key hygiene",
        detail: activeKeys.length === 0
          ? "No active API keys."
          : `${activeKeys.length} active key(s), all scoped${activeKeys.every((key) => key.expiresAt !== null) ? " and expiring" : " — some never expire"}.`,
        pass: activeKeys.every((key) => key.expiresAt !== null),
        methodology: "Passes while every active key carries an expiration date.",
      },
      {
        id: "session-hygiene",
        label: "Session count",
        detail: `${activeSessions} active session(s).`,
        pass: activeSessions <= MAX_HEALTHY_SESSIONS,
        methodology: `Passes while at most ${MAX_HEALTHY_SESSIONS} sessions are active.`,
      },
      {
        id: "failed-signins",
        label: "Failed sign-ins (24 h)",
        detail: failed24h === 0
          ? "None recorded in the last 24 hours."
          : `${failed24h} failed attempt(s) — monitored by the rate limiter.`,
        pass: failed24h <= 2,
        methodology: "Passes while failed sign-ins stay at or below 2 per 24 h.",
      },
    ];

    return {
      auth: { ...this.auth },
      twoFactor: { ...this.twoFactor },
      sessions: [...this.sessions],
      apiKeys: this.apiKeys.map((view) => ({ ...view })),
      connectedAccounts,
      events: [...this.events]
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, MAX_EVENTS_RETURNED),
      logins: [...this.logins]
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, MAX_LOGINS_RETURNED),
      protection,
      rateLimits: [
        {
          scope: "Sign-in",
          limit: 5,
          windowLabel: "15 min",
          detail: "Failed attempts are counted per account + device; excess attempts are refused.",
        },
        {
          scope: "Re-authentication",
          limit: REAUTH_MAX_FAILURES,
          windowLabel: "15 min",
          detail: "Sensitive actions lock re-authentication temporarily after repeated wrong passwords.",
        },
        {
          scope: "Password reset",
          limit: 3,
          windowLabel: "hour",
          detail: "Reset emails are throttled per address.",
        },
        {
          scope: "API endpoints",
          limit: 60,
          windowLabel: "min / key",
          detail: "Per-key throttle; exceeded keys receive 429 with Retry-After.",
        },
      ],
      retention: {
        securityEventsDays: EVENTS_RETENTION_DAYS,
        loginHistoryDays: LOGIN_RETENTION_DAYS,
      },
      securityScore: this.securityScore(protection),
    };
  }

  /** Checklist score derived from the SAME hard facts (module upgrade). */
  private securityScore(protection: SecurityOverviewResponse["protection"]): SecurityOverviewResponse["securityScore"] {
    const total = protection.length;
    const passed = protection.filter((check) => check.pass).length;
    const score = total === 0 ? 0 : Math.round((passed / total) * 100);
    const rating = score >= 85 ? "STRONG" : score >= 60 ? "FAIR" : "WEAK";
    return { score, passed, total, rating };
  }

  /**
   * 2FA-off reminder state (module upgrade): while 2FA stays disabled for
   * more than 7 days, the inbox pushes a proactive reminder — dismissed with
   * the alert, re-raised only after the state changes (engine-owned truth).
   */
  twoFactorReminder(): { active: boolean; days: number; message: string } {
    if (this.twoFactor.enabled || this.twoFactor.disabledAt === null) {
      return { active: false, days: 0, message: "" };
    }
    const days = Math.floor((Date.now() - new Date(this.twoFactor.disabledAt).getTime()) / DAY_MS);
    if (days <= TWO_FACTOR_REMINDER_AFTER_DAYS) {
      return { active: false, days, message: "" };
    }
    return {
      active: true,
      days,
      message: `Two-factor authentication has been OFF for ${days} days. An authenticator app adds a second barrier in front of your journal — enable it from Security → Two-factor.`,
    };
  }

  // ── Re-authentication (§13, §14) ──────────────────────────────────────────

  reauth(
    input: ReauthInput,
  ): Result<{ token: string; expiresAt: string }> {
    const nowMs = Date.now();

    // Window cleanup — failures older than the window stop counting.
    this.reauthFailures = this.reauthFailures.filter(
      (at) => nowMs - at < REAUTH_WINDOW_MS,
    );

    if (this.reauthFailures.length >= REAUTH_MAX_FAILURES) {
      const retryAfterMs =
        REAUTH_WINDOW_MS - (nowMs - this.reauthFailures[0]);
      this.logEvent(
        "REAUTH_FAILED",
        "This device",
        "Re-authentication refused — too many recent failures (rate limited).",
        "FAILURE",
      );
      return fail(
        429,
        "RATE_LIMITED",
        `Too many attempts — re-authentication is locked for about ${Math.ceil(retryAfterMs / MINUTE_MS)} min.`,
        retryAfterMs,
      );
    }

    if (input.password !== this.password) {
      this.reauthFailures.push(nowMs);
      this.logEvent(
        "REAUTH_FAILED",
        "This device",
        `Re-authentication failed — wrong password (attempt ${this.reauthFailures.length} of ${REAUTH_MAX_FAILURES}).`,
        "FAILURE",
      );
      return fail(
        401,
        "INVALID_CREDENTIALS",
        `Wrong password — ${REAUTH_MAX_FAILURES - this.reauthFailures.length} attempt(s) left before a temporary lock.`,
      );
    }

    this.reauthFailures = [];
    const token = `reauth_${randomHex(24)}`;
    const expiresAt = new Date(nowMs + REAUTH_TOKEN_TTL_MS).toISOString();
    this.reauthTokens.set(token, nowMs + REAUTH_TOKEN_TTL_MS);
    this.logEvent("REAUTH_OK", "This device", "Identity re-confirmed for a sensitive action.");
    return ok({ token, expiresAt });
  }

  /** Validates and CONSUMES a re-auth token (single use). */
  private consumeToken(
    token: string,
  ): Result<{ action: string }> {
    const expiresAt = this.reauthTokens.get(token);
    if (expiresAt === undefined) {
      return fail(401, "INVALID_REAUTH_TOKEN", "Re-authentication required — confirm your password first.");
    }
    this.reauthTokens.delete(token);
    if (Date.now() > expiresAt) {
      return fail(401, "REAUTH_TOKEN_EXPIRED", "Re-authentication expired — confirm your password again.");
    }
    return ok({ action: token });
  }

  // ── Password (§5, §13) ────────────────────────────────────────────────────

  changePassword(input: PasswordChangeInput): Result<{ changedAt: string }> {
    const guard = this.consumeToken(input.reauthToken);
    if (!guard.ok) return guard;

    if (input.newPassword.length < PASSWORD_MIN_LENGTH) {
      return fail(
        422,
        "WEAK_PASSWORD",
        `Use at least ${PASSWORD_MIN_LENGTH} characters for the new password.`,
      );
    }
    if (input.newPassword === this.password) {
      return fail(422, "PASSWORD_UNCHANGED", "The new password must differ from the current one.");
    }

    this.password = input.newPassword;
    this.auth.passwordLastChangedAt = nowIso();
    this.logEvent(
      "PASSWORD_CHANGED",
      "This device",
      "Password changed after re-authentication. Journal data untouched.",
    );
    return ok({ changedAt: this.auth.passwordLastChangedAt });
  }

  // ── Two-factor (§6) ───────────────────────────────────────────────────────

  enableTwoFactor(token: string): Result<TwoFactorEnrollment> {
    const guard = this.consumeToken(token);
    if (!guard.ok) return guard;

    // Fresh enrollment each time the flow (re)starts — old pending codes die.
    const enrollment: TwoFactorEnrollment = {
      secret: `COSM-${randomHex(4).toUpperCase()}-${randomHex(4).toUpperCase()}-${randomHex(4).toUpperCase()}`,
      demoCode: String(100000 + Math.floor(Math.random() * 900000)),
      recoveryCodes: generateRecoveryCodes(),
    };
    this.pendingEnrollment = enrollment;
    // demoCode became optional in the shared schema (Phase 2) — coerce to the
    // mock's internal `string | null` representation.
    this.activeDemoCode = enrollment.demoCode ?? null;
    this.recoveryCodes = [...enrollment.recoveryCodes];
    this.twoFactor = {
      ...this.twoFactor,
      pending: true,
      method: "AUTHENTICATOR_APP",
    };
    return ok(enrollment);
  }

  confirmTwoFactor(input: TwoFactorConfirmInput): Result<TwoFactorState> {
    if (!this.twoFactor.pending || this.pendingEnrollment === null) {
      return fail(409, "NO_PENDING_ENROLLMENT", "Start the two-factor setup first.");
    }
    if (input.code !== this.pendingEnrollment.demoCode) {
      this.logEvent(
        "TFA_CHALLENGE_FAILED",
        "This device",
        "Authenticator challenge failed — code rejected.",
        "FAILURE",
      );
      return fail(422, "INVALID_CODE", "That code does not match — check your authenticator and try again.");
    }

    this.pendingEnrollment = null;
    this.twoFactor = {
      enabled: true,
      pending: false,
      method: "AUTHENTICATOR_APP",
      enabledAt: nowIso(),
      disabledAt: null,
      lastVerifiedAt: nowIso(),
      recoveryCodesRemaining: RECOVERY_CODE_COUNT,
    };
    this.logEvent(
      "TFA_ENABLED",
      "This device",
      "Two-factor authentication enabled (authenticator app). Recovery codes generated once.",
    );
    return ok({ ...this.twoFactor });
  }

  disableTwoFactor(token: string): Result<TwoFactorState> {
    const guard = this.consumeToken(token);
    if (!guard.ok) return guard;

    if (!this.twoFactor.enabled) {
      return fail(409, "TFA_ALREADY_OFF", "Two-factor authentication is already off.");
    }
    this.pendingEnrollment = null;
    this.activeDemoCode = null;
    this.recoveryCodes = [];
    this.twoFactor = {
      enabled: false,
      pending: false,
      method: null,
      enabledAt: null,
      disabledAt: nowIso(),
      lastVerifiedAt: null,
      recoveryCodesRemaining: 0,
    };
    this.logEvent(
      "TFA_DISABLED",
      "This device",
      "Two-factor authentication disabled after re-authentication. Recovery codes destroyed.",
    );
    return ok({ ...this.twoFactor });
  }

  regenerateRecoveryCodes(token: string): Result<RecoveryRegenerateResponse> {
    const guard = this.consumeToken(token);
    if (!guard.ok) return guard;

    if (!this.twoFactor.enabled) {
      return fail(409, "TFA_OFF", "Enable two-factor authentication first.");
    }
    const recoveryCodes = generateRecoveryCodes();
    this.recoveryCodes = [...recoveryCodes];
    this.twoFactor = { ...this.twoFactor, recoveryCodesRemaining: RECOVERY_CODE_COUNT };
    this.logEvent(
      "RECOVERY_CODES_REGENERATED",
      "This device",
      "New recovery codes generated — previous set invalidated.",
    );
    return ok({ recoveryCodes });
  }

  // ── API keys (§8, §16) ────────────────────────────────────────────────────

  createApiKey(input: ApiKeyCreateInput): Result<{ key: ApiKeyView; secret: string }> {
    const guard = this.consumeToken(input.reauthToken);
    if (!guard.ok) return guard;

    const secret = `cz_live_${randomHex(32)}`;
    const key: ApiKeyView = {
      id: `00000000-0000-4000-a000-${String(300000 + this.apiKeys.length).padStart(12, "0")}`,
      name: input.name.trim(),
      prefix: `${secret.slice(0, 12)}…`,
      fingerprint: fingerprint(secret),
      scopes: input.scopes,
      createdAt: nowIso(),
      lastUsedAt: null,
      expiresAt:
        input.expiresInDays === null
          ? null
          : new Date(Date.now() + input.expiresInDays * DAY_MS).toISOString(),
      revoked: false,
    };
    this.apiKeys.push(key);
    this.logEvent(
      "API_KEY_CREATED",
      "This device",
      `API key “${key.name}” created with scopes ${key.scopes.join(", ")}. Secret shown once.`,
    );

    const view: ApiKeyView = { ...key };
    return ok({ key: view, secret });
  }

  revokeApiKey(token: string, keyId: string): Result<{ id: string }> {
    const guard = this.consumeToken(token);
    if (!guard.ok) return guard;

    const key = this.apiKeys.find((entry) => entry.id === keyId);
    if (key === undefined) {
      return fail(404, "KEY_NOT_FOUND", "This API key does not exist.");
    }
    if (key.revoked) {
      return fail(409, "KEY_ALREADY_REVOKED", "This API key is already revoked.");
    }
    key.revoked = true;
    this.logEvent(
      "API_KEY_REVOKED",
      "This device",
      `API key “${key.name}” (${key.prefix}) revoked. Clients using it lose access immediately.`,
    );
    return ok({ id: key.id });
  }

  // ── Sessions (§7, §12) ────────────────────────────────────────────────────

  revokeSessions(input: SessionRevokeInput): Result<SessionRevokeResponse> {
    const before = this.sessions.length;
    let currentAffected = false;

    if (input.scope === "one") {
      if (input.sessionId === null) {
        return fail(400, "MISSING_SESSION", "Provide the session to revoke.");
      }
      const target = this.sessions.find((session) => session.id === input.sessionId);
      if (target === undefined) {
        return fail(404, "SESSION_NOT_FOUND", "This session no longer exists.");
      }
      currentAffected = target.current;
      this.sessions = this.sessions.filter((session) => session.id !== input.sessionId);
    } else if (input.scope === "others") {
      currentAffected = false;
      this.sessions = this.sessions.filter((session) => session.current);
    } else {
      currentAffected = this.sessions.some((session) => session.current);
      this.sessions = [];
    }

    const revokedCount = before - this.sessions.length;
    this.logEvent(
      "SESSION_REVOKED",
      "This device",
      input.scope === "one"
        ? "One session revoked — its device is signed out immediately."
        : input.scope === "others"
          ? `All other sessions revoked (${revokedCount}) — those devices are signed out.`
          : `All sessions revoked (${revokedCount}) — in production the current session ends too (demo keeps it).`,
    );
    return ok({ revokedCount, currentSessionAffected: currentAffected });
  }

  // ── Privacy surfaces (§19) ────────────────────────────────────────────────

  /** Declared retention — informational, enforced server-side in production. */
  retention(): SecurityOverviewResponse["retention"] {
    return {
      securityEventsDays: EVENTS_RETENTION_DAYS,
      loginHistoryDays: LOGIN_RETENTION_DAYS,
    };
  }

  // ── Application-auth integration surface (ADDITIVE, read/consume only) ─────
  // The auth engine (mocks/auth-engine.ts) verifies credentials and consumes
  // two-factor factors through these methods. The Security center remains the
  // single owner of the password, the TOTP state and the recovery codes.

  /** Verify the account password for application sign-in. */
  verifyAccountPassword(password: string): boolean {
    return this.password === password;
  }

  /** Apply a password-reset link result (demo account keeps both in sync). */
  applyPasswordReset(newPassword: string): void {
    this.password = newPassword;
    this.auth.passwordLastChangedAt = nowIso();
  }

  isTwoFactorEnabled(): boolean {
    return this.twoFactor.enabled;
  }

  /** Verify a 6-digit authenticator code (mock authenticator contract). */
  verifyTotpCode(code: string): boolean {
    const expected =
      this.pendingEnrollment?.demoCode ?? this.activeDemoCode;
    return expected !== null && code === expected;
  }

  /** Mock authenticator stand-in for the login challenge (demoCode precedent). */
  currentDemoCode(): string | null {
    return this.activeDemoCode;
  }

  /** Consume a recovery code at login — one-time use, decrements the counter. */
  consumeRecoveryCode(code: string): boolean {
    const index = this.recoveryCodes.indexOf(code);
    if (index === -1) return false;
    this.recoveryCodes.splice(index, 1);
    this.twoFactor = {
      ...this.twoFactor,
      recoveryCodesRemaining: Math.max(0, this.twoFactor.recoveryCodesRemaining - 1),
    };
    return true;
  }

  /** Append an application-auth event to the append-only security log (§18). */
  recordAuthEvent(
    type: SecurityEventType,
    actor: string,
    context: string,
    outcome: "SUCCESS" | "FAILURE" = "SUCCESS",
  ): void {
    this.logEvent(type, actor, context, outcome);
  }

  /** Append a login-history row (§11 — backend-provided metadata only). */
  recordLogin(record: {
    success: boolean;
    reason: string | null;
    device: string;
    browser: string;
    os: string;
    ipMasked: string;
    location: string;
  }): void {
    this.logins.push({
      id: `00000000-0000-4000-9000-${String(200000 + this.logins.length).padStart(12, "0")}`,
      at: nowIso(),
      success: record.success,
      device: record.device,
      browser: record.browser,
      os: record.os,
      ipMasked: record.ipMasked,
      location: record.location,
      reason: record.reason,
    });
  }
}

/** Singleton — the MSW layer mutates state through this instance only. */
export const securityEngine = new SecurityEngine();
