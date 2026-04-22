import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { getSiteConfig } from "@/lib/siteConfig";

const inter = Inter({ subsets: ["latin"] });

const site = getSiteConfig();

export const metadata: Metadata = {
  title: site.name,
  description: site.description,
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const orgCss = `
    :root {
      --org-primary: ${site.colorPrimary};
      --org-primary-dark: ${site.colorPrimaryDark};
      --org-accent: ${site.colorAccent};
    }
  `;

  return (
    <html lang="en">
      <head>
        {/* Inject org brand colors before any other styles */}
        <style dangerouslySetInnerHTML={{ __html: orgCss }} />
      </head>
      <SpeedInsights />
      <body className={`${inter.className} bg-zinc-950 text-white antialiased`}>
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}
