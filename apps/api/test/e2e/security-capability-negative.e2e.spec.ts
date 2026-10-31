/**
 * e2e - Negative capability & IDOR hardening for the Security context
 * (Phase 16 §43/§44).
 *
 * Explicitly verifies what the Security API can NEVER do: leak credential
 * or token material, mutate security history, mutate roles/permissions,
 * mutate identity/MFA state directly, expose another user's security data,
 * or act as an owner of trading accounts. Every unauthorized operation
 * must fail closed.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { buildTestApp } from "../helpers/build-app";
import { authenticatedUser, captureMail, type MailCapture } from "../helpers/identity";

let app: NestFastifyApplication;
let mail: MailCapture;

beforeAll(async () => {
  app = await buildTestApp();
  mail = captureMail(app);
});

afterAll(async () => {
  await app?.close();
});

/** Wire material that must NEVER appear in any Security response. */
const SECRET_PATTERN =
  /passwordHash|mfaSecretEnc|mfaPendingSecretEnc|refreshTokenHash|"refreshToken"|"recoveryCodes":|"secret"|\$argon2|tokenHash|"code":\s*"\d{6}"/;

async function injectJson(
  authHeader: Record<string, string> | undefined,
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  url: string,
  payload?: object,
) {
  const res = await app.inject({
    method,
    url,
    headers: authHeader,
    ...(payload !== undefined ? { payload } : {}),
  });
  return { status: res.statusCode, body: res.json(), raw: res.body };
}

describe("security responses never carry secret material (§27/§46)", () => {
  it("overview, events and logins are credential-free", async () => {
    const a = await authenticatedUser(app, mail);
    const reads = [
      "/api/v1/security/overview",
      "/api/v1/security/events?limit=100",
      "/api/v1/security/logins?limit=100",
    ];
    for (const url of reads) {
      const res = await injectJson(a.authHeader, "GET", url);
      expect(res.status, url).toBe(200);
      expect(SECRET_PATTERN.test(res.raw), `secret leak in ${url}: ${res.raw.slice(0, 400)}`).toBe(false);
    }
  });

  it("does not expose the TOTP secret or codes outside the one-time enrollment flow", async () => {
    const a = await authenticatedUser(app, mail);
    const reauth = await injectJson(a.authHeader, "POST", "/api/v1/security/reauth", {
      password: a.password,
    });
    expect(reauth.status).toBe(200);

    // GET endpoints never re-reveal enrollment material.
    const overview = await injectJson(a.authHeader, "GET", "/api/v1/security/overview");
    expect(SECRET_PATTERN.test(overview.raw)).toBe(false);
  });
});

describe("security cannot escalate identity state (§44)", () => {
  it("has no role, permission or token-minting surface (404)", async () => {
    const a = await authenticatedUser(app, mail);
    for (const [method, url] of [
      ["POST", "/api/v1/security/role"],
      ["PATCH", "/api/v1/security/role"],
      ["POST", "/api/v1/security/permissions"],
      ["POST", "/api/v1/security/tokens"],
      ["POST", "/api/v1/security/refresh"],
      ["POST", "/api/v1/security/password-hash"],
    ] as const) {
      const res = await injectJson(a.authHeader, method, url, { role: "ADMIN" });
      expect(res.status, `${method} ${url}`).toBe(404);
    }
  });

  it("ignores role/permission injection attempts on security mutations", async () => {
    const a = await authenticatedUser(app, mail);
    const res = await injectJson(a.authHeader, "POST", "/api/v1/security/sessions/revoke", {
      sessionId: null,
      scope: "others",
      // Mass-assignment attempts - Zod schemas strip unknown keys.
      role: "ADMIN",
      permissions: ["*"],
      passwordHash: "$argon2id$attacker",
      mfaSecretEnc: "attacker-controlled",
    });
    expect(res.status).toBe(200);

    const me = await injectJson(a.authHeader, "GET", "/api/v1/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user.roles).toEqual(["TRADER"]);
    expect(SECRET_PATTERN.test(res.raw)).toBe(false);
  });

  it("keeps overview free of authorization data", async () => {
    const a = await authenticatedUser(app, mail);
    const overview = await injectJson(a.authHeader, "GET", "/api/v1/security/overview");
    expect(overview.body.role).toBeUndefined();
    expect(overview.body.permissions).toBeUndefined();
  });
});

describe("security does not own trading accounts or integrations (§23/§24)", () => {
  it("exposes no account/trade mutation surface (404)", async () => {
    const a = await authenticatedUser(app, mail);
    for (const [method, url] of [
      ["GET", "/api/v1/security/accounts"],
      ["POST", "/api/v1/security/accounts"],
      ["POST", "/api/v1/security/accounts/acc-1/sync"],
      ["POST", "/api/v1/security/trades"],
      ["PATCH", "/api/v1/security/trades/trade-1"],
      ["POST", "/api/v1/security/integrations"],
    ] as const) {
      const res = await injectJson(a.authHeader, method, url, {});
      expect(res.status, `${method} ${url}`).toBe(404);
    }
  });

  it("keeps connectedAccounts a projection slot - never raw credentials", async () => {
    const a = await authenticatedUser(app, mail);
    const overview = await injectJson(a.authHeader, "GET", "/api/v1/security/overview");
    expect(Array.isArray(overview.body.connectedAccounts)).toBe(true);
    // A projection of connection metadata, not a vault - the schema forbids
    // secrets here and the Integrations context does not exist server-side yet.
    for (const account of overview.body.connectedAccounts) {
      expect(Object.keys(account)).not.toContain("credentials");
      expect(Object.keys(account)).not.toContain("credential");
    }
  });
});

describe("security data is ownership-scoped (§32)", () => {
  it("only ever returns the caller's own security aggregate", async () => {
    const a = await authenticatedUser(app, mail);
    const b = await authenticatedUser(app, mail);

    const overviewA = await injectJson(a.authHeader, "GET", "/api/v1/security/overview");
    const overviewB = await injectJson(b.authHeader, "GET", "/api/v1/security/overview");
    expect(overviewA.body.auth.email).toBe(a.email);
    expect(overviewB.body.auth.email).toBe(b.email);
    expect(JSON.stringify(overviewA.body)).not.toContain(b.email);
    expect(JSON.stringify(overviewB.body)).not.toContain(a.email);

    // Forged ids on protected mutations stay not-found, not leaked (§43).
    const forged = await injectJson(a.authHeader, "POST", "/api/v1/security/api-keys/00000000-0000-4000-8000-000000000000/revoke", {});
    expect([401, 404]).toContain(forged.status); // missing reauth → 401 first (fail closed)

    const forgedWithReauth = await injectJson(a.authHeader, "POST", "/api/v1/security/api-keys/00000000-0000-4000-8000-000000000000/revoke", {
      reauthToken: "reauth_forged_token",
    });
    expect(forgedWithReauth.status).toBe(401); // foreign/unknown reauth token consumed nothing
  });
});
