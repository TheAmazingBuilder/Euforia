# Accounts & Trading Connectivity — Provider Feasibility

**Phase 01 deliverable (D of 5).** Provider-by-provider architectural decisions grounded in the Phase 00 evidence base (audit §8, research performed 2026-10-13 against official sources) plus the mandate's provider-specific requirements (§16). **No provider integration work starts in Phase 01**; this document freezes what is known, what is unknown, and in what order real adapters should land.

Evidence labels: `VERIFIED BY OFFICIAL DOCUMENTATION` (fetched during Phase 00, references in §3) · `VERIFIED IN SOURCE` (repository evidence) · `UNKNOWN` (insufficient evidence — resolved only by future verification, never by assumption).

---

## 1. Provider / Platform Distinctions (mandate §16 preamble, §8.1)

These five names are **different categories of products**; the architecture models them explicitly (doc A §4.3: one adapter per *technical mechanism*, not per brand):

| Name | Category | Connectivity consequence |
|---|---|---|
| **MetaTrader 5 (MT5)** | Trading terminal/platform by MetaQuotes | No official cloud REST API for account data. Access = running terminal (official Python module) or a broker/bridge gateway. Euforia would integrate the *mechanism* (terminal bridge), never "MT5" abstractly |
| **IC Markets** | Broker (Raw Trading Ltd) | **No direct broker API.** Reachable only *through* its platforms: MT5 (→ MT5 mechanism), cTrader (→ cTrader Open API), MT4/TradeLocker. Never a standalone "IC Markets adapter" |
| **OANDA** | Broker with an official proprietary REST API (v20) | Cleanest path: direct HTTP + personal access token, no terminal, no SDK |
| **cTrader** | Platform by Spotware with an official Open API | One connector covers every broker exposing cTrader accounts (incl. IC Markets Raw Spread) |
| **TradingView** | Charting/social platform + broker-integration *host* | **Account-data API: none.** Charting embedding ≠ broker access. UNSUPPORTED for account sync (§7) |
| **Deriv** | Broker with an official WebSocket API | Official API; in-repo Hub catalog entry exists; read-only subset would be used |

Rule enforced everywhere: a broker sharing a platform does **not** become a separate adapter; two platforms from one broker are **not** one adapter.

---

## 2. Verified Provider Capabilities (from Phase 00)

| Capability | MT5 | IC Markets | OANDA | TradingView | cTrader | Deriv |
|---|---|---|---|---|---|---|
| Account metadata | via platform/terminal | via platform | SUPPORTED | UNSUPPORTED | SUPPORTED (Open API) | SUPPORTED (official page) |
| Balance / equity | via platform | via platform | SUPPORTED | UNSUPPORTED | SUPPORTED | SUPPORTED |
| Margin values | via platform | via platform | SUPPORTED | UNSUPPORTED | SUPPORTED | SUPPORTED |
| Open positions | `positions_get()` | via platform | SUPPORTED | UNSUPPORTED | SUPPORTED | SUPPORTED |
| Pending orders | `orders_get()` | via platform | SUPPORTED | UNSUPPORTED | SUPPORTED | SUPPORTED |
| Deals / history | `history_deals_get()`, `history_orders_get()` | via platform | SUPPORTED (transactions) | UNSUPPORTED | SUPPORTED | SUPPORTED |
| Streaming | none native (Python/terminal polling); third-party bridge only | inherits platform | pricing stream documented (rate figures UNKNOWN) | N/A | subscriptions (details per official docs) | real-time WS (official) |
| Account discovery | per-terminal login scope | via platform | per-token account list (exact endpoint set UNKNOWN) | N/A | `ProtoOAAccountListByAccessToken` (official) | UNKNOWN (needs doc check) |
| Read-only credentials possible | no (terminal login is full-access) | inherits platform | yes (token scope) | N/A | OAuth scope (verify read-only breadth) | token scope (verify) |

Confidence: OANDA portal *verified live*; cTrader OAuth *verified statement*; Deriv *verified official page*; MT5 module surface *verified* (hosting constraints partially verified); TradingView absence *partially verified* (absence claims are inherently hard to prove — no official account API found on official channels).

---

## 3. Official Documentation References (fetched & captured 2026-10-13)

