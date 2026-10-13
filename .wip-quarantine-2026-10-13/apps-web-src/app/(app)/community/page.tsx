import type { Metadata } from "next";

import { CommunityView } from "@/components/social/community-view";
import { getNavItem } from "@/lib/navigation";

const nav = getNavItem("/community");

export const metadata: Metadata = {
  title: nav.label,
};

export default function CommunityPage() {
  return <CommunityView />;
}
