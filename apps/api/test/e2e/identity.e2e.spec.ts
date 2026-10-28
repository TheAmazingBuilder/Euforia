/**
 * e2e - Identity & Authentication (Phase 2 §41–§44 negative testing).
 * Register → verify → login → refresh (rotation + reuse) → logout,
 * password reset, status gates, anti-enumeration, rate limits.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { buildTestApp } from "../helpers/build-app";
import { MailerService } from "../../src/modules/identity/mailer.service";
import { IdentityRepository } from "../../src/modules/identity/identity.repository";
import {
  authenticatedUser,
  captureMail,
  cookieHeader,
  PASSWORD,
  refreshCookieOf,
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

describe("registration & email verification", () => {
  it("registers a user - PENDING_VERIFICATION, no token leaked, delivery EMAIL", async () => {
    mail.clear();
    const email = uniqueEmail();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "Ada Trader", email, password: PASSWORD },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe("PENDING_VERIFICATION");
    expect(body.delivery).toBe("EMAIL");
    // SECURITY: the real backend NEVER returns verificationToken (§10).
    expect(body.verificationToken).toBeUndefined();
    // The email WAS sent through the transport (captured in test).
    expect(mail.messages.some((m) => m.kind === "EMAIL_VERIFICATION" && m.to === email)).toBe(true);
    expect(body.user.email).toBe(email);
    expect(body.user.roles).toEqual(["TRADER"]);
    expect(JSON.stringify(body)).not.toContain("passwordHash");
  });

  it("cleans up an undelivered verification token and allows resend after SMTP recovers", async () => {
    const mailer = app.get(MailerService);
    const email = uniqueEmail("smtp-retry");
    mailer.useTransport({
      send: async () => {
        throw new Error("simulated SMTP outage");
      },
    });

    const failedRegistration = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "Retry User", email, password: PASSWORD },
    });
    expect(failedRegistration.statusCode).toBe(201);
    expect(failedRegistration.json().status).toBe("PENDING_VERIFICATION");
    expect(failedRegistration.json().verificationExpiresAt).toBeNull();
    expect(failedRegistration.json().verificationToken).toBeUndefined();

    // The pending account remains recoverable; a retry delivers a fresh link.
    mailer.useTransport({ send: async (message) => { mail.messages.push(message); } });
    const resend = await app.inject({
      method: "POST",
      url: "/api/v1/auth/email/resend",
      payload: { email },
    });
    expect(resend.statusCode).toBe(202);
    expect(mail.messages.some((message) => message.kind === "EMAIL_VERIFICATION" && message.to === email)).toBe(true);
    expect(resend.json().verificationExpiresAt).toBeNull();
  });

  it("keeps verification resend anti-enumeration-safe when SMTP is unavailable", async () => {
    const email = uniqueEmail("smtp-resend");
    const registered = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "Resend User", email, password: PASSWORD },
    });
    expect(registered.statusCode).toBe(201);
    const previouslyDeliveredToken = mail.lastVerificationToken();

    const mailer = app.get(MailerService);
    mailer.useTransport({ send: async () => { throw new Error("simulated SMTP outage"); } });
    const failedDelivery = await app.inject({
      method: "POST",
      url: "/api/v1/auth/email/resend",
      payload: { email },
    });
    mailer.useTransport({ send: async (message) => { mail.messages.push(message); } });

    expect(failedDelivery.statusCode).toBe(202);
    expect(failedDelivery.json().sent).toBe(true);
    expect(failedDelivery.json().verificationExpiresAt).toBeNull();

    // A failed resend must not invalidate the verification link already sent.
    const verified = await app.inject({
      method: "POST",
      url: "/api/v1/auth/email/verify",
      payload: { token: previouslyDeliveredToken },
    });
    expect(verified.statusCode).toBe(200);
  });

  it("does not reactivate a suspended account with an old verification link", async () => {
    const email = uniqueEmail("suspended-verification");
    const registered = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "Pending User", email, password: PASSWORD },
    });
    expect(registered.statusCode).toBe(201);
    const token = mail.lastVerificationToken();
    const user = await app.get(IdentityRepository).findUserByEmail(email);
    expect(user).toBeTruthy();
    await app.get(IdentityRepository).updateUser(user!.id, { status: "SUSPENDED" });

    const verified = await app.inject({
      method: "POST",
      url: "/api/v1/auth/email/verify",
      payload: { token },
    });
    expect(verified.statusCode).toBe(400);
    expect(verified.json().code).toBe("INVALID_TOKEN");
    expect((await app.get(IdentityRepository).findUserByEmail(email))?.status).toBe("SUSPENDED");
  });

  it("applies the same resend rate-limit response to known and unknown addresses", async () => {
    const email = uniqueEmail("resend-rate-limit");
    const registered = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "Pending User", email, password: PASSWORD },
    });
    expect(registered.statusCode).toBe(201);
    const unknownEmail = uniqueEmail("unknown-resend-rate-limit");

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const known = await app.inject({
        method: "POST",
        url: "/api/v1/auth/email/resend",
        payload: { email },
      });
      const unknown = await app.inject({
        method: "POST",
        url: "/api/v1/auth/email/resend",
        payload: { email: unknownEmail },
      });
      expect(known.statusCode).toBe(202);
      expect(unknown.statusCode).toBe(202);
    }

    const [knownLimited, unknownLimited] = await Promise.all([
      app.inject({ method: "POST", url: "/api/v1/auth/email/resend", payload: { email } }),
      app.inject({ method: "POST", url: "/api/v1/auth/email/resend", payload: { email: unknownEmail } }),
    ]);
    expect(knownLimited.statusCode).toBe(429);
    expect(unknownLimited.statusCode).toBe(429);
    expect(knownLimited.json().code).toBe(unknownLimited.json().code);
  });

  it("prevents stale links from verifying a changed email and recovers after SMTP failure", async () => {
    const ctx = await authenticatedUser(app, mail);
    const oldToken = IdentityRepository.randomToken(24);
    await app.get(IdentityRepository).createChallenge({
      userId: ctx.userId,
      purpose: "EMAIL_VERIFICATION",
      tokenHash: IdentityRepository.hashToken(oldToken),
      targetEmail: ctx.email,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const newEmail = uniqueEmail("email-change-smtp");
    const mailer = app.get(MailerService);
    mailer.useTransport({ send: async () => { throw new Error("simulated SMTP outage"); } });
    const change = await app.inject({
      method: "PATCH",
      url: "/api/v1/me",
      headers: ctx.authHeader,
      payload: { email: newEmail },
    });
    mailer.useTransport({ send: async (message) => { mail.messages.push(message); } });
    expect(change.statusCode).toBeGreaterThanOrEqual(500);

    const oldLink = await app.inject({
      method: "POST",
      url: "/api/v1/auth/email/verify",
      payload: { token: oldToken },
    });
    expect(oldLink.statusCode).toBe(400);
    expect(oldLink.json().code).toBe("INVALID_TOKEN");
    const pendingUser = await app.get(IdentityRepository).findUserByEmail(newEmail);
    expect(pendingUser?.status).toBe("PENDING_VERIFICATION");

    // Simulate a concurrent stale challenge that survived cleanup: the token
    // must still be rejected because it was issued for the previous address.
    const staleConcurrentToken = IdentityRepository.randomToken(24);
    await app.get(IdentityRepository).createChallenge({
      userId: ctx.userId,
      purpose: "EMAIL_VERIFICATION",
      tokenHash: IdentityRepository.hashToken(staleConcurrentToken),
      targetEmail: ctx.email,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const staleConcurrentLink = await app.inject({
      method: "POST",
      url: "/api/v1/auth/email/verify",
      payload: { token: staleConcurrentToken },
    });
    expect(staleConcurrentLink.statusCode).toBe(400);
    expect(staleConcurrentLink.json().code).toBe("INVALID_TOKEN");

    const resend = await app.inject({
      method: "POST",
      url: "/api/v1/auth/email/resend",
      payload: { email: newEmail },
    });
    expect(resend.statusCode).toBe(202);
    const newToken = mail.lastVerificationToken();
    const staleSameAddressToken = IdentityRepository.randomToken(24);
    await app.get(IdentityRepository).createChallenge({
      userId: ctx.userId,
      purpose: "EMAIL_VERIFICATION",
      tokenHash: IdentityRepository.hashToken(staleSameAddressToken),
      targetEmail: newEmail,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const verified = await app.inject({
      method: "POST",
      url: "/api/v1/auth/email/verify",
      payload: { token: newToken },
    });
    expect(verified.statusCode).toBe(200);
    expect(verified.json().user.email).toBe(newEmail);
    const staleSameAddress = await app.inject({
      method: "POST",
      url: "/api/v1/auth/email/verify",
      payload: { token: staleSameAddressToken },
    });
    expect(staleSameAddress.statusCode).toBe(400);
    expect(staleSameAddress.json().code).toBe("INVALID_TOKEN");
  });

  it("rejects weak passwords at the contract level", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "Shorty", email: uniqueEmail(), password: "short" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("ValidationError");
  });

  it("rejects duplicate email with 409 EMAIL_ALREADY_USED", async () => {
    const email = uniqueEmail();
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "First", email, password: PASSWORD },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "Second", email, password: PASSWORD },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("EMAIL_ALREADY_USED");
  });

  it("blocks login before verification (403 EMAIL_NOT_VERIFIED)", async () => {
    const email = uniqueEmail();
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "Pending", email, password: PASSWORD },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password: PASSWORD, remember: true },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("EMAIL_NOT_VERIFIED");
  });

  it("verifies the email exactly once (replay → TOKEN_ALREADY_USED, garbage → INVALID_TOKEN)", async () => {
    mail.clear();
    const email = uniqueEmail();
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "Once", email, password: PASSWORD },
    });
    const token = mail.lastVerificationToken();

    // A valid token for one purpose must never be accepted by another flow.
    const wrongPurpose = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password/reset",
      payload: { token, password: PASSWORD },
    });
    expect(wrongPurpose.statusCode).toBe(400);
    expect(wrongPurpose.json().code).toBe("INVALID_TOKEN");

    const first = await app.inject({
      method: "POST",
      url: "/api/v1/auth/email/verify",
      payload: { token },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().user.status).toBe("ACTIVE");

    const replay = await app.inject({
      method: "POST",
      url: "/api/v1/auth/email/verify",
      payload: { token },
    });
    expect(replay.statusCode).toBe(400);
    expect(replay.json().code).toBe("TOKEN_ALREADY_USED");

    const garbage = await app.inject({
      method: "POST",
      url: "/api/v1/auth/email/verify",
      payload: { token: "totally-invalid-token-value" },
    });
    expect(garbage.statusCode).toBe(400);
    expect(garbage.json().code).toBe("INVALID_TOKEN");
  });

  it("resend: pending user gets a new mail; verified/unknown emails are indistinguishable", async () => {
    const pendingEmail = uniqueEmail();
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "Pending", email: pendingEmail, password: PASSWORD },
    });
    mail.clear();
    const pending = await app.inject({
      method: "POST",
      url: "/api/v1/auth/email/resend",
      payload: { email: pendingEmail },
    });
    expect(pending.statusCode).toBe(202);
    expect(pending.json().verificationToken).toBeUndefined();
    expect(pending.json().verificationExpiresAt).toBeNull();

    const unknown = await app.inject({
      method: "POST",
      url: "/api/v1/auth/email/resend",
      payload: { email: uniqueEmail() },
    });
    expect(unknown.statusCode).toBe(202);
    expect(unknown.json().verificationExpiresAt).toBeNull();
  });
});

describe("login & anti-enumeration", () => {
  it("unknown email and wrong password produce IDENTICAL 401 responses", async () => {
    const email = uniqueEmail();
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "Known", email, password: PASSWORD },
    });

    const unknown = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "who-is-this@test.cosmoz.dev", password: PASSWORD, remember: false },
    });
    const wrong = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password: "wrong-password-999", remember: false },
    });
    expect(unknown.statusCode).toBe(401);
    expect(wrong.statusCode).toBe(401);
    expect(unknown.json().code).toBe("INVALID_CREDENTIALS");
    expect(wrong.json().code).toBe("INVALID_CREDENTIALS");
    // Identical envelope minus the per-request correlation id (§11).
    const strip = (body: { error?: string; code?: string; message?: string }) =>
      JSON.stringify({ error: body.error, code: body.code, message: body.message });
    expect(strip(unknown.json())).toBe(strip(wrong.json()));
  });

  it("login issues an HttpOnly refresh cookie + access token + session", async () => {
    const ctx = await authenticatedUser(app, mail, { remember: false });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: ctx.email, password: ctx.password, remember: true },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.outcome).toBe("AUTHENTICATED");
    expect(body.accessToken.length).toBeGreaterThan(20);
    expect(body.session.current).toBe(true);
    const rawCookie = String(res.headers["set-cookie"]);
    expect(rawCookie).toContain("cosmoz_rt=");
    expect(rawCookie).toContain("HttpOnly");
    expect(rawCookie).toContain("SameSite=Lax");
    expect(rawCookie).toContain("Max-Age=");
    expect(body.session.ipMasked).toMatch(/^127\.0\.0\.x$|^unknown$/);
  });
});

describe("email-based two-factor authentication", () => {
  it("allows email MFA enrollment to retry after SMTP failure", async () => {
    mail.clear();
    const ctx = await authenticatedUser(app, mail);
    const mailer = app.get(MailerService);
    const firstReauth = await app.inject({
      method: "POST",
      url: "/api/v1/security/reauth",
      headers: ctx.authHeader,
      payload: { password: ctx.password },
    });
    mailer.useTransport({ send: async () => { throw new Error("simulated SMTP outage"); } });
    const failed = await app.inject({
      method: "POST",
      url: "/api/v1/security/2fa/email/enable",
      headers: ctx.authHeader,
      payload: { reauthToken: firstReauth.json().token },
    });
    mailer.useTransport({ send: async (message) => { mail.messages.push(message); } });
    expect(failed.statusCode).toBeGreaterThanOrEqual(500);

    const secondReauth = await app.inject({
      method: "POST",
      url: "/api/v1/security/reauth",
      headers: ctx.authHeader,
      payload: { password: ctx.password },
    });
    const enabled = await app.inject({
      method: "POST",
      url: "/api/v1/security/2fa/email/enable",
      headers: ctx.authHeader,
      payload: { reauthToken: secondReauth.json().token },
    });
    expect(enabled.statusCode).toBe(200);
    const code = [...mail.messages].reverse().find((item) => item.kind === "MFA_EMAIL_CODE")?.code;
    expect(code).toMatch(/^\d{6}$/);
    const confirmed = await app.inject({
      method: "POST",
      url: "/api/v1/security/2fa/email/confirm",
      headers: ctx.authHeader,
      payload: { code },
    });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json().state).toMatchObject({ enabled: true, method: "EMAIL" });
  });

  it("enables email MFA, sends a short-lived code at login, and consumes the challenge once", async () => {
    mail.clear();
    const ctx = await authenticatedUser(app, mail);
    const reauth = await app.inject({
      method: "POST",
      url: "/api/v1/security/reauth",
      headers: ctx.authHeader,
      payload: { password: ctx.password },
    });
    expect(reauth.statusCode).toBe(200);
    const reauthToken = reauth.json().token as string;
    expect(reauthToken).toBeTruthy();

    const enabled = await app.inject({
      method: "POST",
      url: "/api/v1/security/2fa/email/enable",
      headers: ctx.authHeader,
      payload: { reauthToken },
    });
    expect(enabled.statusCode).toBe(200);
    expect(enabled.json()).toMatchObject({ pending: true });
    expect(enabled.json().expiresAt).toBeTruthy();

    // Enrollment is pending until the user proves access to the mailbox.
    const enrollmentMessage = [...mail.messages].reverse().find((item) => item.kind === "MFA_EMAIL_CODE");
    expect(enrollmentMessage?.to).toBe(ctx.email);
    expect(enrollmentMessage?.code).toMatch(/^\\d{6}$/);
    const confirmed = await app.inject({
      method: "POST",
      url: "/api/v1/security/2fa/email/confirm",
      headers: ctx.authHeader,
      payload: { code: enrollmentMessage?.code },
    });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json().state).toMatchObject({
      enabled: true,
      method: "EMAIL",
      recoveryCodesRemaining: 10,
    });
    expect(confirmed.json().recoveryCodes).toHaveLength(10);

    mail.clear();
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: ctx.email, password: ctx.password, remember: false },
    });
    expect(login.statusCode).toBe(200);
    const challenge = login.json();
    expect(challenge).toMatchObject({ outcome: "MFA_REQUIRED", method: "EMAIL" });
    expect(challenge.challengeToken).toBeTruthy();

    const message = [...mail.messages].reverse().find((item) => item.kind === "MFA_EMAIL_CODE");
    expect(message?.to).toBe(ctx.email);
    expect(message?.code).toMatch(/^\d{6}$/);

    // Two concurrent completions for one persistent challenge must yield
    // exactly one authenticated session.
    const concurrent = await Promise.all([
      app.inject({
        method: "POST",
        url: "/api/v1/auth/mfa/challenge",
        payload: { challengeToken: challenge.challengeToken, code: message?.code },
      }),
      app.inject({
        method: "POST",
        url: "/api/v1/auth/mfa/challenge",
        payload: { challengeToken: challenge.challengeToken, code: message?.code },
      }),
    ]);
    expect(concurrent.filter((response) => response.statusCode === 200)).toHaveLength(1);
    expect(concurrent.filter((response) => response.statusCode === 401)).toHaveLength(1);
    expect(concurrent.find((response) => response.statusCode === 200)?.json().outcome).toBe("AUTHENTICATED");
    expect(concurrent.find((response) => response.statusCode === 401)?.json().code).toBe("INVALID_CHALLENGE");

    const replay = await app.inject({
      method: "POST",
      url: "/api/v1/auth/mfa/challenge",
      payload: { challengeToken: challenge.challengeToken, code: message?.code },
    });
    expect(replay.statusCode).toBe(401);
    expect(replay.json().code).toBe("INVALID_CHALLENGE");
  });

  it("preserves the last usable MFA challenge when a replacement email cannot be delivered", async () => {
    mail.clear();
    const ctx = await authenticatedUser(app, mail);
    const reauth = await app.inject({
      method: "POST",
      url: "/api/v1/security/reauth",
      headers: ctx.authHeader,
      payload: { password: ctx.password },
    });
    const enabled = await app.inject({
      method: "POST",
      url: "/api/v1/security/2fa/email/enable",
      headers: ctx.authHeader,
      payload: { reauthToken: reauth.json().token },
    });
    expect(enabled.statusCode).toBe(200);
    const enrollmentCode = [...mail.messages].reverse().find((item) => item.kind === "MFA_EMAIL_CODE")?.code;
    const confirmed = await app.inject({
      method: "POST",
      url: "/api/v1/security/2fa/email/confirm",
      headers: ctx.authHeader,
      payload: { code: enrollmentCode },
    });
    expect(confirmed.statusCode).toBe(200);

    mail.clear();
    const firstLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: ctx.email, password: ctx.password, remember: false },
    });
    expect(firstLogin.statusCode).toBe(200);
    const firstChallenge = firstLogin.json();
    const firstCode = [...mail.messages].reverse().find((item) => item.kind === "MFA_EMAIL_CODE")?.code;
    expect(firstCode).toMatch(/^\d{6}$/);

    const mailer = app.get(MailerService);
    mailer.useTransport({ send: async () => { throw new Error("simulated SMTP outage"); } });
    const failedReplacement = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: ctx.email, password: ctx.password, remember: false },
    });
    mailer.useTransport({ send: async (message) => { mail.messages.push(message); } });
    expect(failedReplacement.statusCode).toBeGreaterThanOrEqual(500);

    const complete = await app.inject({
      method: "POST",
      url: "/api/v1/auth/mfa/challenge",
      payload: { challengeToken: firstChallenge.challengeToken, code: firstCode },
    });
    expect(complete.statusCode).toBe(200);
    expect(complete.json().outcome).toBe("AUTHENTICATED");
  });

  it("does not complete email MFA with an incorrect code", async () => {
    mail.clear();
    const ctx = await authenticatedUser(app, mail);
    const reauth = await app.inject({
      method: "POST",
      url: "/api/v1/security/reauth",
      headers: ctx.authHeader,
      payload: { password: ctx.password },
    });
    const enabled = await app.inject({
      method: "POST",
      url: "/api/v1/security/2fa/email/enable",
      headers: ctx.authHeader,
      payload: { reauthToken: reauth.json().token },
    });
    expect(enabled.statusCode).toBe(200);

    mail.clear();
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: ctx.email, password: ctx.password, remember: false },
    });
    const challenge = login.json();
    const issuedCode = [...mail.messages].reverse().find((item) => item.kind === "MFA_EMAIL_CODE")?.code;
    const wrongCode = issuedCode === "000000" ? "000001" : "000000";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const invalid = await app.inject({
        method: "POST",
        url: "/api/v1/auth/mfa/challenge",
        payload: { challengeToken: challenge.challengeToken, code: wrongCode },
      });
      expect(invalid.statusCode).toBe(401);
      expect(invalid.json().code).toBe("INVALID_MFA_CODE");
    }

    const lockedChallenge = await app.inject({
      method: "POST",
      url: "/api/v1/auth/mfa/challenge",
      payload: { challengeToken: challenge.challengeToken, code: issuedCode },
    });
    expect(lockedChallenge.statusCode).toBe(401);
    expect(lockedChallenge.json().code).toBe("INVALID_CHALLENGE");
  });
});

describe("me / refresh rotation / reuse detection / logout", () => {
  it("/auth/me requires a bearer token and returns user+session", async () => {
    const ctx = await authenticatedUser(app, mail);
    const anon = await app.inject({ method: "GET", url: "/api/v1/auth/me" });
    expect(anon.statusCode).toBe(401);
    expect(anon.json().code).toBe("INVALID_TOKEN");

    const me = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: ctx.authHeader,
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.id).toBe(ctx.userId);
    expect(me.json().session.current).toBe(true);
  });

  it("refresh rotates the cookie; reusing the OLD token revokes ALL sessions", async () => {
    const ctx = await authenticatedUser(app, mail);
    const refreshed = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: cookieHeader(ctx.refreshCookie),
    });
    expect(refreshed.statusCode).toBe(200);
    const newCookie = refreshCookieOf(refreshed);
    expect(newCookie).not.toBe(ctx.refreshCookie);
    expect(refreshed.json().user.id).toBe(ctx.userId);

    // REUSE of the pre-rotation token → everything revoked (§13).
    const reuse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: cookieHeader(ctx.refreshCookie),
    });
    expect(reuse.statusCode).toBe(401);
    expect(reuse.json().code).toBe("INVALID_TOKEN");

    // The post-rotation token is dead too - the family was revoked.
    const afterReuse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: cookieHeader(newCookie),
    });
    expect(afterReuse.statusCode).toBe(401);

    // And the access token no longer authenticates (session revoked).
    const me = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: ctx.authHeader,
    });
    expect(me.statusCode).toBe(401);
  });

  it("logout revokes the session server-side and clears the cookie", async () => {
    const ctx = await authenticatedUser(app, mail);
    const out = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: cookieHeader(ctx.refreshCookie),
    });
    expect(out.statusCode).toBe(200);
    expect(out.json()).toEqual({ loggedOut: true });
    expect(String(out.headers["set-cookie"])).toContain("Max-Age=0");

    const refresh = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: cookieHeader(ctx.refreshCookie),
    });
    expect(refresh.statusCode).toBe(401);

    // Logout without a cookie still succeeds (contract §15).
    const anon = await app.inject({ method: "POST", url: "/api/v1/auth/logout" });
    expect(anon.statusCode).toBe(200);
  });

  it("garbage refresh cookies are rejected", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: cookieHeader("not-a-token"),
    });
    expect(res.statusCode).toBe(401);
    const missing = await app.inject({ method: "POST", url: "/api/v1/auth/refresh" });
    expect(missing.statusCode).toBe(401);
    expect(missing.json().code).toBe("INVALID_TOKEN");
  });
});

describe("password reset (§22)", () => {
  it("forgot: known email sends mail; unknown email is indistinguishable", async () => {
    const ctx = await authenticatedUser(app, mail);
    mail.clear();
    const known = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password/forgot",
      payload: { email: ctx.email },
    });
    expect(known.statusCode).toBe(202);
    expect(known.json().sent).toBe(true);
    expect(known.json().resetToken).toBeUndefined();
    expect(known.json().resetExpiresAt).toBeNull();
    expect(mail.messages.some((m) => m.kind === "PASSWORD_RESET")).toBe(true);

    mail.clear();
    const unknown = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password/forgot",
      payload: { email: "ghost@test.cosmoz.dev" },
    });
    expect(unknown.statusCode).toBe(202);
    expect(unknown.json().resetExpiresAt).toBeNull();
    expect(mail.messages.length).toBe(0);
  });

  it("applies the same password-reset rate-limit response to known and unknown addresses", async () => {
    const ctx = await authenticatedUser(app, mail);
    const unknownEmail = uniqueEmail("unknown-reset-rate-limit");

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const known = await app.inject({
        method: "POST",
        url: "/api/v1/auth/password/forgot",
        payload: { email: ctx.email },
      });
      const unknown = await app.inject({
        method: "POST",
        url: "/api/v1/auth/password/forgot",
        payload: { email: unknownEmail },
      });
      expect(known.statusCode).toBe(202);
      expect(unknown.statusCode).toBe(202);
    }

    const [knownLimited, unknownLimited] = await Promise.all([
      app.inject({ method: "POST", url: "/api/v1/auth/password/forgot", payload: { email: ctx.email } }),
      app.inject({ method: "POST", url: "/api/v1/auth/password/forgot", payload: { email: unknownEmail } }),
    ]);
    expect(knownLimited.statusCode).toBe(429);
    expect(unknownLimited.statusCode).toBe(429);
    expect(knownLimited.json().code).toBe(unknownLimited.json().code);
  });

  it("SMTP failure does not invalidate the last delivered reset link or reveal account existence", async () => {
    const ctx = await authenticatedUser(app, mail);
    const mailer = app.get(MailerService);
    mail.clear();

    const first = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password/forgot",
      payload: { email: ctx.email },
    });
    expect(first.statusCode).toBe(202);
    const deliveredToken = mail.lastResetToken();

    mailer.useTransport({
      send: async () => {
        throw new Error("simulated SMTP outage");
      },
    });
    const failedDelivery = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password/forgot",
      payload: { email: ctx.email },
    });

    // Restore capture delivery even if the assertions below fail.
    mailer.useTransport({ send: async (message) => { mail.messages.push(message); } });
    expect(failedDelivery.statusCode).toBe(202);
    expect(failedDelivery.json().sent).toBe(true);
    expect(failedDelivery.json().resetExpiresAt).toBeNull();

    // Prove the earlier delivered token still works.
    const reset = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password/reset",
      payload: { token: deliveredToken, password: "recovered-password-45" },
    });
    expect(reset.statusCode).toBe(200);
  });

  it("reset changes the password, revokes sessions, and allows re-login", async () => {
    const ctx = await authenticatedUser(app, mail);
    mail.clear();
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/password/forgot",
      payload: { email: ctx.email },
    });
    const newPassword = "brand-new-password-42";
    const resetToken = mail.lastResetToken();

    const wrongPurpose = await app.inject({
      method: "POST",
      url: "/api/v1/auth/email/verify",
      payload: { token: resetToken },
    });
    expect(wrongPurpose.statusCode).toBe(400);
    expect(wrongPurpose.json().code).toBe("INVALID_TOKEN");

    // Simulate an older outstanding link left behind by a failed cleanup.
    const staleResetToken = IdentityRepository.randomToken(24);
    await app.get(IdentityRepository).createChallenge({
      userId: ctx.userId,
      purpose: "PASSWORD_RESET",
      tokenHash: IdentityRepository.hashToken(staleResetToken),
      expiresAt: new Date(Date.now() + 60_000),
    });

    // Two requests racing with the same token must not both succeed.
    const concurrent = await Promise.all([
      app.inject({
        method: "POST",
        url: "/api/v1/auth/password/reset",
        payload: { token: resetToken, password: newPassword },
      }),
      app.inject({
        method: "POST",
        url: "/api/v1/auth/password/reset",
        payload: { token: resetToken, password: "another-password-43" },
      }),
    ]);
    expect(concurrent.filter((response) => response.statusCode === 200)).toHaveLength(1);
    expect(concurrent.filter((response) => response.statusCode === 400)).toHaveLength(1);
    expect(concurrent.find((response) => response.statusCode === 200)?.json().resetAt).toBeTruthy();
    expect(concurrent.find((response) => response.statusCode === 400)?.json().code).toBe("TOKEN_ALREADY_USED");

    // Reset links remain single-use after the concurrent requests complete.
    const replay = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password/reset",
      payload: { token: resetToken, password: "third-password-44" },
    });
    expect(replay.statusCode).toBe(400);
    expect(replay.json().code).toBe("TOKEN_ALREADY_USED");

    const staleReset = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password/reset",
      payload: { token: staleResetToken, password: "fourth-password-45" },
    });
    expect(staleReset.statusCode).toBe(400);
    expect(staleReset.json().code).toBe("INVALID_TOKEN");

    // Old refresh chain revoked (defense in depth).
    const oldRefresh = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: cookieHeader(ctx.refreshCookie),
    });
    expect(oldRefresh.statusCode).toBe(401);

    // Old password rejected; new password accepted.
    const oldLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: ctx.email, password: ctx.password, remember: false },
    });
    expect(oldLogin.statusCode).toBe(401);
    const newLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: ctx.email, password: newPassword, remember: false },
    });
    expect(newLogin.statusCode).toBe(200);
  });
});

describe("brute-force protection (§36)", () => {
  it("6th failed login within the window → 429 RATE_LIMITED + Retry-After", async () => {
    const email = uniqueEmail();
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "Locked Out", email, password: PASSWORD },
    });
    for (let i = 0; i < 5; i += 1) {
      const bad = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email, password: "definitely-wrong-pass", remember: false },
      });
      expect(bad.statusCode).toBe(401);
    }
    const sixth = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password: PASSWORD, remember: false },
    });
    expect(sixth.statusCode).toBe(429);
    expect(sixth.json().code).toBe("RATE_LIMITED");
    expect(Number(sixth.headers["retry-after"])).toBeGreaterThan(0);
  });
});

describe("security events & login history are recorded (§30–§31)", () => {
  it("successful and failed logins land in the overview log", async () => {
    const ctx = await authenticatedUser(app, mail);
    // one deliberate failure
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: ctx.email, password: "nope-nope-nope-nope", remember: false },
    });
    const overview = await app.inject({
      method: "GET",
      url: "/api/v1/security/overview",
      headers: ctx.authHeader,
    });
    expect(overview.statusCode).toBe(200);
    const body = overview.json();
    expect(body.logins.some((l: { success: boolean }) => l.success)).toBe(true);
    expect(body.logins.some((l: { success: boolean }) => !l.success)).toBe(true);
    expect(body.events.some((e: { type: string }) => e.type === "LOGIN_SUCCESS")).toBe(true);
    expect(body.events.some((e: { type: string }) => e.type === "LOGIN_FAILED")).toBe(true);
    // No secrets in events (§30).
    const serialized = JSON.stringify(body).toLowerCase();
    expect(serialized).not.toContain(ctx.password);
    expect(serialized).not.toContain("passwordhash");
  });
});
