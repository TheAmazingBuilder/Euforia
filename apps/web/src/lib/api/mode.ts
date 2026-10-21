/**
 * Canonical API-mode check — the single source of truth for "is the mock
 * layer active" (MASTER QA spec §14: the REAL API is the default source of
 * application data, and production builds can never ACCIDENTALLY activate
 * the demo providers).
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_API_MOCKED === "true"  → mocked EVERYWHERE (explicit,
 *      documented opt-in for demo/preview deployments).
 *   2. NEXT_PUBLIC_API_MOCKED === "false" → real API everywhere.
 *   3. Unset → NODE_ENV decides:
 *        • development (next dev / unit tooling) → mocked — the zero-env
 *          developer & canonical-preview experience stays functional;
 *        • production build (next build + next start) → REAL API. A
 *          production deployment that forgets its env fails loudly against
 *          the backend instead of silently serving fake financial data.
 *
 * ⚠️ History: the demo affordances (login/register/forgot panels,
 * auth-gate, dev hooks) used to test `NEXT_PUBLIC_API_MOCKED === "true"`
 * while MockProvider defaulted to mocked-on-undefined. The default later
 * became "mocked unless told otherwise" — which satisfied the zero-env
 * preview but meant a zero-env PRODUCTION build served mock trades as if
 * real (exactly the mock-leakage class the MASTER QA audit targets). The
 * explicit-true / production-real matrix above is the documented contract;
 * always import this constant instead of re-deriving.
 */
export const API_MOCKED =
  process.env.NEXT_PUBLIC_API_MOCKED === "true"
    ? true
    : process.env.NEXT_PUBLIC_API_MOCKED === "false"
      ? false
      : process.env.NODE_ENV !== "production";
