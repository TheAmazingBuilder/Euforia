# Euforia Market Service

The market service publishes **real provider data only**. There is no simulated
price generator, random-walk candle source or fabricated fallback value.

## Providers

| Provider | Instruments | Data |
| --- | --- | --- |
| Binance Spot | BTC, ETH, BNB, SOL, XRP, DOGE and ADA against USDT | Real Spot mini-ticker WebSocket, public 24-hour REST fallback and exchange klines |
| Deriv public market data | EURUSD, GBPUSD, USDJPY, XAUUSD, BOOM500, CRASH500 and Volatility 75 (1s), when currently active | Real public ticks and provider history/candles |

Deriv synthetic indices are genuine live quotes published by Deriv for
Deriv-generated synthetic instruments. They are **not** prices of exchange-listed
equity indices. The ticker labels these instruments as synthetic.

No API keys or account tokens are required for these public, read-only market
data endpoints. The service exposes no order placement, balances or account
positions. It does not publish demo account data.

When an upstream disconnects, the last observation becomes stale in the client.
If an instrument is not active upstream, it is omitted. When a real 24-hour
reference cannot be retrieved, the change percentage is shown as unavailable
rather than estimated.

## Run locally

Prerequisite: Bun 1.3.14 or newer.

From the Euforia repository root:

```powershell
cd mini-services/market-service
bun install --frozen-lockfile
bun run dev
```

The service listens on `http://localhost:3003`.

Or from the repository root, use `pnpm market:dev`.

## Verify that the feed is real and connected

The health endpoint is public and reports the policy, provider transports,
symbol availability, tick count and last received provider timestamp:

```powershell
Invoke-RestMethod http://localhost:3003/health | ConvertTo-Json -Depth 8
Invoke-RestMethod http://localhost:3003/prices | ConvertTo-Json -Depth 8
```

Check `dataPolicy = REAL_ONLY`, `realFeedReady = true`, and that the Binance
and/or Deriv provider has received ticks. A healthy HTTP process with
`realFeedReady = false` means the service is running but has not received a
real provider quote yet.

## Endpoints

- `GET /health` — service and provider diagnostics.
- `GET /prices` — latest real quotes.
- `GET /prices?symbol=EURUSD` — latest real quote for one internal symbol.
- `GET /candles?symbol=BTCUSDT&interval=5m&limit=300` — provider OHLCV history.
- Socket.IO event `prices` — initial snapshot and real quote updates.

## Configuration

- `PORT` (default `3003`).
- `DERIV_PUBLIC_WS_URL` (optional override for the public Deriv WebSocket).

No quote is seeded locally. An upstream outage results in missing or stale
observations, never a generated quote.
