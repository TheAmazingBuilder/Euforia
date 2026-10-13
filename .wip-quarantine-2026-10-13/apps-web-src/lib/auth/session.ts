/**
 * Mock auth session (localStorage) — the V1 auth is client-side only:
 * the demo account validates, two-step is a fixed demo code, and the
 * "active" session is just a JSON blob. The real API replaces this later —
 * the call sites (login / two-step / sign-out) won't change shape.
 */

export const DEMO_EMAIL = "alex@cosmoz.app";
export const DEMO_PASSWORD = "cosmoz123";
export const DEMO_2FA_CODE = "246810";

export interface CosmozSession {
  email: string;
  name: string;
  /** "pending-2fa": credentials accepted, waiting for the verification code. */
  status: "pending-2fa" | "active";
}

const STORAGE_KEY = "cosmoz-auth";

function safeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getSession(): CosmozSession | null {
  const storage = safeStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CosmozSession>;
    if (typeof parsed.email !== "string" || typeof parsed.status !== "string") return null;
    return {
      email: parsed.email,
      name: parsed.name ?? parsed.email,
      status: parsed.status as CosmozSession["status"],
    };
  } catch {
    return null;
  }
}

export function setSession(session: CosmozSession): void {
  safeStorage()?.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  safeStorage()?.removeItem(STORAGE_KEY);
}

/** Accepts credentials (demo-only check) and moves to the two-step step. */
export function signIn(email: string, password: string): { ok: true } | { ok: false; error: string } {
  const normalized = email.trim().toLowerCase();
  if (normalized !== DEMO_EMAIL || password !== DEMO_PASSWORD) {
    return { ok: false, error: "Unknown email or wrong password." };
  }
  setSession({ email: DEMO_EMAIL, name: "Alex Turner", status: "pending-2fa" });
  return { ok: true };
}

/** Verifies the 6-digit code (demo code) and activates the session. */
export function verifyTwoStep(code: string): { ok: true } | { ok: false; error: string } {
  const session = getSession();
  if (!session || session.status !== "pending-2fa") {
    return { ok: false, error: "No pending sign-in — start again from the sign-in page." };
  }
  if (code !== DEMO_2FA_CODE) {
    return { ok: false, error: "Invalid code — check the digits and try again." };
  }
  setSession({ ...session, status: "active" });
  return { ok: true };
}
