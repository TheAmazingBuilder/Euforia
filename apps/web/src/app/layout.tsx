import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { MockProvider } from "@/components/providers/mock-provider";
import { ServiceWorkerRegister } from "@/components/providers/sw-register";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const grotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono" });

export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
  applicationName: "Cosmoz",
};

export const viewport: Viewport = {
  themeColor: "#0D1424",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${grotesk.variable} ${mono.variable} font-sans antialiased`}
      >
        <ThemeProvider>
          <QueryProvider>
            <MockProvider>{children}</MockProvider>
          </QueryProvider>
          <Toaster position="bottom-right" mobileOffset={{ bottom: 84 }} />
        </ThemeProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
