import type { Metadata } from "next";
import { redirect } from "next/navigation";

/**
 * Goals fused into the Trade Review module — this route stays alive only to
 * redirect stale deep-links to the Goals tab.
 */
export const metadata: Metadata = {
  title: "Goals",
  description: "Redirected — goal setting and progress tracking now live inside Trade Review.",
};

export default function GoalsPage() {
  redirect("/journal?tab=goals");
}
