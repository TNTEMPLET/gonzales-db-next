"use client";

import Link from "next/link";

import {
  BRACKET_ORGS,
  getBracketOrgDisplayName,
  type BracketOrgId,
  type ContentOrgId,
} from "@/lib/siteConfig";

type AdminOrgSwitcherProps = {
  currentOrg: BracketOrgId | null;
  currentPath: string;
  /** When false, hide the aggregate "All Sites" control (e.g. modules that always need a concrete org). */
  showAllSites?: boolean;
  /** Override the list of orgs shown (defaults to BRACKET_ORGS). Pass CONTENT_ORGS for league-only pages. */
  orgs?: readonly BracketOrgId[];
};

export default function AdminOrgSwitcher({
  currentOrg,
  currentPath,
  showAllSites = true,
  orgs = BRACKET_ORGS,
}: AdminOrgSwitcherProps) {
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
            href={currentPath}
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
          return (
            <Link
              key={org}
              href={`${currentPath}?org=${org}`}
              className={`inline-flex min-h-10 items-center justify-center rounded-xl border px-3 py-2 text-center text-xs font-semibold transition ${
                selected
                  ? "border-red-500/60 bg-red-500/10 text-red-100 shadow-[inset_0_0_0_1px_rgba(239,68,68,0.24)]"
                  : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500 hover:text-white"
              }`}
            >
              {getBracketOrgDisplayName(org)}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
