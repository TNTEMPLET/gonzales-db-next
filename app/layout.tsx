import type { Metadata } from "next";
import { Suspense } from "react";
import { Inter } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import Header from "../components/Header";
import Footer from "../components/Footer";
import SponsorScroller from "../components/sponsors/SponsorScroller";
import { getSiteConfig, isTournamentOnlyDeployment } from "@/lib/siteConfig";

const inter = Inter({ subsets: ["latin"] });

const site = getSiteConfig();

export const metadata: Metadata = {
  title: site.name,
  description: site.description,
  icons: {
    icon: [{ url: site.faviconPath, type: "image/png" }],
    shortcut: [site.faviconPath],
    apple: [{ url: site.faviconPath, type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const brand = {
    tournamentOnly: isTournamentOnlyDeployment(),
    name: site.name,
    shortName: site.shortName,
    displayNameLine1: site.displayNameLine1,
    displayNameLine2: site.displayNameLine2,
    logoPath: site.logoPath,
  };

  const orgCss = `
    :root {
      --org-primary: ${site.colorPrimary};
      --org-primary-dark: ${site.colorPrimaryDark};
      --org-accent: ${site.colorAccent};
    }
  `;

  return (
    <html lang="en" className="dark">
      <head>
        {/* Inject org brand colors before any other styles */}
        <style dangerouslySetInnerHTML={{ __html: orgCss }} />
      </head>
      <SpeedInsights />
      <body className={`${inter.className} bg-zinc-950 text-white antialiased`}>
        <Suspense fallback={<div className="h-16 border-b border-zinc-800 bg-zinc-950" aria-hidden />}>
          <Header brand={brand} />
        </Suspense>
        {children}
        <Footer brand={brand} />
        <SponsorScroller />
      </body>
    </html>
  );
}
