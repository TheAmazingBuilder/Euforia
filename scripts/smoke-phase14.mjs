/**
 * Smoke test Phase 14 (Integrations) — boots the REAL API against the dev DB,
 * walks a user through the Hub lifecycle and asserts the contract shapes.
 * The verification token is read from the console mail transport log.
 * Secrets are injected via env (never committed).
 */
import { spawn } from "node:child_process";
import { readFileSync, existsSync, rmSync, appendFileSync } from "node:fs";

const PORT = 4100;
const BASE = `http://127.0.0.1:${PORT}`;
const LOG = "/home/z/my-project/scripts/smoke14-server.log";

function assert(cond, label) {
  if (!cond) {
    console.error(`FAIL: ${label}`);
    process.exitCode = 1;
    server?.kill("SIGTERM");
    process.exit(1);
  }
  console.log(`ok: ${label}`);
}

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitUntilHealthy() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  return false;
}

function readVerificationToken(email) {
  const log = readFileSync(LOG, "utf8");
  // Console mail transport renders the action URL; find the LAST one for this
  // email. The line is JSON-escaped, so look for the raw token fragment.
  const lines = log.split("\n").reverse();
  for (const line of lines) {
    if (!line.includes(email)) continue;
    const match = line.match(/verify-email\?token=([A-Za-z0-9._~-]+)/);
    if (match) return match[1];
  }
  return null;
}

let server;

