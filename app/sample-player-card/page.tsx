import type { Metadata } from "next";

import SamplePlayerCardClient from "@/components/players/SamplePlayerCardClient";

export const metadata: Metadata = {
  title: "Sample Player Card",
  robots: { index: false, follow: false },
};

/**
 * Public UI preview of Player Cards (demo data only, not roster-backed).
 * Mirrors sample-sponsor-scroller for design review without admin login.
 */
export default function SamplePlayerCardPage() {
  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-2xl px-4 sm:px-6">
        <div className="mb-8">
          <div className="mb-4 inline-block rounded-full bg-brand-purple px-4 py-2 text-[11px] tracking-[2px] sm:px-6 sm:text-xs sm:tracking-[3px]">
            SAMPLE · DEMO ONLY
          </div>
          <h1 className="mb-3 text-3xl font-bold tracking-tight md:text-4xl">
            Sample Player Card
          </h1>
          <p className="max-w-xl text-zinc-400">
            Preview of the Player Card UI used in Admin Teams and Coach Corner.
            Data is fictional and is not saved to any roster.
          </p>
        </div>
        <SamplePlayerCardClient organizationId="gonzales" seasonYear={2026} />
      </section>
    </main>
  );
}
