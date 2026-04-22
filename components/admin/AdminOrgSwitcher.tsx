import Link from "next/link";

import {
  CONTENT_ORGS,
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
    <div className="flex items-center gap-2">
      <span className="text-xs uppercase tracking-[2px] text-zinc-400">
        Org
      </span>
      {CONTENT_ORGS.map((org) => {
        const selected = org === currentOrg;
        return (
          <Link
            key={org}
            href={`${currentPath}?org=${org}`}
            className={`rounded-md px-2.5 py-1 text-xs capitalize border ${
              selected
                ? "border-brand-gold text-brand-gold bg-brand-gold/10"
                : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
            }`}
          >
            {org}
          </Link>
        );
      })}
    </div>
  );
}
