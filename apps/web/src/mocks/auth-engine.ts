import type {
  AuthMeResponse,
  AuthSession,
  AuthSuccess,
  AuthUser,
  ForgotPasswordResponse,
  LoginResponse,
  MfaRequired,
  RefreshResponse,
  RegisterResponse,
  ResendVerificationResponse,
  ResetPasswordResponse,
  VerifyEmailResponse,
} from "@cosmoz/shared";

import { DEMO_PASSWORD, securityEngine } from "./security-engine";

/**
 * Application authentication engine (mock backend for the auth contract in
 * `@cosmoz/shared/schemas/auth.ts`).
 *
 * Contract fidelity notes (spec §9–§11, §66, §79, §81):
 * - ACCESS TOKEN — short-lived (15 min), returned in the body, stored
 *   in-memory on the client ONLY. Never in a cookie, never persisted.
 * - REFRESH TOKEN — rotating, delivered as an `HttpOnly` cookie by the
 *   handlers. The engine never returns it in a body. In the mock environment
 *   MSW persists cookies via `document.cookie` (the HttpOnly flag is a no-op
 *   there — a real NestJS deployment owns the real cookie jar).
 * - ROTATION — every refresh invalidates the presented refresh token and
 *   issues the next generation; presenting a superseded token is treated as
 *   token reuse and revokes the user's sessions (spec test §68).
 * - The engine is intentionally STATELESS-ACROSS-RELOADS for the demo user
 *   (the refresh cookie is self-validating with a mock checksum) so the
 *   demo account survives full page reloads, while keeping strict
 *   within-session rotation semantics. Registered users live for the
 *   worker session only — consistent with the whole in-memory mock store.
 * - NO cryptographic authority lives here — this is a mock. JWT signing,
 *   Argon2id, TOTP secret generation belong to the NestJS backend (§81).
 */

// ── Internal types ───────────────────────────────────────────────────────────

type AuthUserRecord = {
  id: string;
  email: string;
  name: string;
  password: string;
  status: AuthUser["status"];
  emailVerifiedAt: string | null;
  createdAt: string;
  /** True for the seeded demo account (wired into the Security engine). */
  demo: boolean;
};

type AccessTokenRecord = { userId: string; expiresAt: number };

type RefreshPayload = {
  uid: string;
  gen: number;
  exp: number;
};

/**
 * Self-describing access-token payload (sandbox seam). The token STRING is
 * opaque to the client, but a separate resource server (today: the market
 * service) must verify it WITHOUT access to this engine's in-memory map —
 * the same stateless model a signed JWT gives a real NestJS backend. The
 * payload is base64url JSON + a mock checksum signature; ONLY the expiry and
 * subject are carried — never roles, permissions or credentials (§75).
 */
type AccessTokenPayload = {
  uid: string;
  iat: number;
  exp: number;
  v: 1;
};

type ChallengeRecord = { userId: string; expiresAt: number };

type VerificationRecord = { email: string; expiresAt: number; used: boolean };
type ResetRecord = { email: string; expiresAt: number; used: boolean };

/** Engine result — handlers translate `cookie` into a Set-Cookie header. */
export type EngineResult<T> =
  | { ok: true; status: number; value: T; setCookie?: string }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      retryAfterMs?: number;
    };

// ── Constants ────────────────────────────────────────────────────────────────

const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
const REFRESH_REMEMBER_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REFRESH_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;

const RATE_LIMITS: Record<string, { max: number; windowMs: number }> = {
  login: { max: 5, windowMs: 15 * 60 * 1000 },
  mfa: { max: 5, windowMs: 15 * 60 * 1000 },
  register: { max: 5, windowMs: 15 * 60 * 1000 },
  resend: { max: 3, windowMs: 15 * 60 * 1000 },
  forgot: { max: 3, windowMs: 15 * 60 * 1000 },
};

/** Mock checksum secret — a REAL backend signs refresh tokens server-side. */
const MOCK_REFRESH_SECRET = "cosmoz-mock-refresh-secret-v1";

/**
 * Mock signing secret for access tokens (sandbox seam). The market service
 * verifies access tokens against THIS SAME secret to enforce its
 * authenticated-WebSocket gate; in production both become real JWTs verified
 * via JWKS / introspection against the NestJS auth module.
 */
