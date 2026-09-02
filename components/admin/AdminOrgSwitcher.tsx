"use client";

import Link from "next/link";

import {
  CONTENT_ORGS,
  getBracketOrgDisplayName,
  isContentOrgId,
  type BracketOrgId,
} from "@/lib/siteConfig";
import { getLiveContentOrgs } from "@/lib/seasonConfig";

type AdminOrgSwitcherProps = {
  currentOrg: BracketOrgId | null;
  currentPath: string;
  /** When false, hide the aggregate "All Sites" control (e.g. modules that always need a concrete org). */
  showAllSites?: boolean;
  /** Override the list of orgs shown (defaults to CONTENT_ORGS; bracket admin passes BRACKET_ORGS). */
  orgs?: readonly BracketOrgId[];
};

function pathWithOrg(currentPath: string, org: string): string {
  const [pathOnly, existingQuery = ""] = currentPath.split("?");
  const params = new URLSearchParams(existingQuery);
  params.set("org", org);
  const q = params.toString();
  return q ? `${pathOnly}?${q}` : pathOnly;
}

export default function AdminOrgSwitcher({
  currentOrg,
  currentPath,
  showAllSites = true,
  orgs = CONTENT_ORGS,
}: AdminOrgSwitcherProps) {
  const liveOrgs = new Set(getLiveContentOrgs());

  return (
    <div className="w-full rounded-2xl border border-zinc-800 bg-zinc-950/80 p-1.5 sm:w-auto">
      <div className="mb-1 flex items-center gap-2 px-2 py-1">
        <span className="h-2 w-2 rounded-full bg-red-400" />
        <span className="text-[10px] uppercase tracking-[0.24em] text-zinc-400">
          Target Site
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        {showAllSites ? (
          <Link
            href={pathWithOrg(currentPath, "all")}
            className={`inline-flex min-h-10 items-center justify-center rounded-xl border px-3 py-2 text-center text-xs font-semibold transition ${
              currentOrg === null
                ? "border-red-500/60 bg-red-500/10 text-red-100 shadow-[inset_0_0_0_1px_rgba(239,68,68,0.24)]"
                : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500 hover:text-white"
            }`}
          >
            All Sites
          </Link>
        ) : null}
        {orgs.map((org) => {
          const selected = org === currentOrg;
          const live = isContentOrgId(org) && liveOrgs.has(org);
          return (
            <Link
              key={org}
              href={pathWithOrg(currentPath, org)}
              className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-center text-xs font-semibold transition ${
                selected
                  ? "border-red-500/60 bg-red-500/10 text-red-100 shadow-[inset_0_0_0_1px_rgba(239,68,68,0.24)]"
                  : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500 hover:text-white"
              }`}
            >
              {getBracketOrgDisplayName(org)}
              {live ? (
                <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
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
