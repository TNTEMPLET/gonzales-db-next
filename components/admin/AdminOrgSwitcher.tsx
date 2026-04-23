import Link from "next/link";

import {
  CONTENT_ORGS,
  getOrgDisplayName,
  type ContentOrgId,
  isMasterDeployment,
} from "@/lib/siteConfig";

type AdminOrgSwitcherProps = {
  currentOrg: ContentOrgId;
  currentPath: string;
};

export default function AdminOrgSwitcher({
  currentOrg,
  currentPath,
}: AdminOrgSwitcherProps) {
  if (!isMasterDeployment()) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-1.5">
      <div className="mb-1 flex items-center gap-2 px-2 py-1">
        <span className="h-2 w-2 rounded-full bg-red-400" />
        <span className="text-[10px] uppercase tracking-[0.24em] text-zinc-400">
          Target Site
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {CONTENT_ORGS.map((org) => {
          const selected = org === currentOrg;
          return (
            <Link
              key={org}
              href={`${currentPath}?org=${org}`}
              className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                selected
                  ? "border-red-500/60 bg-red-500/10 text-red-100 shadow-[inset_0_0_0_1px_rgba(239,68,68,0.24)]"
                  : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500 hover:text-white"
              }`}
            >
              {getOrgDisplayName(org)}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