const MOCK_ACCESS_SECRET = "cosmoz-mock-access-secret-v1";

/**
 * Mock "cookie jar" (server-side emulation). A real NestJS backend owns the
 * HttpOnly cookie jar; in the MSW environment the cookie header never
 * reaches the handler (the service-worker request carries no Cookie header
 * and the reconstructed Request's guard blocks header writes), so the
 * engine persists the presented refresh token in localStorage — storage
 * owned by the MOCK BACKEND, never by application state. The client
 * contract is unchanged: the token never enters client-side state.
 */
const MOCK_JAR_KEY = "cosmoz.mock.refresh-jar";

function jarRead(): string | null {
  try {
    return localStorage.getItem(MOCK_JAR_KEY);
  } catch {
    return null;
  }
}

function jarWrite(value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(MOCK_JAR_KEY);
    else localStorage.setItem(MOCK_JAR_KEY, value);
  } catch {
    // Storage unavailable — refresh falls back to the cookie header path.
  }
}

export const REFRESH_COOKIE_NAME = "cosmoz_rt";

// ── Helpers ──────────────────────────────────────────────────────────────────

const nowMs = (): number => Date.now();
const inMs = (ms: number): string =>
  new Date(Date.now() + ms).toISOString();
const nowIso = (): string => new Date().toISOString();

