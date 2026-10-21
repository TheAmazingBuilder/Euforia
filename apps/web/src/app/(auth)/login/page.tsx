import { Suspense } from "react";

import type { Metadata } from "next";

import { AuthLayout } from "@/components/auth/auth-layout";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Sign in",
};

/**
 * `<Suspense>` boundary (finalization §62/§78): LoginForm reads
 * `useSearchParams()` (returnTo / reason chips), which triggers a Next.js
 * CSR bailout during prerendering when no boundary wraps it — this broke
 * `next build` (documented in the CI web job and the Phase 1 report).
 * The fallback only renders for the static shell; the form hydrates in.
 */
export default function LoginPage() {
  return (
    <AuthLayout title="Sign in to Euforia">
      <Suspense fallback={<div className="min-h-24" aria-hidden="true" />}>
        <LoginForm />
      </Suspense>
    </AuthLayout>
  );
}
