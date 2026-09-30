import type { Metadata, Viewport } from "next";
import { Newsreader } from "next/font/google";
import { SiteHeader } from "@/components/SiteHeader";
import { themeInitScript } from "@/components/ThemeToggle";
import "./globals.css";

const serif = Newsreader({
  subsets: ["latin"],
  axes: ["opsz"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

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
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={serif.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <SiteHeader />
        <main>{children}</main>
      </body>
    </html>
  );
}
