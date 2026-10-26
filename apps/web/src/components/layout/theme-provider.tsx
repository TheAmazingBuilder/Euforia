"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Theme runtime - next-themes owns the DOM (zero-flash). "system" resolves
 * to the OS preference (Settings §Appearance: Light / Dark / System);
 * the stored default stays dark-blue so first visits keep the brand look.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="dark-blue"
      themes={["dark-blue", "dark", "light", "system"]}
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
