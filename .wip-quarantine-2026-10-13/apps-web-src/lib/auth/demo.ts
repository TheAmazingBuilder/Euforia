/**
 * Demo credentials — the seeded demo account for the V1 client-side auth.
 * The email/password live in lib/auth/session.ts; this re-export keeps one
 * source of truth while giving the mock auth store a stable import path.
 */
import { DEMO_EMAIL, DEMO_PASSWORD } from "./session";

export const DEMO_CREDENTIALS = {
  email: DEMO_EMAIL,
  password: DEMO_PASSWORD,
} as const;
/**
 * Demo-build auth rules shared by every (auth) screen. Honest by design:
 * authentication is simulated locally (MSW build) — no credential ever
 * leaves the browser and every screen says so. When real auth lands,
 * these helpers become the client-side mirror of the server's contract.
 */

/** Simulated network latency so pending states are actually visible. */
export function simulateLatency(ms = 700): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Masks an email for display next to the OTP input: al***@domain.tld. */
export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  if (!local || !domain) return email;
  const head = local.slice(0, 2);
  return `${head}${"*".repeat(Math.max(3, local.length - 2))}@${domain}`;
}

/** Inline email issue, or null when acceptable. */
export function emailIssue(email: string): string | null {
  if (email.trim() === "") return "Enter your email.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return "That doesn't look like a valid email.";
  }
  return null;
}

/** Inline password issue, or null when acceptable (8+ characters). */
export function passwordIssue(password: string): string | null {
  if (password === "") return "Enter your password.";
  if (password.length < 8) return "Use at least 8 characters.";
  return null;
}

export function passwordsMatch(password: string, confirm: string): boolean {
  return confirm.length > 0 && password === confirm;
}
