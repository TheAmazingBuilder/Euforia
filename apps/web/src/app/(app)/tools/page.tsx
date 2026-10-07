import { redirect } from "next/navigation";

/**
 * /tools — the TOOLS section has no index surface (the sidebar navigates
 * directly to the two calculators, matching the app's sectioned-nav
 * architecture); the bare path lands on the first tool instead of a 404.
 */
export default function ToolsIndexPage() {
  redirect("/tools/lot-size");
}
