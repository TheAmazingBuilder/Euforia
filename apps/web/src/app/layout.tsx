import { Inter, Schibsted_Grotesk, JetBrains_Mono } from "next/font/google";
import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/sonner";
import { BuildStamp } from "@/components/layout/build-stamp";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { MockProvider } from "@/components/providers/mock-provider";
import { I18nProvider } from "@/i18n/i18n-provider";
import { AuthProvider } from "@/components/auth/auth-provider";
import { ServiceWorkerRegister } from "@/components/providers/sw-register";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const grotesk = Schibsted_Grotesk({
  subsets: ["latin"],
  variable: "--font-schibsted",
});
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono" });

export const metadata: Metadata = {
  title: {
    default: "Euforia - Trade smarter. Grow faster.",
    template: "%s - Euforia",
  },
  description:
    "The trading journal that coaches you: capture, grade and review every decision.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
  applicationName: "Euforia",
  openGraph: {
    siteName: "Euforia",
    images: [{ url: "/brand/og-image.png", width: 1200, height: 630 }],
  },
};

export const viewport: Viewport = {
  // i18n: the runtime language default is EN; <html lang> is updated by the
  // I18nProvider (dynamic switching). themeColor mirrors --background.
  themeColor: "#0E1116",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${grotesk.variable} ${mono.variable} font-sans antialiased`}
      >
        <ThemeProvider>
          <QueryProvider>
            {/* MockProvider mounts the (mocked) API before anything consumes
                it; I18nProvider is auth-independent (pure runtime state) and
                must wrap AuthProvider so auth surfaces localize too. The
                runtime language default is EN — <html lang> follows the
                active locale (i18n provider). */}
            <MockProvider>
              <I18nProvider>
                <AuthProvider>{children}</AuthProvider>
              </I18nProvider>
            </MockProvider>
          </QueryProvider>
          <Toaster position="bottom-right" mobileOffset={{ bottom: 84 }} />
        </ThemeProvider>
        <BuildStamp />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
