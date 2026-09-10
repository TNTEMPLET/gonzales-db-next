import Link from "next/link";

import { CONTENT_ORGS, getOrgDisplayName } from "@/lib/siteConfig";
import { getLiveContentOrgs } from "@/lib/seasonConfig";

export default function ReportOrgPicker({
  path,
  title,
}: {
  path: string;
  title: string;
}) {
  const liveOrgs = new Set(getLiveContentOrgs());

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
      <p className="max-w-2xl text-sm text-zinc-400">
        {title} is kept separate for Gonzales, Ascension, and Fall Ball. Pick an organization —
        those totals are never combined.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {CONTENT_ORGS.map((org) => {
          const params = new URLSearchParams({ org });
          return (
            <Link
              key={org}
              href={`${path}?${params.toString()}`}
              className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm font-semibold text-red-300 hover:border-red-500/50 hover:text-red-200"
            >
              <span className="block text-white">{getOrgDisplayName(org)}</span>
              {liveOrgs.has(org) ? (
                <span className="mt-1 inline-block text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                  Live
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
