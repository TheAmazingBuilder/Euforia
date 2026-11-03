/**
 * diag-candles.js - inspect the RAW market-service candle response for one
 * symbol/interval (same Bearer contract as the app: czat1 payload+checksum).
 * Usage: node scripts/diag-candles.js EURUSD 1H
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Node diagnostic helper */
const SECRET = "cosmoz-mock-access-secret-v1";

function fnv1a(input) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i += 1) {
    h1 ^= input.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ input.charCodeAt(input.length - 1 - i), 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

const [, , symbol = "EURUSD", interval = "1H"] = process.argv;
const now = Date.now();
const body = Buffer.from(
  JSON.stringify({ uid: "diag-diag-diag", iat: now, exp: now + 3_600_000, v: 1 }),
).toString("base64url");
const token = `czat1.${body}.${fnv1a(`${SECRET}:${body}`)}`;

(async () => {
  const url = `http://localhost:3003/candles?symbol=${symbol}&interval=${interval}&limit=300`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  console.log("HTTP", response.status);
  const data = await response.json();
  if (!response.ok) {
    console.log(JSON.stringify(data));
    process.exit(0);
  }
  const candles = data.candles ?? [];
  console.log("source:", data.source, "count:", candles.length);
  if (candles.length > 0) {
    const times = candles.map((c) => c.t);
    const step = times.length > 1 ? times[1] - times[0] : 0;
    console.log("first:", new Date(times[0]).toISOString());
    console.log("last:", new Date(times[times.length - 1]).toISOString());
    console.log("median step ms:", step);
    const bad = candles.filter(
      (c) => c.h < Math.max(c.o, c.c) || c.l > Math.min(c.o, c.c) || c.h < c.l,
    );
    console.log("rows failing sanity:", bad.length);
    console.log("sample[0]:", JSON.stringify(candles[0]));
    console.log("sample[last]:", JSON.stringify(candles[candles.length - 1]));
  }
})();
