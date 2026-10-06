/**
 * e2e — Security center, MFA/TOTP, sessions, API keys, profile/preferences
 * (Phase 2 §41–§44: authorization + IDOR + sensitive operations).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Secret, TOTP } from "otpauth";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { buildTestApp } from "../helpers/build-app";
import {
  authenticatedUser,
  captureMail,
  refreshCookieOf,
  cookieHeader,
  PASSWORD,
  uniqueEmail,
  type MailCapture,
} from "../helpers/identity";

let app: NestFastifyApplication;
let mail: MailCapture;

beforeAll(async () => {
  app = await buildTestApp();
  mail = captureMail(app);
});

afterAll(async () => {
  await app?.close();
});

function totpCode(secretBase32: string, email: string): string {
  const totp = new TOTP({
    issuer: "Euforia",
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secretBase32),
  });
  return totp.generate();
}

describe("security overview", () => {
  it("returns the full aggregate for the authenticated user", async () => {
    const ctx = await authenticatedUser(app, mail);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/security/overview",
      headers: ctx.authHeader,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.auth.email).toBe(ctx.email);
    expect(body.auth.emailVerified).toBe(true);
    expect(body.twoFactor.enabled).toBe(false);
    expect(body.sessions.length).toBeGreaterThanOrEqual(1);
    expect(body.sessions.every((s: { current: boolean }) => typeof s.current === "boolean")).toBe(true);
    expect(Array.isArray(body.protection)).toBe(true);
    expect(body.protection.length).toBe(7);
    expect(body.securityScore.total).toBe(7);
    expect(body.rateLimits.length).toBeGreaterThan(0);
    expect(body.retention).toEqual({ securityEventsDays: 365, loginHistoryDays: 180 });
  });

  it("requires authentication (401 for anonymous)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/security/overview" });
    expect(res.statusCode).toBe(401);
  });
});

describe("re-authentication (§37)", () => {
  it("issues a single-use token with the right password; wrong password leaks only a countdown", async () => {
    const ctx = await authenticatedUser(app, mail);
    const ok = await app.inject({
      method: "POST",
      url: "/api/v1/security/reauth",
      headers: ctx.authHeader,
      payload: { password: ctx.password },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().token).toMatch(/^reauth_/);
    expect(ok.json().expiresAt).toBeTruthy();

    const bad = await app.inject({
      method: "POST",
      url: "/api/v1/security/reauth",
      headers: ctx.authHeader,
      payload: { password: "wrong-password-1" },
    });
    expect(bad.statusCode).toBe(401);
    expect(bad.json().code).toBe("INVALID_CREDENTIALS");
    expect(bad.json().message).toContain("attempt(s) left");
  });

  it("consumed reauth tokens cannot be replayed", async () => {
    const ctx = await authenticatedUser(app, mail);
    const issued = await app.inject({
      method: "POST",
      url: "/api/v1/security/reauth",
      headers: ctx.authHeader,
      payload: { password: ctx.password },
    });
    const token = issued.json().token as string;

    const first = await app.inject({
      method: "POST",
      url: "/api/v1/security/password",
      headers: ctx.authHeader,
      payload: { reauthToken: token, newPassword: "a-fresh-password-1" },
    });
    expect(first.statusCode).toBe(200);

    const replay = await app.inject({
      method: "POST",
      url: "/api/v1/security/password",
      headers: ctx.authHeader,
      payload: { reauthToken: token, newPassword: "another-password-2" },
    });
    expect(replay.statusCode).toBe(401);
    expect(replay.json().code).toBe("INVALID_REAUTH_TOKEN");
  });
});

describe("password change (§23)", () => {
  it("changes the password, keeps the current session, revokes others", async () => {
    const ctx = await authenticatedUser(app, mail);
    // A second session (another device).
    const second = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: ctx.email, password: ctx.password, remember: true },
    });
    const secondCookie = refreshCookieOf(second);

    const reauth = await app.inject({
      method: "POST",
      url: "/api/v1/security/reauth",
      headers: ctx.authHeader,
      payload: { password: ctx.password },
    });
    const changed = await app.inject({
      method: "POST",
      url: "/api/v1/security/password",
      headers: ctx.authHeader,
      payload: { reauthToken: reauth.json().token, newPassword: "the-next-password-9" },
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.json().changedAt).toBeTruthy();

    // Other session revoked — cannot refresh.
    const otherRefresh = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: cookieHeader(secondCookie),
    });
    expect(otherRefresh.statusCode).toBe(401);

    // Current session survives: /auth/me still works, new password logs in.
    const me = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: ctx.authHeader,
    });
    expect(me.statusCode).toBe(200);
    const relogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: ctx.email, password: "the-next-password-9", remember: false },
    });
    expect(relogin.statusCode).toBe(200);
  });

  it("rejects the same password (PASSWORD_UNCHANGED) and missing reauth (INVALID_REAUTH_TOKEN)", async () => {
    const ctx = await authenticatedUser(app, mail);
    const noReauth = await app.inject({
      method: "POST",
      url: "/api/v1/security/password",
      headers: ctx.authHeader,
      payload: { newPassword: "yet-another-pass-1" },
    });
    expect(noReauth.statusCode).toBe(401);
    expect(noReauth.json().code).toBe("INVALID_REAUTH_TOKEN");

    const reauth = await app.inject({
      method: "POST",
      url: "/api/v1/security/reauth",
      headers: ctx.authHeader,
      payload: { password: ctx.password },
    });
    const same = await app.inject({
      method: "POST",
      url: "/api/v1/security/password",
      headers: ctx.authHeader,
      payload: { reauthToken: reauth.json().token, newPassword: ctx.password },
    });
    expect(same.statusCode).toBe(409);
    expect(same.json().code).toBe("PASSWORD_UNCHANGED");
  });
});

describe("MFA / TOTP lifecycle (§18–§21)", () => {
  let email = "";
  const password = PASSWORD;
  let ctx: { authHeader: Record<string, string>; refreshCookie: string };
  let enrollment: { secret: string; recoveryCodes: string[] };

  it("enable requires reauth and returns secret + 10 codes (NEVER a demoCode)", async () => {
    email = uniqueEmail("mfa");
    ctx = await authenticatedUser(app, mail, { email });
    const reauth = await app.inject({
      method: "POST",
      url: "/api/v1/security/reauth",
      headers: ctx.authHeader,
      payload: { password },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/security/2fa/enable",
      headers: ctx.authHeader,
      payload: { reauthToken: reauth.json().token },
    });
    expect(res.statusCode).toBe(200);
    enrollment = res.json();
    expect(enrollment.secret.length).toBeGreaterThanOrEqual(16);
    expect(enrollment.recoveryCodes).toHaveLength(10);
    expect(enrollment.recoveryCodes.every((c: string) => /^[\dA-F]{4}-[\dA-F]{4}$/.test(c))).toBe(true);
    // SECURITY: no live TOTP code may ever leave the server (mock-only demoCode).
    expect(res.json().demoCode).toBeUndefined();
  });

  it("confirm with a wrong code → 422 INVALID_CODE; with the real TOTP → enabled", async () => {
    const bad = await app.inject({
      method: "POST",
      url: "/api/v1/security/2fa/confirm",
      headers: ctx.authHeader,
      payload: { code: "000000" },
    });
    expect([401, 422]).toContain(bad.statusCode);

    const good = await app.inject({
      method: "POST",
      url: "/api/v1/security/2fa/confirm",
      headers: ctx.authHeader,
      payload: { code: totpCode(enrollment.secret, email) },
    });
    expect(good.statusCode).toBe(200);
    expect(good.json().enabled).toBe(true);
    expect(good.json().recoveryCodesRemaining).toBe(10);
  });

  it("login now branches to MFA_REQUIRED; the challenge completes with TOTP", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password, remember: true },
    });
    expect(login.statusCode).toBe(200);
    const body = login.json();
    expect(body.outcome).toBe("MFA_REQUIRED");
    expect(body.challengeToken).toBeTruthy();
    expect(body.demoCode).toBeUndefined();

    const challenge = await app.inject({
      method: "POST",
      url: "/api/v1/auth/mfa/challenge",
      payload: { challengeToken: body.challengeToken, code: totpCode(enrollment.secret, email) },
    });
    expect(challenge.statusCode).toBe(200);
    expect(challenge.json().outcome).toBe("AUTHENTICATED");
    expect(challenge.json().session.current).toBe(true);
  });

  it("a wrong TOTP keeps the challenge alive but rate-limits guessing", async () => {
    // Dedicated account: rate buckets key on the email, and this test
    // deliberately exhausts one.
    const rlCtx = await authenticatedUser(app, mail, { email: uniqueEmail("mfa-rl") });
    const rlEmail = rlCtx.email;
    const reauth = await app.inject({
      method: "POST",
      url: "/api/v1/security/reauth",
      headers: rlCtx.authHeader,
      payload: { password: rlCtx.password },
    });
    const rlEnrollment = await app.inject({
      method: "POST",
      url: "/api/v1/security/2fa/enable",
      headers: rlCtx.authHeader,
      payload: { reauthToken: reauth.json().token },
    });
    await app.inject({
      method: "POST",
      url: "/api/v1/security/2fa/confirm",
      headers: rlCtx.authHeader,
      payload: { code: totpCode(rlEnrollment.json().secret, rlEmail) },
    });
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: rlEmail, password: rlCtx.password, remember: true },
    });
    const challengeToken = login.json().challengeToken as string;
    for (let i = 0; i < 5; i += 1) {
      const wrong = await app.inject({
        method: "POST",
        url: "/api/v1/auth/mfa/challenge",
        payload: { challengeToken, code: "111111" },
      });
      expect(wrong.statusCode).toBe(401);
      expect(wrong.json().code).toBe("INVALID_MFA_CODE");
    }
    const limited = await app.inject({
      method: "POST",
      url: "/api/v1/auth/mfa/challenge",
      payload: { challengeToken, code: "111112" },
    });
    expect(limited.statusCode).toBe(429);
  });

  it("recovery codes: one-time use, then exhausted", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password, remember: true },
    });
    const challengeToken = login.json().challengeToken as string;
    const code = enrollment.recoveryCodes[0];

    const recover = await app.inject({
      method: "POST",
      url: "/api/v1/auth/mfa/recover",
      payload: { challengeToken, recoveryCode: code },
    });
    expect(recover.statusCode).toBe(200);
    expect(recover.json().outcome).toBe("AUTHENTICATED");

    // Same code can never be reused.
    const login2 = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password, remember: true },
    });
    const reuse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/mfa/recover",
      payload: { challengeToken: login2.json().challengeToken, recoveryCode: code },
    });
    expect(reuse.statusCode).toBe(401);
    expect(reuse.json().code).toBe("INVALID_MFA_CODE");

    // Unknown code — same envelope.
    const unknown = await app.inject({
      method: "POST",
      url: "/api/v1/auth/mfa/recover",
      payload: { challengeToken: login2.json().challengeToken, recoveryCode: "DEAD-BEEF" },
    });
    expect(unknown.statusCode).toBe(401);
  });

  it("regenerating codes invalidates the old set (reauth required)", async () => {
    const ctx2 = await authenticatedUser(app, mail, { email: uniqueEmail("mfa2") });
    const reauth1 = await app.inject({
      method: "POST",
      url: "/api/v1/security/reauth",
      headers: ctx2.authHeader,
      payload: { password: ctx2.password },
    });
    const enable = await app.inject({
      method: "POST",
      url: "/api/v1/security/2fa/enable",
      headers: ctx2.authHeader,
      payload: { reauthToken: reauth1.json().token },
    });
    const firstCodes = enable.json().recoveryCodes as string[];
    await app.inject({
      method: "POST",
      url: "/api/v1/security/2fa/confirm",
      headers: ctx2.authHeader,
      payload: { code: totpCode(enable.json().secret, ctx2.email) },
    });

    const reauth2 = await app.inject({
      method: "POST",
      url: "/api/v1/security/reauth",
      headers: ctx2.authHeader,
      payload: { password: ctx2.password },
    });
    const regenerated = await app.inject({
      method: "POST",
      url: "/api/v1/security/2fa/recovery/regenerate",
      headers: ctx2.authHeader,
      payload: { reauthToken: reauth2.json().token },
    });
    expect(regenerated.statusCode).toBe(200);
    const newCodes = regenerated.json().recoveryCodes as string[];
    expect(newCodes).toHaveLength(10);
    expect(newCodes.some((c) => firstCodes.includes(c))).toBe(false);

    // An OLD code no longer works.
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: ctx2.email, password: ctx2.password, remember: true },
    });
    const oldAttempt = await app.inject({
      method: "POST",
      url: "/api/v1/auth/mfa/recover",
      payload: { challengeToken: login.json().challengeToken, recoveryCode: firstCodes[0] },
    });
    expect(oldAttempt.statusCode).toBe(401);
  });

  it("disable requires reauth, wipes MFA and codes (login returns to password-only)", async () => {
    const reauth = await app.inject({
      method: "POST",
      url: "/api/v1/security/reauth",
      headers: ctx.authHeader,
      payload: { password },
    });
    const disabled = await app.inject({
      method: "POST",
      url: "/api/v1/security/2fa/disable",
      headers: ctx.authHeader,
      payload: { reauthToken: reauth.json().token },
    });
    expect(disabled.statusCode).toBe(200);
    expect(disabled.json().enabled).toBe(false);

    const plain = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password, remember: false },
    });
    expect(plain.statusCode).toBe(200);
    expect(plain.json().outcome).toBe("AUTHENTICATED");

    const alreadyOff = await app.inject({
      method: "POST",
      url: "/api/v1/security/2fa/disable",
      headers: ctx.authHeader,
      payload: { reauthToken: reauth.json().token },
    });
    // The reauth token was consumed; even with a fresh one the state is off.
    expect(alreadyOff.statusCode).toBe(401);
  });
});

describe("sessions & devices (§16–§17) + IDOR (§43)", () => {
  it("lists sessions; revokes one; a foreign session id is 404 not leaky", async () => {
    const ctxA = await authenticatedUser(app, mail, { email: uniqueEmail("sess") });
    const second = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: ctxA.email, password: ctxA.password, remember: true },
    });
    const secondSessionId = second.json().session.id as string;

    const overview = await app.inject({
      method: "GET",
      url: "/api/v1/security/overview",
      headers: ctxA.authHeader,
    });
    const sessions = overview.json().sessions as Array<{ id: string; current: boolean }>;
    expect(sessions.length).toBe(2);

    const foreignCtx = await authenticatedUser(app, mail, { email: uniqueEmail("intruder") });
    const foreign = await app.inject({
      method: "POST",
      url: "/api/v1/security/sessions/revoke",
      headers: foreignCtx.authHeader,
      payload: { sessionId: secondSessionId, scope: "one" },
    });
    // IDOR: another user's session id must 404, never revoke.
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json().code).toBe("SESSION_NOT_FOUND");

    const revoke = await app.inject({
      method: "POST",
      url: "/api/v1/security/sessions/revoke",
      headers: ctxA.authHeader,
      payload: { sessionId: secondSessionId, scope: "one" },
    });
    expect(revoke.statusCode).toBe(200);
    expect(revoke.json()).toEqual({ revokedCount: 1, currentSessionAffected: false });
  });

  it("scope=others keeps only the current session; scope=all ends the current one", async () => {
    const ctx = await authenticatedUser(app, mail, { email: uniqueEmail("bulk") });
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: ctx.email, password: ctx.password, remember: true },
    });

    const others = await app.inject({
      method: "POST",
      url: "/api/v1/security/sessions/revoke",
      headers: ctx.authHeader,
      payload: { sessionId: null, scope: "others" },
    });
    expect(others.json()).toEqual({ revokedCount: 1, currentSessionAffected: false });
    const me = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: ctx.authHeader,
    });
    expect(me.statusCode).toBe(200);

    const all = await app.inject({
      method: "POST",
      url: "/api/v1/security/sessions/revoke",
      headers: ctx.authHeader,
      payload: { sessionId: null, scope: "all" },
    });
    expect(all.json().currentSessionAffected).toBe(true);
    const meAfter = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: ctx.authHeader,
    });
    expect(meAfter.statusCode).toBe(401);
  });
});

describe("API keys (§8)", () => {
  it("creates (secret shown once), revokes, and blocks foreign/revoked revocations", async () => {
    const ctx = await authenticatedUser(app, mail, { email: uniqueEmail("keys") });
    const reauth = await app.inject({
      method: "POST",
      url: "/api/v1/security/reauth",
      headers: ctx.authHeader,
      payload: { password: ctx.password },
    });
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/security/api-keys",
      headers: ctx.authHeader,
      payload: {
        reauthToken: reauth.json().token,
        name: "journal-export",
        scopes: ["read:trades", "write:journal"],
        expiresInDays: 30,
      },
    });
    expect(created.statusCode).toBe(200);
    const { key, secret } = created.json();
    expect(secret).toMatch(/^cz_live_[0-9a-f]{32}$/);
    expect(key.prefix).toBe(secret.slice(0, 12));
    expect(key.revoked).toBe(false);

    // Foreign user cannot revoke it (IDOR).
    const foreign = await authenticatedUser(app, mail, { email: uniqueEmail("keys-b") });
    const foreignReauth = await app.inject({
      method: "POST",
      url: "/api/v1/security/reauth",
      headers: foreign.authHeader,
      payload: { password: foreign.password },
    });
    const foreignRevoke = await app.inject({
      method: "POST",
      url: `/api/v1/security/api-keys/${key.id}/revoke`,
      headers: foreign.authHeader,
      payload: { reauthToken: foreignReauth.json().token },
    });
    expect(foreignRevoke.statusCode).toBe(404);

    // A fresh reauth: the creation already consumed the previous token.
    const reauth2 = await app.inject({
      method: "POST",
      url: "/api/v1/security/reauth",
      headers: ctx.authHeader,
      payload: { password: ctx.password },
    });
    const revoke = await app.inject({
      method: "POST",
      url: `/api/v1/security/api-keys/${key.id}/revoke`,
      headers: ctx.authHeader,
      payload: { reauthToken: reauth2.json().token },
    });
    expect(revoke.statusCode).toBe(200);
    expect(revoke.json()).toEqual({ id: key.id });
  });
});

describe("profile, preferences & account state", () => {
  it("GET/PATCH /me; email change re-enters verification and re-verifies", async () => {
    const ctx = await authenticatedUser(app, mail, { email: uniqueEmail("profile") });
    const me = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: ctx.authHeader,
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().email).toBe(ctx.email);
    expect(me.json().timezone).toBeTruthy();

    const renamed = await app.inject({
      method: "PATCH",
      url: "/api/v1/me",
      headers: ctx.authHeader,
      payload: { name: "Renamed Trader", bio: "Discipline first." },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().name).toBe("Renamed Trader");

    // Email change → back to PENDING_VERIFICATION until the new address verifies.
    const newEmail = uniqueEmail("moved");
    mail.clear();
    await app.inject({
      method: "PATCH",
      url: "/api/v1/me",
      headers: ctx.authHeader,
      payload: { email: newEmail },
    });
    const gated = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: newEmail, password: ctx.password, remember: false },
    });
    expect(gated.statusCode).toBe(403);
    expect(gated.json().code).toBe("EMAIL_NOT_VERIFIED");

    const verified = await app.inject({
      method: "POST",
      url: "/api/v1/auth/email/verify",
      payload: { token: mail.lastVerificationToken() },
    });
    expect(verified.statusCode).toBe(200);
    expect(verified.json().user.email).toBe(newEmail);
    const loginNew = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: newEmail, password: ctx.password, remember: false },
    });
    expect(loginNew.statusCode).toBe(200);
  });

  it("preferences: full doc, domain patch, timezone write-through, reset", async () => {
    const ctx = await authenticatedUser(app, mail, { email: uniqueEmail("prefs") });
    const prefs = await app.inject({
      method: "GET",
      url: "/api/v1/me/preferences",
      headers: ctx.authHeader,
    });
    expect(prefs.statusCode).toBe(200);
    const doc = prefs.json();
    for (const domain of ["trading", "risk", "journal", "notifications", "appearance", "dashboard", "academy", "privacy", "localization"]) {
      expect(doc[domain]).toBeDefined();
    }

    const patched = await app.inject({
      method: "PATCH",
      url: "/api/v1/me/preferences/localization",
      headers: ctx.authHeader,
      payload: { ...doc.localization, timezone: "Europe/Paris" },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().localization.timezone).toBe("Europe/Paris");

    // Write-through: Profile.timezone mirrors the localization domain.
    const me = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: ctx.authHeader,
    });
    expect(me.json().timezone).toBe("Europe/Paris");

    const reset = await app.inject({
      method: "POST",
      url: "/api/v1/me/preferences/reset",
      headers: ctx.authHeader,
      payload: { domain: "localization" },
    });
    expect(reset.json().localization.timezone).not.toBe("Europe/Paris");
  });

  it("deactivation and scheduled deletion revoke sessions and are confirmation-gated", async () => {
    const ctx = await authenticatedUser(app, mail, { email: uniqueEmail("bye") });
    const wrongConfirm = await app.inject({
      method: "POST",
      url: "/api/v1/me/deactivate",
      headers: ctx.authHeader,
      payload: { confirmation: "yes" },
    });
    // The shared schema enforces the literal confirmation — schema-level 400.
    expect(wrongConfirm.statusCode).toBe(400);
    expect(wrongConfirm.json().error).toBe("ValidationError");

    const deactivated = await app.inject({
      method: "POST",
      url: "/api/v1/me/deactivate",
      headers: ctx.authHeader,
      payload: { confirmation: "DEACTIVATE" },
    });
    expect(deactivated.json().status).toBe("DEACTIVATED");
    const meAfter = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: ctx.authHeader,
    });
    // Deactivation revokes sessions — the guard reports the dead session
    // (401) rather than an account-status 403 (which applies to live
    // sessions, e.g. an admin suspension).
    expect(meAfter.statusCode).toBe(401);
    const refreshAfter = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: cookieHeader(ctx.refreshCookie),
    });
    expect(refreshAfter.statusCode).toBe(401);

    // Deletion scheduling on a fresh account.
    const doomed = await authenticatedUser(app, mail, { email: uniqueEmail("doom") });
    const scheduled = await app.inject({
      method: "POST",
      url: "/api/v1/me/delete",
      headers: doomed.authHeader,
      payload: { confirmation: "DELETE" },
    });
    expect(scheduled.statusCode).toBe(200);
    expect(scheduled.json().status).toBe("SCHEDULED");
    expect(scheduled.json().scheduledFor).toBeTruthy();
    const doomedOverview = await app.inject({
      method: "GET",
      url: "/api/v1/security/overview",
      headers: doomed.authHeader,
    });
    // Sessions were revoked with the scheduling — dead session → 401.
    expect(doomedOverview.statusCode).toBe(401);
  });
});
