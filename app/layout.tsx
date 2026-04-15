import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import Header from "../components/Header";
import Footer from "../components/Footer";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Gonzales Diamond Baseball | Youth Baseball League in Gonzales, LA",
  description:
    "Official home of Gonzales Diamond Baseball (DYB) in Ascension Parish. Spring 2026 registration, schedules, standings, field status, and live GameChanger scores for ages 3–12.",
  keywords: [
    "Gonzales youth baseball",
    "Gonzales Diamond Baseball",
    "Ascension Parish baseball",
    "DYB Gonzales LA",
    "Tee-Joe Gonzales Park baseball",
  ],
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <SpeedInsights />
      <body className={`${inter.className} bg-zinc-950 text-white antialiased`}>
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}
