"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";

/**
 * Normalize the retired dark-blue preference for existing installations.
 */
function LegacyThemeMigration() {
  const { theme, setTheme } = useTheme();

  React.useEffect(() => {
    if (theme === "dark-blue") setTheme("navy-blue");
  }, [theme, setTheme]);

  return null;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="dark"
      themes={["dark", "light", "system", "navy-blue", "euforia"]}
      enableSystem
      disableTransitionOnChange
    >
      <LegacyThemeMigration />
      {children}
    </NextThemesProvider>
  );
}
