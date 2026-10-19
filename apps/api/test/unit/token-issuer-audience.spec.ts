/**
 * Regression — JWT issuer/audience pinning (security-audit 2026-10-19, §1.8).
 *
 * The access-token contract is now: signature + exp + iss + aud. A token
 * signed with the SAME secret but a different issuer or audience must be
 * REJECTED — the mock had no such pinning; the real backend does.
 */

import { describe, expect, it } from "vitest";
import { JwtService } from "@nestjs/jwt";

import { TokenService } from "../../src/modules/identity/token.service";

const AUTH_CONFIG = {
  jwtSecret: "unit-test-secret-0123456789-0123456789-0123456789",
  jwtIssuer: "cosmoz-api",
  jwtAudience: "cosmoz-web",
  accessTtlSeconds: 900,
};

function makeService(): TokenService {
  const jwt = new JwtService({ secret: AUTH_CONFIG.jwtSecret });
  return new TokenService(jwt, { auth: AUTH_CONFIG } as never);
}

describe("access-token issuer/audience pinning", () => {
  it("verifies a token it signed (same issuer + audience)", async () => {
    const service = makeService();
    const { token } = await service.signAccessToken("user-1", "session-1");
    const payload = await service.verifyAccessToken(token);
    expect(payload).toEqual({ sub: "user-1", sid: "session-1" });
  });

  it("REJECTS a same-secret token minted for a foreign issuer", async () => {
    const service = makeService();
    const rogue = new JwtService({ secret: AUTH_CONFIG.jwtSecret });
    const forged = await rogue.signAsync(
      { sub: "user-1", sid: "session-1" },
      { expiresIn: 900, issuer: "evil-issuer", audience: "cosmoz-web" },
    );
    await expect(service.verifyAccessToken(forged)).rejects.toThrow();
  });

  it("REJECTS a same-secret token minted for a foreign audience", async () => {
    const service = makeService();
    const rogue = new JwtService({ secret: AUTH_CONFIG.jwtSecret });
    const forged = await rogue.signAsync(
      { sub: "user-1", sid: "session-1" },
      { expiresIn: 900, issuer: "cosmoz-api", audience: "evil-audience" },
    );
    await expect(service.verifyAccessToken(forged)).rejects.toThrow();
  });

  it("REJECTS a same-secret token with NO issuer/audience claims", async () => {
    const service = makeService();
    const rogue = new JwtService({ secret: AUTH_CONFIG.jwtSecret });
    const legacy = await rogue.signAsync(
      { sub: "user-1", sid: "session-1" },
      { expiresIn: 900 },
    );
    await expect(service.verifyAccessToken(legacy)).rejects.toThrow();
  });
});
