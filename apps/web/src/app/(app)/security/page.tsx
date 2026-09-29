import type { Metadata } from "next";

import { SecurityView } from "@/components/system/security-view";

export const metadata: Metadata = {
  title: "Security",
  description:
    "Password, two-factor authentication, active sessions and the credentials vault.",
};

export default function SecurityPage() {
  return <SecurityView />;
}
