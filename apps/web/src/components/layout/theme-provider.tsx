"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";

/**
 * Normalize the retired dark-blue preference for existing installations.
 */
function LegacyThemeMigration() {
  const { theme, setTheme } = useTheme();

  React.useEffect(() => {
    if (theme === "dark-blue") setTheme("dark");
  }, [theme, setTheme]);

  return null;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="dark"
      themes={["dark", "light", "system"]}
      enableSystem
      disableTransitionOnChange
    >
      <LegacyThemeMigration />
      {children}
    </NextThemesProvider>
  );
}