function randomId(length: number): string {
  let out = "";
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

function fnv1a(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i += 1) {
    h1 ^= input.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ input.charCodeAt(input.length - 1 - i), 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

function encodeAccessToken(payload: AccessTokenPayload): string {
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `czat1.${body}.${fnv1a(`${MOCK_ACCESS_SECRET}:${body}`)}`;
}

function encodeRefreshToken(payload: RefreshPayload): string {
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `czrt1.${body}.${fnv1a(`${MOCK_REFRESH_SECRET}:${body}`)}`;
}

function decodeRefreshToken(token: string): RefreshPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "czrt1") return null;
  const [, body, signature] = parts;
  if (fnv1a(`${MOCK_REFRESH_SECRET}:${body}`) !== signature) return null;
  try {
    const json = atob(body.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as RefreshPayload;
    if (typeof payload.uid !== "string") return null;
    if (typeof payload.gen !== "number" || payload.gen < 1) return null;
    if (typeof payload.exp !== "number" || payload.exp <= nowMs()) return null;
    return payload;
  } catch {
    return null;
  }
}

function buildSetCookie(value: string, remember: boolean): string {
  const parts = [
    `${REFRESH_COOKIE_NAME}=${value}`,
    "Path=/",
    "SameSite=Lax",
    // NO HttpOnly here: MSW persists mocked cookies via document.cookie,
    // which the HTML spec rejects outright when it contains HttpOnly.
    // A real NestJS backend owns a true HttpOnly cookie jar (§10) — this is
    // a documented mock-environment seam, the contract is unchanged.
  ];
  if (remember) parts.push(`Max-Age=${Math.floor(REFRESH_REMEMBER_TTL_MS / 1000)}`);
  return parts.join("; ");
}

const CLEAR_COOKIE = `${REFRESH_COOKIE_NAME}=; Path=/; SameSite=Lax; Max-Age=0`;

function rateLimitKey(scope: string, subject: string): string {
  return `${scope}:${subject.toLowerCase()}`;
}

/** Browser-ish metadata for the session — the mock has one device profile. */
function describeDevice(): Pick<AuthSession, "device" | "browser" | "os" | "ipMasked" | "location"> {
  return {
    device: "This browser",
    browser: "Current browser",
    os: "This operating system",
    ipMasked: "24.114.•••.••",
    location: "Toronto, CA (approximate)",
  };
}

// ── Engine ───────────────────────────────────────────────────────────────────

class AuthEngine {
  private users = new Map<string, AuthUserRecord>();
  private userIdByEmail = new Map<string, string>();

  private accessTokens = new Map<string, AccessTokenRecord>();
  private refreshGeneration = new Map<string, number>();
  private challenges = new Map<string, ChallengeRecord>();
  private verificationTokens = new Map<string, VerificationRecord>();
  private resetTokens = new Map<string, ResetRecord>();
  private rateBuckets = new Map<string, number[]>();

  private sessions = new Map<string, AuthSession[]>();
  private sessionSeq = 0;

  constructor() {
    // Map key = record.id (UUID) — every lookup (access tokens, refresh
    // payloads, challenge records) resolves by id.
    const demoUser: AuthUserRecord = {
      id: "8b1f4b2a-3c9d-4e0f-9a1b-2d7c6e5f4a3b",
      email: "trader@cosmoz.app",
      name: "Alex Moreau",
      // The demo password is owned by the Security engine so the Security
      // center (change password) and login stay in sync.
      password: DEMO_PASSWORD,
      status: "ACTIVE",
      emailVerifiedAt: new Date(Date.now() - 62 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      demo: true,
    };
    this.users.set(demoUser.id, demoUser);
    this.userIdByEmail.set("trader@cosmoz.app", demoUser.id);
  }

  // ── Lookups ────────────────────────────────────────────────────────────────

  private findUser(id: string): AuthUserRecord | null {
    return this.users.get(id) ?? null;
  }

  private findUserByEmail(email: string): AuthUserRecord | null {
    const id = this.userIdByEmail.get(email.trim().toLowerCase());
    return id ? this.users.get(id) ?? null : null;
  }

  private toAuthUser(record: AuthUserRecord): AuthUser {
    return {
      id: record.id,
      email: record.email,
      name: record.name,
      status: record.status,
      emailVerifiedAt: record.emailVerifiedAt,
      roles: ["TRADER"],
      permissions: [
        "trades:read",
        "trades:create",
        "trades:grade",
        "analytics:read",
        "journal:write",
        "session_live:use",
        "playbook:write",
        "settings:manage",
        "security:manage",
      ],
      createdAt: record.createdAt,
    };
  }

  // ── Rate limiting (§39) ────────────────────────────────────────────────────

  private checkRateLimit(scope: string, subject: string): { retryAfterMs?: number } | "blocked" {
    const limit = RATE_LIMITS[scope];
    const key = rateLimitKey(scope, subject);
    const now = nowMs();
    const windowStart = now - limit.windowMs;
    const hits = (this.rateBuckets.get(key) ?? []).filter((at) => at > windowStart);
    if (hits.length >= limit.max) {
      const oldest = Math.min(...hits);
      return { retryAfterMs: Math.max(1000, oldest + limit.windowMs - now) };
    }
    return "blocked";
  }

  private recordRateHit(scope: string, subject: string): void {
    const key = rateLimitKey(scope, subject);
    const hits = this.rateBuckets.get(key) ?? [];
    hits.push(nowMs());
    this.rateBuckets.set(key, hits);
  }

  private clearRateHits(scope: string, subject: string): void {
    this.rateBuckets.delete(rateLimitKey(scope, subject));
  }

  // ── Sessions ───────────────────────────────────────────────────────────────

  private openSession(userId: string): AuthSession {
    const seq = (this.sessionSeq += 1);
    const session: AuthSession = {
      id: `auth-ses-${seq}-${randomId(6)}`,
      ...describeDevice(),
      createdAt: nowIso(),
      lastActivityAt: nowIso(),
      current: true,
    };
    const existing = this.sessions.get(userId) ?? [];
    // The newest login becomes the current session.
    this.sessions.set(userId, [
      ...existing.map((s) => ({ ...s, current: false })),
      session,
    ]);
    return session;
  }

  private touchSession(userId: string, sessionId: string): void {
    const list = this.sessions.get(userId);
    if (!list) return;
    this.sessions.set(
      userId,
      list.map((s) =>
        s.id === sessionId ? { ...s, lastActivityAt: nowIso() } : s,
      ),
    );
  }

  revokeAllSessionsForUser(userId: string): void {
    this.sessions.delete(userId);
    this.refreshGeneration.delete(userId);
  }

  // ── Tokens ─────────────────────────────────────────────────────────────────

  private issueAccessToken(userId: string): { token: string; expiresAt: string } {
    // Self-describing signed format (czat1): lets the market service enforce
    // its authenticated WebSocket/REST gate statelessly, exactly like a real
    // JWT would. The in-memory map stays authoritative for THIS engine's own
    // endpoint guards (MSW handlers) so revocation semantics are unchanged.
    const issuedAt = nowMs();
    const expiresAt = issuedAt + ACCESS_TOKEN_TTL_MS;
    const token = encodeAccessToken({ uid: userId, iat: issuedAt, exp: expiresAt, v: 1 });
    this.accessTokens.set(token, { userId, expiresAt });
    return { token, expiresAt: inMs(ACCESS_TOKEN_TTL_MS) };
  }

  verifyAccessToken(token: string): AuthUserRecord | null {
    const record = this.accessTokens.get(token);
    if (!record) return null;
    if (record.expiresAt <= nowMs()) {
      this.accessTokens.delete(token);
      return null;
    }
    return this.findUser(record.userId);
  }

  /**
   * Endpoint-guard helper used by every protected mock handler so private
   * data never leaves the "server" without authentication (§68: no
   * unauthorized private route access). Returns the user record or an error
   * result the handler can map to 401.
   */
  authenticate(header: string | null): { user: AuthUserRecord } | null {
    if (!header?.startsWith("Bearer ")) return null;
    const user = this.verifyAccessToken(header.slice("Bearer ".length));
    return user ? { user } : null;
  }

  private successPayload(
    record: AuthUserRecord,
    sessionId: string,
  ): Omit<AuthSuccess, "accessToken" | "accessTokenExpiresAt"> & {
    accessToken: string;
    accessTokenExpiresAt: string;
  } {
    const issued = this.issueAccessToken(record.id);
    this.touchSession(record.id, sessionId);
    return {
      user: this.toAuthUser(record),
      accessToken: issued.token,
      accessTokenExpiresAt: issued.expiresAt,
      session: this.currentSessionFor(record.id),
    };
  }

  private currentSessionFor(userId: string): AuthSession {
    const list = this.sessions.get(userId) ?? [];
    return list.find((s) => s.current) ?? list[list.length - 1] ?? {
      id: "auth-ses-unknown",
      ...describeDevice(),
      createdAt: nowIso(),
      lastActivityAt: nowIso(),
      current: true,
    };
  }

  // ── Registration (§15) ─────────────────────────────────────────────────────

  register(input: {
    name: string;
    email: string;
    password: string;
  }): EngineResult<RegisterResponse> {
    const gate = this.checkRateLimit("register", input.email);
    if (gate !== "blocked") {
      return {
        ok: false,
        status: 429,
        code: "RATE_LIMITED",
        message: "Too many attempts. Please wait before trying again.",
        retryAfterMs: gate.retryAfterMs,
      };
    }
    this.recordRateHit("register", input.email);

    const email = input.email.trim().toLowerCase();
    if (this.userIdByEmail.has(email)) {
      return {
        ok: false,
        status: 409,
        code: "EMAIL_ALREADY_USED",
        message: "An account already exists for this email address.",
      };
    }

    const id = crypto.randomUUID();
    this.users.set(id, {
      id,
      email,
      name: input.name.trim(),
      password: input.password,
      status: "PENDING_VERIFICATION",
      emailVerifiedAt: null,
      createdAt: nowIso(),
      demo: false,
    });
    this.userIdByEmail.set(email, id);

    const verificationToken = `vrf_${randomId(24)}`;
    this.verificationTokens.set(verificationToken, {
      email,
      expiresAt: nowMs() + VERIFICATION_TTL_MS,
      used: false,
    });

    securityEngine.recordAuthEvent(
      "SENSITIVE_SETTINGS_CHANGED",
      email,
      "Account registered — verification email queued (mock delivery).",
    );

    return {
      ok: true,
      status: 201,
      value: {
        user: this.toAuthUser(this.users.get(id)!),
        status: "PENDING_VERIFICATION",
        verificationSentAt: nowIso(),
        // Mock delivery: no mail service exists here, so the one-time token
        // rides along with an explicit MOCKED marker (demoCode precedent).
        delivery: "MOCKED",
        verificationToken,
        verificationExpiresAt: inMs(VERIFICATION_TTL_MS),
      },
    };
  }

  // ── Login (§14, §25) ───────────────────────────────────────────────────────

  login(input: {
    email: string;
    password: string;
    remember: boolean;
  }): EngineResult<LoginResponse> {
    const gate = this.checkRateLimit("login", input.email);
    if (gate !== "blocked") {
      securityEngine.recordLogin({
        success: false,
        reason: "Too many attempts — rate limited.",
        ...describeDevice(),
      });
      return {
        ok: false,
        status: 429,
        code: "RATE_LIMITED",
        message: "Too many attempts. Please wait before trying again.",
        retryAfterMs: gate.retryAfterMs,
      };
    }

    const record = this.findUserByEmail(input.email);
    const passwordOk =
      record !== null &&
      (record.demo
        ? securityEngine.verifyAccountPassword(input.password)
        : record.password === input.password);

    if (record === null || !passwordOk) {
      this.recordRateHit("login", input.email);
      securityEngine.recordLogin({
        success: false,
        reason: record === null ? "Unknown email." : "Wrong password.",
        ...describeDevice(),
      });
      securityEngine.recordAuthEvent(
        "LOGIN_FAILED",
        record === null ? "Unknown email" : record.email,
        "Failed sign-in — invalid credentials.",
        "FAILURE",
      );
      // Anti-enumeration: identical message for unknown email and wrong
      // password (§14).
      return {
        ok: false,
        status: 401,
        code: "INVALID_CREDENTIALS",
        message: "Incorrect email or password.",
      };
    }

    if (record.status === "SUSPENDED") {
      return {
        ok: false,
        status: 403,
        code: "ACCOUNT_SUSPENDED",
        message: "This account is suspended. Contact support for help.",
      };
    }
    if (record.status === "DEACTIVATED") {
      return {
        ok: false,
        status: 403,
        code: "ACCOUNT_DEACTIVATED",
        message: "This account is deactivated.",
      };
    }
    if (record.status === "PENDING_VERIFICATION") {
      return {
        ok: false,
        status: 403,
        code: "EMAIL_NOT_VERIFIED",
        message: "Verify your email address before signing in.",
      };
    }

    // MFA gate — the Security engine owns the two-factor domain (§24, §25).
    if (record.demo && securityEngine.isTwoFactorEnabled()) {
      const mfaGate = this.checkRateLimit("mfa", input.email);
      if (mfaGate !== "blocked") {
        return {
          ok: false,
          status: 429,
          code: "RATE_LIMITED",
          message: "Too many attempts. Please wait before trying again.",
          retryAfterMs: mfaGate.retryAfterMs,
        };
      }
      const challengeToken = `mfa_${randomId(24)}`;
      this.challenges.set(challengeToken, {
        userId: record.id,
        expiresAt: nowMs() + CHALLENGE_TTL_MS,
      });
      const mfaRequired: MfaRequired = {
        mfaRequired: true,
        challengeToken,
        challengeExpiresAt: inMs(CHALLENGE_TTL_MS),
        method: "AUTHENTICATOR_APP",
        // Mock authenticator stand-in (demoCode precedent) — a real backend
        // NEVER returns the current TOTP code.
        demoCode: securityEngine.currentDemoCode() ?? undefined,
      };
      return {
        ok: true,
        status: 200,
        value: { outcome: "MFA_REQUIRED", ...mfaRequired },
      };
    }

    return this.completeLogin(record, input.remember);
  }

  private completeLogin(
    record: AuthUserRecord,
    remember: boolean,
  ): EngineResult<LoginResponse> {
    this.clearRateHits("login", record.email);
    const session = this.openSession(record.id);
    const payload = this.successPayload(record, session.id);
    const generation = (this.refreshGeneration.get(record.id) ?? 0) + 1;
    this.refreshGeneration.set(record.id, generation);
    const refresh = encodeRefreshToken({
      uid: record.id,
      gen: generation,
      exp: nowMs() + (remember ? REFRESH_REMEMBER_TTL_MS : REFRESH_SESSION_TTL_MS),
    });
    jarWrite(refresh);

    securityEngine.recordLogin({
      success: true,
      reason: null,
      ...describeDevice(),
    });
    securityEngine.recordAuthEvent(
      "LOGIN_SUCCESS",
      record.email,
      "Sign-in from Toronto, CA (approximate).",
    );

    return {
      ok: true,
      status: 200,
      value: { outcome: "AUTHENTICATED", ...payload },
      setCookie: buildSetCookie(refresh, remember),
    };
  }

  // ── MFA challenge (§25) ────────────────────────────────────────────────────

  mfaChallenge(input: { challengeToken: string; code: string }): EngineResult<LoginResponse> {
    const challenge = this.challenges.get(input.challengeToken);
    if (!challenge || challenge.expiresAt <= nowMs()) {
      this.challenges.delete(input.challengeToken);
      return {
        ok: false,
        status: 401,
        code: "INVALID_CHALLENGE",
        message: "This challenge expired — start again with your password.",
      };
    }
    const record = this.findUser(challenge.userId);
    if (!record) {
      return {
        ok: false,
        status: 401,
        code: "INVALID_CHALLENGE",
        message: "This challenge is no longer valid — start again.",
      };
    }

    const gate = this.checkRateLimit("mfa", record.email);
    if (gate !== "blocked") {
      return {
        ok: false,
        status: 429,
        code: "RATE_LIMITED",
        message: "Too many attempts. Please wait before trying again.",
        retryAfterMs: gate.retryAfterMs,
      };
    }

    if (!securityEngine.verifyTotpCode(input.code)) {
      this.recordRateHit("mfa", record.email);
      securityEngine.recordAuthEvent(
        "TFA_CHALLENGE_FAILED",
        record.email,
        "Authenticator challenge failed at sign-in — code rejected.",
        "FAILURE",
      );
      return {
        ok: false,
        status: 401,
        code: "INVALID_MFA_CODE",
        message: "That code does not match — check your authenticator and try again.",
      };
    }

    this.challenges.delete(input.challengeToken);
    return this.completeLogin(record, true);
  }

  mfaRecover(input: { challengeToken: string; recoveryCode: string }): EngineResult<LoginResponse> {
    const challenge = this.challenges.get(input.challengeToken);
    if (!challenge || challenge.expiresAt <= nowMs()) {
      this.challenges.delete(input.challengeToken);
      return {
        ok: false,
        status: 401,
        code: "INVALID_CHALLENGE",
        message: "This challenge expired — start again with your password.",
      };
    }
    const record = this.findUser(challenge.userId);
    if (!record) {
      return {
        ok: false,
        status: 401,
        code: "INVALID_CHALLENGE",
        message: "This challenge is no longer valid — start again.",
      };
    }

    const gate = this.checkRateLimit("mfa", record.email);
    if (gate !== "blocked") {
      return {
        ok: false,
        status: 429,
        code: "RATE_LIMITED",
        message: "Too many attempts. Please wait before trying again.",
        retryAfterMs: gate.retryAfterMs,
      };
    }

    if (!securityEngine.consumeRecoveryCode(input.recoveryCode)) {
      this.recordRateHit("mfa", record.email);
      securityEngine.recordAuthEvent(
        "TFA_CHALLENGE_FAILED",
        record.email,
        "Recovery-code sign-in failed — code rejected.",
        "FAILURE",
      );
      return {
        ok: false,
        status: 401,
        code: "INVALID_MFA_CODE",
        message: "That recovery code was not recognized.",
      };
    }

    this.challenges.delete(input.challengeToken);
    securityEngine.recordAuthEvent(
      "LOGIN_SUCCESS",
      record.email,
      "Sign-in completed with a recovery code.",
    );
    return this.completeLogin(record, true);
  }

  // ── Refresh (§9, §10) — rotation + reuse detection ─────────────────────────

  refresh(cookieHeader: string | null): EngineResult<RefreshResponse> {
    // Real contract: the cookie header. Mock seam: the engine-side jar (see
    // MOCK_JAR_KEY above) because the SW-intercepted request carries no
    // Cookie header.
    const raw = readCookie(cookieHeader, REFRESH_COOKIE_NAME) ?? jarRead();
    if (!raw) {
      return {
        ok: false,
        status: 401,
        code: "INVALID_TOKEN",
        message: "No active session — sign in again.",
      };
    }
    const payload = decodeRefreshToken(raw);
    if (!payload) {
      return {
        ok: false,
        status: 401,
        code: "INVALID_TOKEN",
        message: "This session is no longer valid — sign in again.",
      };
    }
    const record = this.findUser(payload.uid);
    if (!record || record.status !== "ACTIVE") {
      return {
        ok: false,
        status: 401,
        code: "INVALID_TOKEN",
        message: "This session is no longer valid — sign in again.",
      };
    }

    const currentGen = this.refreshGeneration.get(payload.uid);
    if (currentGen !== undefined && payload.gen < currentGen) {
      // Superseded refresh token presented — treat as reuse (§68) and
      // revoke everything for this user.
      this.revokeAllSessionsForUser(payload.uid);
      securityEngine.recordAuthEvent(
        "SESSION_REVOKED",
        record.email,
        "Refresh-token reuse detected — all sessions revoked.",
      );
      return {
        ok: false,
        status: 401,
        code: "INVALID_TOKEN",
        message: "This session was revoked — sign in again.",
      };
    }
    // Adopt statelessly after a reload (mock seam — documented at the top).
    this.refreshGeneration.set(payload.uid, payload.gen);

    const session = this.openSession(record.id);
    const payload2 = this.successPayload(record, session.id);
    const nextGen = payload.gen + 1;
    this.refreshGeneration.set(record.id, nextGen);
    const refresh = encodeRefreshToken({
      uid: record.id,
      gen: nextGen,
      exp: nowMs() + REFRESH_REMEMBER_TTL_MS,
    });
    jarWrite(refresh);

    return {
      ok: true,
      status: 200,
      value: payload2,
      setCookie: buildSetCookie(refresh, true),
    };
  }

  // ── Logout (§21) ───────────────────────────────────────────────────────────

  logout(cookieHeader: string | null): EngineResult<{ loggedOut: true }> {
    const raw = readCookie(cookieHeader, REFRESH_COOKIE_NAME);
    if (raw) {
      const payload = decodeRefreshToken(raw);
      if (payload) {
        const record = this.findUser(payload.uid);
        if (record) {
          securityEngine.recordAuthEvent(
            "LOGOUT",
            record.email,
            "Signed out — refresh token revoked.",
          );
        }
        this.refreshGeneration.delete(payload.uid);
        this.sessions.delete(payload.uid);
      }
    }
    jarWrite(null);
    return { ok: true, status: 200, value: { loggedOut: true }, setCookie: CLEAR_COOKIE };
  }

  // ── Current user (§9 — GET /auth/me) ───────────────────────────────────────

  me(accessTokenUser: AuthUserRecord | null): EngineResult<AuthMeResponse> {
    if (!accessTokenUser) {
      return {
        ok: false,
        status: 401,
        code: "INVALID_TOKEN",
        message: "Not authenticated.",
      };
    }
    const session = this.currentSessionFor(accessTokenUser.id);
    this.touchSession(accessTokenUser.id, session.id);
    return {
      ok: true,
      status: 200,
      value: { user: this.toAuthUser(accessTokenUser), session },
    };
  }

  // ── Email verification (§17, §36) ──────────────────────────────────────────

  verifyEmail(token: string): EngineResult<VerifyEmailResponse> {
    const record = this.verificationTokens.get(token);
    if (!record) {
      return {
        ok: false,
        status: 400,
        code: "INVALID_TOKEN",
        message: "This verification link is not valid.",
      };
    }
    if (record.used) {
      return {
        ok: false,
        status: 400,
        code: "TOKEN_ALREADY_USED",
        message: "This verification link was already used — try signing in.",
      };
    }
    if (record.expiresAt <= nowMs()) {
      return {
        ok: false,
        status: 400,
        code: "EXPIRED_TOKEN",
        message: "This verification link expired — request a new email.",
      };
    }

    const user = this.findUserByEmail(record.email);
    if (!user) {
      return {
        ok: false,
        status: 400,
        code: "INVALID_TOKEN",
        message: "This verification link is not valid.",
      };
    }

    record.used = true;
    user.emailVerifiedAt = nowIso();
    user.status = "ACTIVE";
    securityEngine.recordAuthEvent(
      "EMAIL_VERIFIED",
      user.email,
      "Email address verified via confirmation link.",
    );

    return {
      ok: true,
      status: 200,
      value: { user: this.toAuthUser(user), verifiedAt: user.emailVerifiedAt },
    };
  }

  resendVerification(email: string): EngineResult<ResendVerificationResponse> {
    const gate = this.checkRateLimit("resend", email);
    if (gate !== "blocked") {
      return {
        ok: false,
        status: 429,
        code: "RATE_LIMITED",
        message: "Too many attempts. Please wait before trying again.",
        retryAfterMs: gate.retryAfterMs,
      };
    }

    const user = this.findUserByEmail(email);
    // Anti-enumeration: unknown or verified accounts still report success.
    if (!user || user.emailVerifiedAt !== null || user.status !== "PENDING_VERIFICATION") {
      return {
        ok: true,
        status: 202,
        value: { sent: true, delivery: "MOCKED", verificationExpiresAt: null },
      };
    }

    this.recordRateHit("resend", email);
    const verificationToken = `vrf_${randomId(24)}`;
    this.verificationTokens.set(verificationToken, {
      email: user.email,
      expiresAt: nowMs() + VERIFICATION_TTL_MS,
      used: false,
    });
    return {
      ok: true,
      status: 202,
      value: {
        sent: true,
        delivery: "MOCKED",
        verificationToken,
        verificationExpiresAt: inMs(VERIFICATION_TTL_MS),
      },
    };
  }

  // ── Password recovery (§18, §19) ───────────────────────────────────────────

  forgotPassword(email: string): EngineResult<ForgotPasswordResponse> {
    const gate = this.checkRateLimit("forgot", email);
    if (gate !== "blocked") {
      return {
        ok: false,
        status: 429,
        code: "RATE_LIMITED",
        message: "Too many attempts. Please wait before trying again.",
        retryAfterMs: gate.retryAfterMs,
      };
    }

    const user = this.findUserByEmail(email);
    // Generic success either way (§18 — no account enumeration).
    if (!user) {
      return {
        ok: true,
        status: 202,
        value: { sent: true, delivery: "MOCKED", resetExpiresAt: null },
      };
    }

    this.recordRateHit("forgot", email);
    const resetToken = `rst_${randomId(24)}`;
    this.resetTokens.set(resetToken, {
      email: user.email,
      expiresAt: nowMs() + RESET_TTL_MS,
      used: false,
    });
    return {
      ok: true,
      status: 202,
      value: {
        sent: true,
        delivery: "MOCKED",
        resetToken,
        resetExpiresAt: inMs(RESET_TTL_MS),
      },
    };
  }

  resetPassword(token: string, password: string): EngineResult<ResetPasswordResponse> {
    const record = this.resetTokens.get(token);
    if (!record) {
      return {
        ok: false,
        status: 400,
        code: "INVALID_TOKEN",
        message: "This reset link is not valid.",
      };
    }
    if (record.used) {
      return {
        ok: false,
        status: 400,
        code: "TOKEN_ALREADY_USED",
        message: "This reset link was already used — request a new one.",
      };
    }
    if (record.expiresAt <= nowMs()) {
      return {
        ok: false,
        status: 400,
        code: "EXPIRED_TOKEN",
        message: "This reset link expired — request a new email.",
      };
    }

    const user = this.findUserByEmail(record.email);
    if (!user) {
      return {
        ok: false,
        status: 400,
        code: "INVALID_TOKEN",
        message: "This reset link is not valid.",
      };
    }

    record.used = true;
    if (user.demo) {
      // The Security engine owns the demo password — keep both in sync.
      securityEngine.applyPasswordReset(password);
    } else {
      user.password = password;
    }
    // Defense in depth: a reset invalidates the user's refresh chain.
    this.revokeAllSessionsForUser(user.id);
    securityEngine.recordAuthEvent(
      "PASSWORD_CHANGED",
      user.email,
      "Password changed via reset link. Sessions were signed out.",
    );

    return {
      ok: true,
      status: 200,
      value: { resetAt: nowIso() },
    };
  }
}

function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

export const authEngine = new AuthEngine();
