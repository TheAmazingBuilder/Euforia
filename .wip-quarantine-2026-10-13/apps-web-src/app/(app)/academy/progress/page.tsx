import type { Metadata } from "next";

import { ProgressView } from "@/components/academy/progress-view";

export const metadata: Metadata = {
  title: "Progress",
};

export default function AcademyProgressPage() {
  return <ProgressView />;
}
