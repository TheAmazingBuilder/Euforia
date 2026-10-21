/**
 * e2e — Calculators API (Phase 18 §45/§46/§60/§61): access control, contract
 * shape, validation, negative security (forged identifiers, formula
 * injection, NaN/Infinity, oversized requests), determinism/isolation and
 * the zero-persistence guarantee — against the real AppModule.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import {
  compoundingCalculatorResultSchema,
  lotSizeCalculatorResultSchema,
} from "../../src/shared/contracts";
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

const LOT_SIZE_URL = "/api/v1/calculators/lot-size";
const COMPOUNDING_URL = "/api/v1/calculators/compounding";

const VALID_LOT_SIZE = {
  balance: "10000",
  riskPercent: "1",
  entryPrice: "1.10000",
  stopLossPrice: "1.09000",
  takeProfitPrice: "1.15000",
  direction: "BUY",
  instrument: { pipSize: "0.0001", contractSize: "100000" },
};

const VALID_COMPOUNDING = {
  startingBalance: "1000",
  periods: 3,
  gainPerPeriodPercent: "10",
};

// Wire material that must NEVER appear in calculator responses (§57).
const SECRET_PATTERN =
  /credentialsEnc|passwordHash|refreshTokenHash|argon2|postgres:\/\/|DATABASE_URL|JWT_SECRET|cz_live_/;

describe("calculators access control (§45)", () => {
  it("rejects anonymous access on both calculation routes", async () => {
    const lot = await app.inject({ method: "POST", url: LOT_SIZE_URL, payload: VALID_LOT_SIZE });
    const comp = await app.inject({ method: "POST", url: COMPOUNDING_URL, payload: VALID_COMPOUNDING });
    expect(lot.statusCode).toBe(401);
    expect(comp.statusCode).toBe(401);
  });
});

describe("POST /calculators/lot-size (§60)", () => {
  it("returns the authoritative computation conforming to the shared contract", async () => {
    const user = await authenticatedUser(app, mail);
    const res = await app.inject({
      method: "POST",
      url: LOT_SIZE_URL,
      headers: user.authHeader,
      payload: VALID_LOT_SIZE,
    });
    expect(res.statusCode).toBe(200);
    const body = lotSizeCalculatorResultSchema.parse(res.json());
    expect(body.riskAmount).toBe("100");
    expect(body.stopDistance).toBe("0.01");
    expect(body.stopPips).toBe("100");
    expect(body.riskReward).toBe("5");
    expect(body.rawPositionSize).toBe("0.1");
    expect(body.normalizedPositionSize).toBe("0.1");
    expect(body.realizedRiskAmount).toBe("100");
    expect(body.volumeAdjustment).toBe("NONE");
    expect(body.status).toBe("VALID");
    // §53 — a calculation result is NOT a persisted record: no identity, no timestamps.
    expect(res.json().id).toBeUndefined();
    expect(res.json().createdAt).toBeUndefined();
  });

  it("strips unknown fields and stays mass-assignment-safe (§61 — repo convention)", async () => {
    const user = await authenticatedUser(app, mail);
    const forged = await app.inject({
      method: "POST",
      url: LOT_SIZE_URL,
      headers: user.authHeader,
      payload: {
        ...VALID_LOT_SIZE,
        // Forged ownership/permission/persistence fields must not influence anything:
        accountId: "9a3b2c1d-0000-4000-8000-deadbeef0000",
        userId: "someone-else",
        role: "ADMIN",
        formula: "balance * process.exit(1)",
        instrument: { ...VALID_LOT_SIZE.instrument, providerResourceId: "forged", tickValue: "999" },
      },
    });
    const clean = await app.inject({
      method: "POST",
      url: LOT_SIZE_URL,
      headers: user.authHeader,
      payload: VALID_LOT_SIZE,
    });
    expect(forged.statusCode).toBe(200);
    expect(forged.body).toBe(clean.body);
    expect(JSON.stringify(forged.json())).not.toContain("forged");
  });

  it("validates input: malformed numerics, NaN/Infinity strings, zero distance, risk > 100 (§48/§61)", async () => {
    const user = await authenticatedUser(app, mail);
    const cases: Array<{ name: string; payload: Record<string, unknown> }> = [
      { name: "balance 0", payload: { ...VALID_LOT_SIZE, balance: "0" } },
      { name: "balance negative", payload: { ...VALID_LOT_SIZE, balance: "-100" } },
      { name: "riskPercent NaN string", payload: { ...VALID_LOT_SIZE, riskPercent: "NaN" } },
      { name: "riskPercent Infinity string", payload: { ...VALID_LOT_SIZE, riskPercent: "Infinity" } },
      { name: "riskPercent > 100", payload: { ...VALID_LOT_SIZE, riskPercent: "150" } },
      { name: "stop equals entry", payload: { ...VALID_LOT_SIZE, stopLossPrice: "1.10000" } },
      { name: "entryPrice exponent", payload: { ...VALID_LOT_SIZE, entryPrice: "1.1e4" } },
      { name: "pipSize 0", payload: { ...VALID_LOT_SIZE, instrument: { ...VALID_LOT_SIZE.instrument, pipSize: "0" } } },
      { name: "contractSize negative", payload: { ...VALID_LOT_SIZE, instrument: { ...VALID_LOT_SIZE.instrument, contractSize: "-100000" } } },
      { name: "unknown direction", payload: { ...VALID_LOT_SIZE, direction: "SIDEWAYS" } },
      { name: "balance as number (wire format is string)", payload: { ...VALID_LOT_SIZE, balance: 10000 } },
    ];
    for (const c of cases) {
      const res = await app.inject({ method: "POST", url: LOT_SIZE_URL, headers: user.authHeader, payload: c.payload });
      expect(res.statusCode, c.name).toBe(400);
      expect(res.json().error, c.name).toBe("ValidationError");
    }
  });

  it("maps a budget below one volume step to a 422 with the stable code (§44)", async () => {
    const user = await authenticatedUser(app, mail);
    const res = await app.inject({
      method: "POST",
      url: LOT_SIZE_URL,
      headers: user.authHeader,
      payload: { ...VALID_LOT_SIZE, balance: "10", riskPercent: "0.5" },
    });
    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.error).toBe("BusinessRule");
    expect(body.code).toBe("POSITION_SIZE_BELOW_MINIMUM");
  });

  it("reports explicit broker min/max statuses without clamping (§17)", async () => {
    const user = await authenticatedUser(app, mail);
    const below = await app.inject({
      method: "POST",
      url: LOT_SIZE_URL,
      headers: user.authHeader,
      payload: { ...VALID_LOT_SIZE, instrument: { ...VALID_LOT_SIZE.instrument, minVolume: "1" } },
    });
    expect(below.statusCode).toBe(200);
    expect(below.json().status).toBe("BELOW_MINIMUM");
    expect(below.json().normalizedPositionSize).toBe("0.1");

    const above = await app.inject({
      method: "POST",
      url: LOT_SIZE_URL,
      headers: user.authHeader,
      payload: { ...VALID_LOT_SIZE, instrument: { ...VALID_LOT_SIZE.instrument, maxVolume: "0.05" } },
    });
    expect(above.statusCode).toBe(200);
    expect(above.json().status).toBe("ABOVE_MAXIMUM");
    expect(above.json().normalizedPositionSize).toBe("0.1");
  });
});

describe("POST /calculators/compounding (§60)", () => {
  it("returns the period-by-period projection conforming to the shared contract (§49)", async () => {
    const user = await authenticatedUser(app, mail);
    const res = await app.inject({
      method: "POST",
      url: COMPOUNDING_URL,
      headers: user.authHeader,
      payload: VALID_COMPOUNDING,
    });
    expect(res.statusCode).toBe(200);
    const body = compoundingCalculatorResultSchema.parse(res.json());
    expect(body.rows.map((row) => row.endingBalance)).toEqual(["1100", "1210", "1331"]);
    expect(body.finalBalance).toBe("1331");
    expect(body.totalProfit).toBe("331");
    expect(body.totalGainPercentage).toBe("33.1");
    // §53 — no persistence: the result is a pure projection, not a record.
    expect(res.json().id).toBeUndefined();
  });

  it("validates input: zero/fractional/over-cap periods, negative gain, bad balance (§48)", async () => {
    const user = await authenticatedUser(app, mail);
    const cases = [
      { periods: 0 },
      { periods: 1.5 },
      { periods: 1001 },
      { periods: 10_000_000 },
      { gainPerPeriodPercent: "-1" },
      { gainPerPeriodPercent: "10001" },
      { startingBalance: "0" },
      { startingBalance: "NaN" },
    ];
    for (const patch of cases) {
      const res = await app.inject({
        method: "POST",
        url: COMPOUNDING_URL,
        headers: user.authHeader,
        payload: { ...VALID_COMPOUNDING, ...patch },
      });
      expect(res.statusCode, JSON.stringify(patch)).toBe(400);
    }
  });

  it("maps pathological exponentiation to a 422 CALCULATION_OVERFLOW, never Infinity (§25)", async () => {
    const user = await authenticatedUser(app, mail);
    const res = await app.inject({
      method: "POST",
      url: COMPOUNDING_URL,
      headers: user.authHeader,
      payload: { startingBalance: "100000000000000", periods: 50, gainPerPeriodPercent: "1000" },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("CALCULATION_OVERFLOW");
    expect(JSON.stringify(res.json())).not.toContain("Infinity");
  });
});

describe("determinism & isolation (§46)", () => {
  it("produces identical results for different users — no cross-user surface exists", async () => {
    const a = await authenticatedUser(app, mail);
    const b = await authenticatedUser(app, mail);
    const aOne = await app.inject({ method: "POST", url: LOT_SIZE_URL, headers: a.authHeader, payload: VALID_LOT_SIZE });
    const aTwo = await app.inject({ method: "POST", url: LOT_SIZE_URL, headers: a.authHeader, payload: VALID_LOT_SIZE });
    const bOne = await app.inject({ method: "POST", url: LOT_SIZE_URL, headers: b.authHeader, payload: VALID_LOT_SIZE });
    expect(aOne.body).toBe(aTwo.body);
    expect(aOne.body).toBe(bOne.body);

    const cOne = await app.inject({ method: "POST", url: COMPOUNDING_URL, headers: a.authHeader, payload: VALID_COMPOUNDING });
    const cTwo = await app.inject({ method: "POST", url: COMPOUNDING_URL, headers: b.authHeader, payload: VALID_COMPOUNDING });
    expect(cOne.body).toBe(cTwo.body);
    // No user identity leaks into a calculation response (§57).
    expect(JSON.stringify(cOne.json())).not.toContain(a.email);
    expect(JSON.stringify(cOne.json())).not.toContain(b.email);
    expect(SECRET_PATTERN.test(JSON.stringify(cOne.json()))).toBe(false);
  });
});

describe("negative capability — Calculators cannot act (§43/§61)", () => {
  it("exposes only the two calculation routes — no GET/mutation/persistence surface", async () => {
    const user = await authenticatedUser(app, mail);
    for (const [method, url] of [
      ["GET", LOT_SIZE_URL],
      ["GET", COMPOUNDING_URL],
      ["GET", "/api/v1/calculators"],
      ["GET", "/api/v1/calculators/history"],
      ["POST", "/api/v1/calculators/history"],
      ["PATCH", "/api/v1/calculators/history/c1"],
      ["DELETE", "/api/v1/calculators/history/c1"],
      ["POST", "/api/v1/calculators/lot-size/save"],
      ["POST", "/api/v1/calculators/execute"],
      ["POST", "/api/v1/calculators/order"],
    ] as const) {
      const res = await app.inject({ method, url, headers: user.authHeader, payload: {} });
      expect(res.statusCode, `${method} ${url}`).toBe(404);
    }
  });
});
