import type { Metadata } from "next";

import { PracticeView } from "@/components/academy/practice-view";

export const metadata: Metadata = {
  title: "Practice",
};

export default function AcademyPracticePage() {
  return <PracticeView />;
}
