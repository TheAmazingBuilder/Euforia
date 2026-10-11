/**
 * Smoke test Phase 15 (Settings) — boots the REAL API against the dev DB,
 * walks a user through the Settings bounded context and asserts the
 * contract shapes: preferences doc provisioning, per-domain PATCH,
 * timezone write-through, reset, mass-assignment stripping, validation
 * 400s and deactivation. The verification token is read from the console
 * mail transport log. Secrets are injected via env (never committed).
 */
import { spawn } from "node:child_process";

const PORT = 4101;
const BASE = `http://127.0.0.1:${PORT}`;
const LOG = "/home/z/my-project/scripts/smoke15-server.log";

function assert(cond, label) {
  if (!cond) {
    console.error(`FAIL: ${label}`);
    process.exitCode = 1;
    server?.kill("SIGTERM");
    process.exit(1);
  }
  console.log(`ok: ${label}`);
}

let server;

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, json, headers: res.headers };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

server = spawn("node", ["--enable-source-maps", "dist/apps/api/src/main.js"], {
  cwd: "/home/z/my-project/apps/api",
  env: {
    ...process.env,
    PORT: String(PORT),
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://cosmoz@127.0.0.1:5433/cosmoz",
    CORS_ORIGINS: "http://localhost:3000",
    AUTH_JWT_SECRET: "smoke15-jwt-secret-0123456789abcdef0123456789",
    AUTH_MFA_ENCRYPTION_KEY: "h0mEbiEr05Qkg5f8Duz4PrOups2o69gGx+LIEdXAuvU=",
    ACCOUNTS_CREDENTIALS_ENCRYPTION_KEY: "Mck3U8lb0RHzT7eDlBd7hgmE5FpYm0ZOSJB3ZfA4GFo=",
    INTEGRATIONS_WEBHOOK_ENCRYPTION_KEY: "Y29zbW96LWludGVncmF0aW9ucy1rZXktMjAyNi10c3Q=",
    ACCOUNTS_MOCK_PROVIDER: "enabled",
    WEB_APP_URL: "http://localhost:3000",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
const mailLog = [];
server.stdout.on("data", (d) => {
  const s = d.toString();
  process.stdout.write(s);
  mailLog.push(s);
});
server.stderr.on("data", (d) => {
  process.stdout.write(d);
  mailLog.push(d.toString());
});
process.on("exit", () => server?.kill("SIGTERM"));

try {
  // 1. Health.
  let healthy = false;
  for (let i = 0; i < 80 && !healthy; i += 1) {
    try {
      const res = await fetch(`${BASE}/health`);
      healthy = res.ok;
    } catch {
      await sleep(250);
    }
  }
  assert(healthy, "boot + /health");

  // 2. Register + verify + login.
  const email = `smoke15-${Date.now()}@test.cosmoz.dev`;
  const reg = await api("POST", "/api/v1/auth/register", {
    body: { name: "Smoke 15", email, password: "correct-horse-battery" },
  });
  assert(reg.status === 201 && reg.json?.user?.id, "register 201");
  await sleep(400);
  const allLog = mailLog.join("");
  const tokenMatch = /token=([A-Za-z0-9_-]+)/.exec(allLog.split("auth/email/verify").at(-1) ?? allLog);
  assert(Boolean(tokenMatch), "verification token captured from console mail");
  const verify = await api("POST", "/api/v1/auth/email/verify", { body: { token: tokenMatch[1] } });
  assert(verify.status === 200, "email verified");
  const login = await api("POST", "/api/v1/auth/login", {
    body: { email, password: "correct-horse-battery", remember: false },
  });
  assert(login.status === 200 && login.json?.accessToken, "login 200");
  const auth = { token: login.json.accessToken };
  const userId = login.json.user.id;

  // 3. GET preferences — provisioned defaults, profile tz mirror.
  const prefs = await api("GET", "/api/v1/me/preferences", auth);
  assert(prefs.status === 200, "GET /me/preferences 200");
  const domains = ["trading", "risk", "journal", "notifications", "appearance", "dashboard", "academy", "privacy", "localization"];
  assert(domains.every((k) => prefs.json[k] !== undefined), "9 domains provisioned");
  assert(prefs.json.userId === userId, "envelope userId = principal (§10)");
  assert(prefs.json.localization.timezone === "UTC", "tz mirror = profile default UTC (§15)");

  // 4. PATCH localization — timezone write-through.
  const patched = await api("PATCH", "/api/v1/me/preferences/localization", {
    ...auth,
    body: { ...prefs.json.localization, timezone: "Europe/Paris" },
  });
  assert(patched.status === 200 && patched.json.localization.timezone === "Europe/Paris", "PATCH localization 200");
  const me = await api("GET", "/api/v1/me", auth);
  assert(me.json.timezone === "Europe/Paris", "write-through: profile tz = Europe/Paris (§15)");

  // 5. PATCH appearance — mass-assignment stripped.
  const appearance = await api("PATCH", "/api/v1/me/preferences/appearance", {
    ...auth,
    body: { theme: "LIGHT", density: "COMPACT", defaultDashboardLayout: "RISK_FIRST", pnlDisplay: "R_MULTIPLE", isAdmin: true, role: "ADMIN" },
  });
  assert(appearance.status === 200 && appearance.json.appearance.theme === "LIGHT", "PATCH appearance 200");
  assert(appearance.json.isAdmin === undefined && appearance.json.role === undefined, "privileged fields stripped (§31/§32)");

  // 6. Validation battery.
  const badDomain = await api("PATCH", "/api/v1/me/preferences/identity", { ...auth, body: { x: 1 } });
  assert(badDomain.status === 400, "unknown domain 400");
  const badEnum = await api("PATCH", "/api/v1/me/preferences/appearance", { ...auth, body: { theme: "NEON" } });
  assert(badEnum.status === 400, "invalid enum 400");
  const badTz = await api("PATCH", "/api/v1/me/preferences/localization", {
    ...auth,
    body: { ...prefs.json.localization, timezone: "Mars/Olympus" },
  });
  assert(badTz.status === 400, "invalid IANA timezone 400");
  const badRisk = await api("PATCH", "/api/v1/me/preferences/risk", {
    ...auth,
    body: { ...prefs.json.risk, defaultRiskPerTradePct: 5, maxRiskPerTradePct: 2 },
  });
  assert(badRisk.status === 400, "risk refine (max ≥ default) 400");

  // 7. Reset.
  const reset = await api("POST", "/api/v1/me/preferences/reset", { ...auth, body: { domain: "appearance" } });
  assert(reset.status === 200 && reset.json.appearance.theme === "DARK_BLUE", "reset restores defaults (§37)");
  assert(reset.json.localization.timezone === "Europe/Paris", "reset scoped — other domains untouched");

  // 8. Deactivate — typed confirmation + sessions revoked.
  const deactivated = await api("POST", "/api/v1/me/deactivate", { ...auth, body: { confirmation: "DEACTIVATE" } });
  assert(deactivated.status === 200 && deactivated.json.status === "DEACTIVATED", "deactivate 200");
  const meAfter = await api("GET", "/api/v1/auth/me", auth);
  assert(meAfter.status === 401, "sessions revoked after deactivation");

  console.log("SMOKE 15: ALL GREEN");
  process.exitCode = 0;
} finally {
  server.kill("SIGTERM");
}
