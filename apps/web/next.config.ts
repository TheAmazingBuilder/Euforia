import type { NextConfig } from "next";

/**
 * Market service proxy — local dev has no gateway in front of Next, so the
 * realtime endpoints must reach the socket.io market service directly.
 * In the sandbox preview the gateway routes on XTransformPort BEFORE Next
 * sees the request; these rewrites only fire when it doesn't.
 */
const MARKET_SERVICE = "http://localhost:3003";

/**
 * COSMOZ API proxy — the live bridge (Phase C). When the frontend runs in
 * live mode (NEXT_PUBLIC_API_LIVE=true), API calls go to the SAME origin
 * under /api/v1 and this rewrite forwards them to the NestJS backend,
 * avoiding any cross-origin CORS/cookie configuration entirely: the
 * HttpOnly refresh cookie (cosmoz_rt) stays first-party, fetch needs no
 * credentials:"include", and the API's CORS allowlist is never engaged.
 *
 * The rewrite is inert in the default mocked mode — the browser only ever
 * requests /api/… there (MSW intercepts before the network), and nothing
 * calls /api/v1.
 */
const API_PROXY_TARGET = process.env.API_PROXY_TARGET ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  transpilePackages: ["@cosmoz/shared"],
  async rewrites() {
    return [
      { source: "/api/v1/:path*", destination: `${API_PROXY_TARGET}/api/v1/:path*` },
      { source: "/prices", destination: `${MARKET_SERVICE}/prices` },
      { source: "/candles", destination: `${MARKET_SERVICE}/candles` },
      { source: "/health", destination: `${MARKET_SERVICE}/health` },
      // socket.io handshakes hit the BARE path "/socket.io/?EIO=4…" —
      // "/socket.io/:path*" alone misses it (zero segments + trailing slash),
      // so the websocket never connected locally and silently degraded to
      // HTTP polling. The exact-match source keeps the trailing slash in the
      // destination (engine.io's path is "/socket.io/" WITH it).
      { source: "/socket.io", destination: `${MARKET_SERVICE}/socket.io/` },
      { source: "/socket.io/:path*", destination: `${MARKET_SERVICE}/socket.io/:path*` },
    ];
  },
};

export default nextConfig;
