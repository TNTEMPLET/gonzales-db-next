import type { Metadata } from "next";

import {
  SponsorMarquee,
  type SponsorScrollerItem,
} from "@/components/sponsors/SponsorMarquee";

export const metadata: Metadata = {
  title: "Sample sponsor scroller",
  robots: { index: false, follow: false },
};

/** Static placeholders using repo public assets — same marquee as the live footer. */
const SAMPLE_SPONSORS: SponsorScrollerItem[] = [
  {
    sponsorId: "sample-1",
    businessName: "River City Grill",
    logoUrl: "/vercel.svg",
    logoAlt: "River City Grill",
    websiteUrl: "https://example.com",
    sortOrder: 10,
  },
  {
    sponsorId: "sample-2",
    businessName: "First Parish Bank",
    logoUrl: "/window.svg",
    logoAlt: "First Parish Bank",
    websiteUrl: "https://example.com",
    sortOrder: 20,
  },
  {
    sponsorId: "sample-3",
    businessName: "Ascension Athletics",
    logoUrl: "/file.svg",
    logoAlt: "Ascension Athletics",
    websiteUrl: null,
    sortOrder: 30,
  },
  {
    sponsorId: "sample-4",
    businessName: "Bayou Ice House",
    logoUrl: "/vercel.svg",
    logoAlt: "Bayou Ice House",
    websiteUrl: "https://example.com",
    sortOrder: 40,
  },
  {
    sponsorId: "sample-5",
    businessName: "Pelican Print Shop",
    logoUrl: "/window.svg",
    logoAlt: "Pelican Print Shop",
    websiteUrl: "https://example.com",
    sortOrder: 50,
  },
];

export default function SampleSponsorScrollerPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="border-b border-zinc-800 bg-zinc-900/50 px-6 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Sample sponsor scroller
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-400">
          Preview of the footer marquee animation and pill styling. Real sponsors
          use uploaded logos from admin; this page uses placeholder SVGs from{" "}
          <code className="text-zinc-300">/public</code>.
        </p>
        <p className="mt-3 text-xs text-zinc-500">
          Path: <code className="text-zinc-400">/sample-sponsor-scroller</code>
        </p>
      </div>
      <div className="px-6 pt-8">
        <p className="mb-4 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Marquee (hover to pause)
        </p>
        <SponsorMarquee items={SAMPLE_SPONSORS} />
      </div>
    </main>
  );
}
