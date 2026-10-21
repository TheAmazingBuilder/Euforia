import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthLayout } from "@/components/auth/auth-layout";
import { VerifyEmailView } from "@/components/auth/verify-email-view";

export const metadata: Metadata = {
  title: "Verify email",
};

export default function VerifyEmailPage() {
  return (
    <AuthLayout title="Verify your email address">
      <Suspense
        fallback={
          <div className="mx-auto h-40 w-full max-w-sm animate-pulse rounded-xl bg-muted" />
        }
      >
        <VerifyEmailView />
      </Suspense>
    </AuthLayout>
  );
}
