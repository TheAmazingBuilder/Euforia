"use client";

import * as React from "react";

import { usePreferences } from "@/lib/api/queries";

/**
 * Applies the saved density preference app-wide via [data-density] on
 * <html>. Mounted once in the app shell; the CSS side (globals.css) maps
 * the attribute to tighter card spacing. COMFORTABLE removes the attribute
 * so the default rhythm stays untouched.
 */
export function DensitySync() {
  const { data } = usePreferences();
  const density = data?.appearance.density ?? "COMFORTABLE";

  React.useEffect(() => {
    const root = document.documentElement;
    if (density === "COMPACT") {
      root.dataset.density = "compact";
    } else {
      delete root.dataset.density;
    }
    return () => {
      delete root.dataset.density;
    };
  }, [density]);

  return null;
}
