import type { Metadata } from "next";

import { BookmarksView } from "@/components/academy/bookmarks-view";

export const metadata: Metadata = {
  title: "Bookmarks",
};

export default function AcademyBookmarksPage() {
  return <BookmarksView />;
}
