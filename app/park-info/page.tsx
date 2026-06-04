import { marked } from "marked";
import { connection } from "next/server";
import Image from "next/image";
import prisma from "@/lib/prisma";
import { getBracketOrgForDeployment, getBracketOrgDisplayName, getSiteConfig } from "@/lib/siteConfig";

export const dynamic = "force-dynamic";

marked.use({ gfm: true, breaks: true });

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Park Info | ${site.name}`,
    description: `Tournament rules, parking, and field layout for ${site.name}.`,
  };
}

export default async function ParkInfoPage() {
  await connection();
  const org = getBracketOrgForDeployment();
  const row = await prisma.parkInfoPage.findUnique({ where: { organizationId: org } });

  const rulesHtml = row?.rulesMarkdown?.trim()
    ? await marked.parse(row.rulesMarkdown)
    : null;
  const parkingHtml = row?.parkingMarkdown?.trim()
    ? await marked.parse(row.parkingMarkdown)
    : null;

  const hasAnyContent = !!(rulesHtml || parkingHtml || row?.fieldLayoutImageUrl);

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="mb-8 sm:mb-10">
          <div className="inline-block rounded-full bg-brand-purple px-4 py-2 text-[11px] tracking-[2px] sm:px-6 sm:text-xs sm:tracking-[3px]">
            PARK INFO
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-5xl">
            {getBracketOrgDisplayName(org)} Info
          </h1>
          <p className="mt-3 text-sm text-zinc-400">
            Tournament rules, parking details, and field layout.
          </p>
        </div>

        {!hasAnyContent ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-8 text-center">
            <h2 className="text-xl font-semibold text-zinc-100">No information posted yet</h2>
            <p className="mt-2 text-sm text-zinc-400">Check back soon for rules and park details.</p>
          </div>
        ) : (
          <div className="space-y-10">
            {rulesHtml ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 sm:p-8">
                <h2 className="mb-4 text-xl font-bold text-white sm:text-2xl">Tournament Rules</h2>
                <div
                  className="prose prose-invert max-w-none prose-p:text-zinc-300 prose-headings:text-white prose-a:text-brand-gold prose-li:text-zinc-300 prose-strong:text-white"
                  dangerouslySetInnerHTML={{ __html: rulesHtml }}
                />
              </div>
            ) : null}

            {parkingHtml ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 sm:p-8">
                <h2 className="mb-4 text-xl font-bold text-white sm:text-2xl">Parking Information</h2>
                <div
                  className="prose prose-invert max-w-none prose-p:text-zinc-300 prose-headings:text-white prose-a:text-brand-gold prose-li:text-zinc-300 prose-strong:text-white"
                  dangerouslySetInnerHTML={{ __html: parkingHtml }}
                />
              </div>
            ) : null}

            {row?.fieldLayoutImageUrl ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 sm:p-8">
                <h2 className="mb-4 text-xl font-bold text-white sm:text-2xl">Field Layout</h2>
                <div className="relative w-full overflow-hidden rounded-lg border border-zinc-700">
                  <Image
                    src={row.fieldLayoutImageUrl}
                    alt="Field layout diagram"
                    width={1200}
                    height={800}
                    className="w-full h-auto object-contain"
                    unoptimized
                  />
                </div>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </main>
  );
}