| Provider | Reference | Status |
|---|---|---|
| OANDA | `developer.oanda.com/rest-live-v20/introduction/` | Portal live, introduction fetched |
| cTrader | `help.ctrader.com/open-api/` + official help center OAuth 2.0 statement | Fetched |
| Deriv | `api.deriv.com` ("real-time pricing, trade execution, portfolio data") | Fetched |
| MT5 | `mql5.com/en/docs/python_metatrader5` (`account_info`, `positions_get`, `orders_get`, `history_deals_get`, `order_send` — execution methods exist, read-only discipline mandatory); `metatrader5.com` | Fetched |
| MetaApi (3rd-party MT5 bridge) | `metaapi.cloud` + `metaapi.cloud/docs/client` | Fetched — third-party, not MetaQuotes, not the user's broker |
| TradingView | `tradingview.com/brokers/` (partner directory — not an account API); no official account-data API found | Fetched |
| IC Markets | `ic.com` (brand/platform list: Standard/Raw Spread **cTrader** documented) | Fetched |

Sub-page depth (exact rate-limit figures, full endpoint sets) was **not** exhaustively fetched — those remain per-provider UNKNOWNs (§8) to be resolved in the implementing phase with these references as the starting point.

---

## 4. Authentication and Permission Requirements

| Provider/mechanism | Auth method | Credentials held by Euforia | Least-privilege posture | Notes |
|---|---|---|---|---|
| OANDA v20 | Personal access token (Bearer) | API token (fits existing `API_KEY` method — no schema change) | Good: token-scoped, revocable, read-oriented usage | Region/entity: live vs practice hosts differ |
| cTrader Open API | OAuth 2.0 authorization code | Client id/secret (server) + user access & refresh tokens (encrypted at rest) | OAuth scopes; refresh lifecycle required | Requires `supportedConnectionMethods` extension (doc B §4.4); callback security gates designed in Phase 05 |
| Deriv | API token / OAuth (official docs) | API token (fits `API_KEY`) | Token scope — verify read-only breadth | WebSocket-first API |
| MT5 (terminal bridge) | Terminal login (account + password + server) | **Full broker credentials** in a terminal/bridge host | **Poor:** no restricted-credential mode documented — limitation explicitly recorded (mandate §14.3) | Bridge choice (self-hosted vs third-party) decides who else sees credentials |
| MT5 (MetaApi cloud) | Account credentials shared with third-party cloud | Credentials leave Euforia's trust boundary | **Poor + external dependency** | Product decision — cost, availability, credential exposure |
| TradingView | N/A | — | — | No legitimate path; scraping/credential-sharing prohibited (mandate §16) |

Where a provider cannot offer sufficiently restricted credentials (MT5 paths), the limitation and risk are recorded here and in the adapter's capability metadata (`limitation` field, doc B §4.2) — never silently accepted.

---

## 5. Streaming versus Polling

| Provider | Polling | Streaming | First-phase strategy |
|---|---|---|---|
| OANDA | Fully viable (REST snapshots + transactions) | Pricing stream documented; account-state streaming not verified | **POLL** — honest, matches V1 sync design; streaming capability declared `UNKNOWN` until verified |
| cTrader | Viable | Open API subscriptions (details UNKNOWN) | POLL first; STREAM capability `UNKNOWN` |
| Deriv | Viable (WS snapshots) | Real-time WS (official) | POLL-shaped adapter over WS events, or STREAM if Phase 06 justifies the optional streaming interface (doc A §4.3) |
| MT5 bridge | Terminal polling (the only native mode) | Only via third-party bridge features | POLL |
| TradingView | — | — | N/A — UNSUPPORTED |

Architecture impact: polling requires **nothing new** (verified V1 sync design); streaming would use the optional capability-specific adapter interface + freshness re-thresholds — designed (doc A §4.3, doc B §9) but implemented only when a streaming provider phase begins. `LIVE` freshness never implies real-time for polling providers (doc B §9).

---

## 6. Infrastructure Requirements

| Provider | Required infrastructure | Fit with current deployment (Linux sandbox, embedded Postgres, no schedulers yet) |
|---|---|---|
| OANDA | None beyond outbound HTTPS | **Perfect fit** — plain REST + token; adapter is an ordinary module |
| cTrader | OAuth app registration (Spotware developer portal); outbound HTTPS (+WS) | Fit; token persistence uses the existing AES-256-GCM vault |
| Deriv | Outbound WSS | Fit; WS client dependency is a **deliberate, documented install** at its phase (first HTTP/WS client dep in the API — audit §2.2) |
| MT5 self-hosted bridge | A running MT5 terminal connected to the broker, Windows-oriented (official quick-start); Linux/Wine is community territory, not official; terminal closed = no data | **Poor fit** — needs an external host; operational burden documented |
| MT5 via MetaApi | Third-party cloud service (SDK/REST) | Medium fit technically; strategic cost: credentials to a third party + availability + licensing terms to review |
| TradingView | — | UNSUPPORTED |

