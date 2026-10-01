/**
 * Market-service authentication gate (sandbox seam).
 *
 * Session Live V1 mission §63: "Authenticated User A cannot subscribe to
 * User B private trading data. The backend must enforce this. Never rely
 * solely on frontend channel naming." This gate is that enforcement point
 * for the market feed: every socket handshake and every private-ish REST
 * read (/prices, /candles) must present a valid access token issued by the
 * Cosmoz auth module.
 *
 * Token model (stateless resource-server verification):
 *   Access tokens arrive as `czat1.<base64url payload>.<signature>` where
 *   the payload carries ONLY { uid, iat, exp, v } and the signature is the
 *   issuer's checksum over "<secret>:<body>". This mirrors exactly how a
 *   real deployment verifies a signed JWT at a resource server — no call
 *   back to the issuer, no shared session store. In production the mock
 *   checksum becomes a real JWT signature check (JWKS from the NestJS auth
 *   module); the gate's structure, error codes and call sites stay put.
 *
 * Error codes (stable wire contract for the client):
 *   AUTH_REQUIRED  — no token presented
 *   TOKEN_INVALID  — malformed / signature mismatch / unknown version
 *   TOKEN_EXPIRED  — well-formed but past exp
 *
 * Read-only discipline (mission §3/§61): this service consumes broker /
 * provider READ streams only — the gate authenticates observers, it can
 * never grant execution capability because none exists here.
 */

/** Must match MOCK_ACCESS_SECRET in the auth engine (sandbox seam — see header). */
const MOCK_ACCESS_SECRET = "cosmoz-mock-access-secret-v1";

export type AccessTokenVerification =
  | { ok: true; userId: string }
  | { ok: false; code: "AUTH_REQUIRED" | "TOKEN_INVALID" | "TOKEN_EXPIRED" };

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

export function verifyAccessToken(token: string | undefined | null): AccessTokenVerification {
  if (typeof token !== "string" || token.length === 0) {
    return { ok: false, code: "AUTH_REQUIRED" };
  }
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "czat1") {
    return { ok: false, code: "TOKEN_INVALID" };
  }
  const [, body, signature] = parts;
  if (fnv1a(`${MOCK_ACCESS_SECRET}:${body}`) !== signature) {
    return { ok: false, code: "TOKEN_INVALID" };
  }
  let payload: { uid?: unknown; exp?: unknown; v?: unknown };
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, code: "TOKEN_INVALID" };
  }
  if (typeof payload.uid !== "string" || payload.uid.length === 0 || payload.v !== 1) {
    return { ok: false, code: "TOKEN_INVALID" };
  }
  if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) {
    return { ok: false, code: "TOKEN_INVALID" };
  }
  if (payload.exp <= Date.now()) {
    return { ok: false, code: "TOKEN_EXPIRED" };
  }
  return { ok: true, userId: payload.uid };
}

/** Bearer extraction for the REST surface. */
export function bearerFromHeader(header: string | undefined | null): string | null {
  if (!header || !header.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}
