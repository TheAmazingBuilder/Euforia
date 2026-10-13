import type { Metadata } from "next";

import { GlossaryView } from "@/components/academy/glossary-view";

export const metadata: Metadata = {
  title: "Glossary",
};

export default function AcademyGlossaryPage() {
  return <GlossaryView />;
}
