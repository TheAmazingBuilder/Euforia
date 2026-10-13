import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SectionView } from "@/components/analytics/section-view";
import { atlasSection, ATLAS_SECTIONS } from "@/lib/analytics/atlas";
import { getNavItem } from "@/lib/navigation";

const nav = getNavItem("/analytics");

export function generateStaticParams() {
  return ATLAS_SECTIONS.map((section) => ({ section: section.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>;
}): Promise<Metadata> {
  const { section: sectionId } = await params;
  const section = atlasSection(sectionId);
  return {
    title: section ? `${section.title} · ${nav.label}` : nav.label,
    description:
      section?.description ??
      "Your trade history turned into patterns, edges and honest statistics.",
  };
}

export default async function AnalyticsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section: sectionId } = await params;
  if (!atlasSection(sectionId)) notFound();
  return <SectionView sectionId={sectionId} />;
}
