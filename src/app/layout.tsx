import type { Metadata, Viewport } from "next";
import { Inter_Tight, Source_Serif_4 } from "next/font/google";
import { Suspense } from "react";
import { NavigationProgress } from "@/components/NavigationProgress";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { themeInitScript } from "@/components/ThemeToggle";
import { Toaster } from "@/components/Toast";
import "./globals.css";

// Inter Tight and Source Serif 4 stand in for a Graphik / Tiempos style pairing.
const sans = Inter_Tight({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const serif = Source_Serif_4({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-serif", display: "swap" });

export const metadata: Metadata = {
  title: { default: "MyNews — Weekly Intelligence Briefing", template: "%s · MyNews" },
  description: "A personalized weekly intelligence briefing: the ten things that mattered to you this week, with every claim linked to its source.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0f0f" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
        <Toaster />
      </body>
    </html>
  );
}
