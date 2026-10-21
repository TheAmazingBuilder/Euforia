import type { Metadata } from "next";

import { AuthLayout } from "@/components/auth/auth-layout";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = {
  title: "Create account",
};

export default function RegisterPage() {
  return (
    <AuthLayout title="Create your Euforia account">
      <RegisterForm />
    </AuthLayout>
  );
}
