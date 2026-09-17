import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/shared/page-placeholder";
import { getNavItem } from "@/lib/navigation";

const nav = getNavItem("/journal");

export const metadata: Metadata = {
  title: nav.label,
};

export default function JournalPage() {
  return (
    <PagePlaceholder
      title={nav.label}
      description={nav.description}
      comingSoon={nav.comingSoon}
    />
  );
}