async function main() {
  if (existsSync(LOG)) rmSync(LOG);

  server = spawn(
    "node",
    ["--enable-source-maps", "dist/apps/api/src/main.js"],
    {
      cwd: "/home/z/my-project/apps/api",
      env: {
        ...process.env,
        PORT: String(PORT),
        NODE_ENV: "test",
        DATABASE_URL: "postgresql://cosmoz@127.0.0.1:5433/cosmoz",
        CORS_ORIGINS: "http://localhost:3000",
        AUTH_JWT_SECRET: "smoke14-jwt-secret-0123456789abcdef0123456789",
        AUTH_MFA_ENCRYPTION_KEY: "h0mEbiEr05Qkg5f8Duz4PrOups2o69gGx+LIEdXAuvU=",
        ACCOUNTS_CREDENTIALS_ENCRYPTION_KEY: "Mck3U8lb0RHzT7eDlBd7hgmE5FpYm0ZOSJB3ZfA4GFo=",
        INTEGRATIONS_WEBHOOK_ENCRYPTION_KEY: "Y29zbW96LWludGVncmF0aW9ucy1rZXktMjAyNi10c3Q=",
        ACCOUNTS_MOCK_PROVIDER: "enabled",
        WEB_APP_URL: "http://localhost:3000",
      },
    },
  );
  server.stdout.on("data", (chunk) => appendFileSync(LOG, String(chunk)));
  server.stderr.on("data", (chunk) => appendFileSync(LOG, String(chunk)));

  // 1. Boot
  assert(await waitUntilHealthy(), "server healthy");

  const email = `smoke14-${Date.now()}@cosmoz.test`;

  // 2. Register → verify (token from console mail log) → login
  const register = await api("POST", "/api/v1/auth/register", {
    body: { email, password: "Smoke-Test-2026!", name: "Smoke 14" },
  });
  assert(register.status === 201, `register 201 (${register.status})`);

  await sleep(300);
  const verifyToken = readVerificationToken(email);
  assert(verifyToken !== null, "verification token found in mail log");

  const verify = await api("POST", "/api/v1/auth/email/verify", { body: { token: verifyToken } });
  assert(verify.status === 200, `verify-email 200 (${verify.status})`);

  const login = await api("POST", "/api/v1/auth/login", {
    body: { email, password: "Smoke-Test-2026!", remember: false },
  });
  assert(login.status === 200, `login 200 (${login.status})`);
  const token = login.json.accessToken;
  assert(typeof token === "string", "access token received");
  const auth = { token };

  // 3. Overview boot — 12 providers, webhook provisioned, feeds populated
  const overview = await api("GET", "/api/v1/integrations/overview", auth);
  assert(overview.status === 200, `overview 200 (${overview.status})`);
  assert(overview.json.providers.length === 12, "12 providers");
  assert(overview.json.summary.disconnected === 12, "all disconnected at boot");
  assert(overview.json.webhooks.length === 1, "webhook endpoint provisioned");
  const hook = overview.json.webhooks[0];
  assert(hook.providerId === "macro-sample", "hook provider macro-sample");
  assert(/^whsec_••••[0-9a-f]{4}$/.test(hook.secretMaskedHint), "hook hint masked");
  assert(overview.json.ecoEvents.length > 0, `eco feed populated (${overview.json.ecoEvents.length})`);
  assert(overview.json.news.length === 6, "6 sample news");

  // 4. Licensing gate + connect
  const gate = await api("POST", "/api/v1/integrations/providers/binance-exchange/connect", {
    ...auth,
    body: { vaultRef: "vault://binance-exchange/k" },
  });
  assert(gate.status === 422 && gate.json.code === "LICENSE_UNVERIFIED", `licensing gate 422 (${gate.status})`);

  const connect = await api("POST", "/api/v1/integrations/providers/deriv/connect", {
    ...auth,
    body: { vaultRef: "vault://deriv/api-token" },
  });
  assert(connect.status === 200 && connect.json.status === "CONNECTED", "deriv connected");
  assert(connect.json.credentials.maskedHint === "••••oken", "masked hint parity");

  const twice = await api("POST", "/api/v1/integrations/providers/deriv/connect", {
    ...auth,
    body: { vaultRef: "vault://deriv/api-token" },
  });
  assert(twice.status === 409 && twice.json.code === "ALREADY_CONNECTED", "409 already connected");

  // 5. Test + sync
  const test = await api("POST", "/api/v1/integrations/providers/deriv/test", auth);
  if (test.status !== 200 || test.json.ok !== true) {
    console.error("test response:", test.status, JSON.stringify(test.json));
  }
  assert(test.status === 200 && test.json.ok === true, "test ok");
  assert(test.json.checks.length === 4, "4 checks");

  const sync = await api("POST", "/api/v1/integrations/providers/deriv/sync", auth);
  assert(sync.status === 200 && sync.json.sync.recordsProcessed === 1, "broker sync 1 record");

  // 6. Webhook simulate (valid + bad signature + replay)
  const valid = await api("POST", `/api/v1/integrations/webhooks/${hook.id}/simulate`, {
    ...auth,
    body: { eventType: "eco.actual.released", payload: { eventRef: "macro-sample:MACRO-1" } },
  });
  assert(valid.status === 200 && valid.json.accepted === true, "webhook accepted");
  const bad = await api("POST", `/api/v1/integrations/webhooks/${hook.id}/simulate`, {
    ...auth,
    body: { eventType: "eco.actual.released", payload: {}, mode: "bad-signature" },
  });
  assert(bad.status === 200 && bad.json.signatureValid === false, "bad signature rejected");
  const replay = await api("POST", `/api/v1/integrations/webhooks/${hook.id}/simulate`, {
    ...auth,
    body: { eventType: "eco.actual.released", payload: { eventRef: "macro-sample:MACRO-1" }, mode: "replay" },
  });
  assert(replay.status === 200 && replay.json.duplicate === true, "replay duplicate");

  // 7. Disconnect (history preserved)
  const disconnect = await api("POST", "/api/v1/integrations/providers/deriv/disconnect", auth);
  assert(
    disconnect.status === 200 &&
      disconnect.json.historyPreserved === true &&
      disconnect.json.status === "DISCONNECTED",
    "disconnect history preserved",
  );

  // 8. Security events recorded
  const secOverview = await api("GET", "/api/v1/security/overview", auth);
  assert(secOverview.status === 200, "security overview reachable");
  const events = JSON.stringify(secOverview.json);
  assert(events.includes("INTEGRATION_CONNECTED"), "audit: INTEGRATION_CONNECTED");
  assert(events.includes("INTEGRATION_DISCONNECTED"), "audit: INTEGRATION_DISCONNECTED");

  console.log("\nSMOKE 14 — ALL GREEN");
}

main()
  .catch((error) => {
    console.error("smoke failed:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    server?.kill("SIGTERM");
    setTimeout(() => process.exit(process.exitCode ?? 0), 300);
  });
