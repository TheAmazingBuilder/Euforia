import type { Metadata } from "next";
import { Suspense } from "react";

import { TwoStepForm } from "@/components/auth/two-step-form";

export const metadata: Metadata = {
  title: "Two-step verification",
};

export default function TwoStepPage() {
  return (
    <Suspense fallback={null}>
      <TwoStepForm />
    </Suspense>
  );
}
