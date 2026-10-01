import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthLayout } from "@/components/auth/auth-layout";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = {
  title: "Reset password",
};

export default function ResetPasswordPage() {
  return (
    <AuthLayout title="Choose a new password">
      <Suspense
        fallback={
          <div className="mx-auto h-40 w-full max-w-sm animate-pulse rounded-xl bg-muted" />
        }
      >
        <ResetPasswordForm />
      </Suspense>
    </AuthLayout>
  );
}
