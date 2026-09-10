"use client";

import Link from "next/link";

import { reportHref, type AdminReportCard } from "@/lib/admin/reportCatalog";
import { CONTENT_ORGS, getOrgDisplayName } from "@/lib/siteConfig";

export default function AdminReportsHub({
  org,
  allSites = false,
  cards,
}: {
  org: string;
  allSites?: boolean;
  cards: AdminReportCard[];
}) {
  if (!cards.length) {
    return <p className="text-sm text-zinc-500">No reports are available for this role.</p>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => (
        <article key={card.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <h2 className="text-lg font-semibold text-white">{card.title}</h2>
          <p className="mt-2 text-sm text-zinc-400">{card.description}</p>
          {allSites && card.splitByOrg ? (
            <ul className="mt-4 space-y-2">
              {CONTENT_ORGS.map((contentOrg) => (
                <li key={contentOrg}>
                  <Link
                    href={reportHref(card, contentOrg)}
                    className="inline-flex min-h-10 items-center text-sm font-semibold text-red-300 hover:text-red-200"
                  >
                    {getOrgDisplayName(contentOrg)} · {card.action}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Link
              href={reportHref(card, org)}
              className="mt-4 inline-flex min-h-10 items-center text-sm font-semibold text-red-300 hover:text-red-200"
            >
              {card.action}
            </Link>
          )}
        </article>
      ))}
    </div>
  );
}
