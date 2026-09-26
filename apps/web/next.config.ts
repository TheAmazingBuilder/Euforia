import type { NextConfig } from "next";

/**
 * Market service proxy — local dev has no gateway in front of Next, so the
 * realtime endpoints must reach the socket.io market service directly.
 * In the sandbox preview the gateway routes on XTransformPort BEFORE Next
 * sees the request; these rewrites only fire when it doesn't.
 */
const MARKET_SERVICE = "http://localhost:3003";

const nextConfig: NextConfig = {
  transpilePackages: ["@cosmoz/shared"],
  async rewrites() {
    return [
      { source: "/prices", destination: `${MARKET_SERVICE}/prices` },
      { source: "/candles", destination: `${MARKET_SERVICE}/candles` },
      { source: "/health", destination: `${MARKET_SERVICE}/health` },
      { source: "/socket.io/:path*", destination: `${MARKET_SERVICE}/socket.io/:path*` },
    ];
  },
};

export default nextConfig;