No infrastructure is procured or configured in Phase 01.

---

## 7. Unsupported Features and Limitations

1. **TradingView account synchronization — UNSUPPORTED.** No official API for reading a user's broker account; broker integrations are TradingView-side partnerships. Legitimate alternative: connect the *underlying broker* directly (e.g. the user's IC Markets cTrader account via the cTrader adapter). Charting display needs are already served by the Oryon chart engine. **No scraping, undocumented endpoints, browser-session extraction, or credential sharing** (mandate §16).
2. **IC Markets as a standalone integration — UNSUPPORTED** (broker without a direct API); delivered *through* platform adapters.
3. **MT5 direct HTTP — UNSUPPORTED** (no official cloud REST); only terminal/bridge mechanisms.
4. **Execution of any kind — permanently UNSUPPORTED** across all providers (doc C §8 red line), even where provider APIs are execution-capable (MT5 `order_send`, Deriv trade endpoints — noted because the official docs advertise them; the adapters implement the read-only subset only).
5. **Auto-trading / copy features** of any platform — out of product scope, out of architecture scope.

---

## 8. Unknowns Requiring Validation (honest register)

| # | Unknown | Blocks | Resolution path |
|---|---|---|---|
| U1 | MT5 path decision (self-hosted bridge / MetaApi / defer) — **user decision** | Phase 06 | User input; then a spike against the chosen mechanism before any adapter code |
| U2 | OANDA exact rate-limit figures + full endpoint set for practice accounts | Phase 03 design detail | Official docs deep-fetch + practice-sandbox verification (user-provided token at runtime, never committed) |
| U3 | OANDA account-discovery endpoint breadth per token/region | Discovery feature (Phase 03 optional) | Docs + sandbox probe |
| U4 | cTrader subscription payload details + read-only OAuth scope breadth | Phase 05 | Official Open API docs deep-fetch + demo account |
| U5 | Deriv token scope for read-only + WS reconnection semantics | Phase 07 | Official docs deep-fetch |
| U6 | Whether any streaming provider justifies server-push in Euforia (vs polling + invalidation) | Phase 04+ transport decision | Product input + measured polling adequacy |
| U7 | Provider-side symbol vocabularies vs the instrument catalog (mapping coverage) | Normalization quality (doc A §4.5) | Per-adapter symbol maps + verbatim-passthrough rule for unmapped symbols |

Per mandate §3.2/§9.3: all unresolved cells stay `UNKNOWN` in capability declarations — never `false`, never silently supported.

---

## 9. Recommended Provider Implementation Order

| Order | Provider/mechanism | Why this position | Key preconditions |
|---|---|---|---|
| 1 | **OANDA (v20 REST)** | Only provider with a clean, official, HTTP-only path matching the existing `API_KEY` model; no hosting constraints; genuinely partial capabilities make it the perfect first exerciser of the capability model | U2; user-provided practice token at validation time |
| 2 | **cTrader (Open API)** | Official OAuth path; one connector also serves IC Markets cTrader users; isolated contract evolution (`OAUTH_AUTHORIZATION_CODE` + refresh persistence) | U4; OAuth method extension + callback design |
| 3 | **Deriv (official WS)** | Official API, already mirrored by a Hub catalog entry; low hosting complexity; crypto/derived audience | U5; first WS client dep (documented install) |
| 4 | **MT5 (mechanism TBD by U1)** | Flagship audience (MT5-style retail traders) but genuinely blocked on the hosting/bridge decision; never designed around undocumented APIs | U1 resolved; spike first |
| 5 | **IC Markets** | Not a standalone integration — served via #2 (cTrader accounts) and #4 (MT5 accounts) | Riders on #2/#4 |
| — | **TradingView** | UNSUPPORTED for account sync (permanent, §7) | — |

Rationale (unchanged from Phase 00 §15, re-affirmed): user workflow value, official-API availability, testability, security posture, and hosting fit. Each adapter lands as an ordinary bounded module behind the existing read-only port with: normalization tests, error-mapping tests, pagination/idempotency tests, capability-declaration tests, and a red-line suite that stays green (doc E).
