import type { AuthSession, AuthUser } from "@cosmoz/shared";

import { MockError } from "@/mocks/store";
import { DEMO_CREDENTIALS } from "@/lib/auth/demo";

/**
 * Mock auth store — users, sessions and password-reset codes for the MSW
 * backend. Persisted to localStorage so a page reload keeps both the
 * registered accounts AND the issued session tokens valid (the real API
 * will own this state; the browser-side mock keeps it in storage instead
 * of memory so the demo behaves like production).
 *
 * SECURITY NOTE: this is a browser mock — passwords are stored as-is
 * inside the user's own localStorage and never leave the device. The real
 * backend must hash (bcrypt/argon2) and never log secrets.
 */

const STORAGE_KEY = "cosmoz:mock-auth:v1";

interface MockUserRecord {
  id: string;
  name: string;
  email: string;
  password: string;
  createdAt: string;
  resetCode: string | null;
  resetExpiresAt: number | null;
}

interface AuthState {
  users: MockUserRecord[];
  /** token → userId. */
  sessions: Record<string, string>;
}

function demoUser(): MockUserRecord {
  return {
    id: "usr_demo_alex",
    name: "Alex Moreau",
    email: DEMO_CREDENTIALS.email,
    password: DEMO_CREDENTIALS.password,
    createdAt: "2026-01-05T09:00:00.000Z",
    resetCode: null,
    resetExpiresAt: null,
  };
}

function loadState(): AuthState {
  const fallback: AuthState = { users: [demoUser()], sessions: {} };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as AuthState;
    if (!Array.isArray(parsed.users)) return fallback;
    // The demo account is always available, even on stale storage.
    if (!parsed.users.some((user) => user.email === DEMO_CREDENTIALS.email)) {
      parsed.users.unshift(demoUser());
    }
    return { users: parsed.users, sessions: parsed.sessions ?? {} };
  } catch {
    return fallback;
  }
}

let state: AuthState | null = null;

function persist(): void {
  if (typeof window === "undefined" || state === null) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable — the mock keeps state in memory for the session.
  }
}

function ensureState(): AuthState {
  state ??= loadState();
  return state;
}

/** Domain error — converted to an HTTP status by the shared toErrorResponse. */
export class AuthMockError extends MockError {}

function token(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toAuthUser(user: MockUserRecord): AuthUser {
  return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt };
}

export function createSession(user: MockUserRecord): AuthSession {
  const current = ensureState();
  const issued = token();
  current.sessions[issued] = user.id;
  persist();
  return { token: issued, user: toAuthUser(user) };
}

export function findUserByEmail(email: string): MockUserRecord | undefined {
  return ensureState().users.find((user) => user.email === email.toLowerCase());
}

export function registerUser(name: string, email: string, password: string): AuthSession {
  const current = ensureState();
  if (findUserByEmail(email) !== undefined) {
    throw new AuthMockError(409, "An account already exists with this email — sign in instead.");
  }
  const user: MockUserRecord = {
    id: `usr_${token().slice(0, 12)}`,
    name,
    email: email.toLowerCase(),
    password,
    createdAt: new Date().toISOString(),
    resetCode: null,
    resetExpiresAt: null,
  };
  current.users.push(user);
  persist();
  return createSession(user);
}

export function login(email: string, password: string): AuthSession {
  const user = findUserByEmail(email);
  if (user === undefined || user.password !== password) {
    throw new AuthMockError(401, "Incorrect email or password.");
  }
  return createSession(user);
}

/** Resolve a Bearer token to its live session, or null when unknown. */
export function sessionFor(authHeader: string | null): AuthSession | null {
  const current = ensureState();
  const match = authHeader?.match(/^Bearer\s+(.+)$/i);
  if (match === null || match === undefined) return null;
  const userId = current.sessions[match[1]!];
  if (userId === undefined) return null;
  const user = current.users.find((record) => record.id === userId);
  if (user === undefined) return null;
  return { token: match[1]!, user: toAuthUser(user) };
}

export function sessionFromRequest(request: Request): AuthSession | null {
  return sessionFor(request.headers.get("authorization"));
}

export function revokeSession(authHeader: string | null): void {
  const current = ensureState();
  const match = authHeader?.match(/^Bearer\s+(.+)$/i);
  if (match === null || match === undefined) return;
  delete current.sessions[match[1]!];
  persist();
}

export function issueResetCode(email: string): string {
  const user = findUserByEmail(email);
  if (user === undefined) {
    throw new AuthMockError(404, "No account found with this email address.");
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  user.resetCode = code;
  user.resetExpiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes
  persist();
  return code;
}

export function confirmPasswordReset(code: string, password: string): AuthSession {
  const current = ensureState();
  const user = current.users.find(
    (record) => record.resetCode === code && record.resetExpiresAt !== null,
  );
  if (user === undefined || user.resetExpiresAt! < Date.now()) {
    throw new AuthMockError(400, "Invalid or expired reset code — request a new one.");
  }
  user.password = password;
  user.resetCode = null;
  user.resetExpiresAt = null;
  persist();
  return createSession(user);
}

export function changePassword(
  authHeader: string | null,
  currentPassword: string,
  newPassword: string,
): void {
  const session = sessionFor(authHeader);
  if (session === null) throw new AuthMockError(401, "Sign in to change your password.");
  const user = ensureState().users.find((record) => record.id === session.user.id);
  if (user === undefined) throw new AuthMockError(401, "Sign in to change your password.");
  if (user.password !== currentPassword) {
    throw new AuthMockError(400, "Current password is incorrect.");
  }
  user.password = newPassword;
  persist();
}

/**
 * Verify a password against the request's session user — gate for the
 * dangerous account actions (deactivate / delete, Settings §13). The real
 * backend must re-hash and rate-limit this; the mock compares plainly.
 */
export function verifyPasswordForSession(request: Request, password: string): boolean {
  const session = sessionFromRequest(request);
  if (session === null) return false;
  const user = ensureState().users.find((record) => record.id === session.user.id);
  return user !== undefined && user.password === password;
}

/**
 * Account deletion (§13): drop the user record and every session pointing
 * at it. The demo account is re-seeded by loadState on the next page load —
 * the demo honestly restarts with fixture data after deletion.
 */
export function deleteUserAndSessions(request: Request): void {
  const session = sessionFromRequest(request);
  if (session === null) return;
  const current = ensureState();
  current.users = current.users.filter((record) => record.id !== session.user.id);
  for (const [tok, userId] of Object.entries(current.sessions)) {
    if (userId === session.user.id) delete current.sessions[tok];
  }
  persist();
}
