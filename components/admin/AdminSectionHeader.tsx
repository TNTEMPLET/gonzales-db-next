import Link from "next/link";
import AdminOrgSwitcher from "@/components/admin/AdminOrgSwitcher";
import { isMasterDeployment, type ContentOrgId } from "@/lib/siteConfig";

type AdminSectionHeaderProps = {
  badge: string;
  currentOrg?: ContentOrgId;
  currentPath?: string;
};

export default function AdminSectionHeader({
  badge,
  currentOrg,
  currentPath,
}: AdminSectionHeaderProps) {
  const adminHref = currentOrg ? `/admin?org=${currentOrg}` : "/admin";

  if (isMasterDeployment()) {
    return (
      <div className="mb-6 rounded-3xl border border-zinc-800 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_30%),radial-gradient(circle_at_top_right,rgba(251,191,36,0.12),transparent_28%),linear-gradient(180deg,rgba(24,24,27,0.96),rgba(9,9,11,0.98))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-200">
              <span className="h-2 w-2 rounded-full bg-cyan-300" />
              {badge}
            </div>
            <p className="text-sm text-zinc-400">
              AP Baseball command layer for cross-site publishing, moderation,
              and operations.
            </p>
          </div>
          <div className="flex flex-col gap-3 xl:items-end">
            {currentOrg && currentPath ? (
              <AdminOrgSwitcher
                currentOrg={currentOrg}
                currentPath={currentPath}
              />
            ) : null}
            <Link
              href={adminHref}
              className="inline-flex items-center gap-2 text-sm font-semibold text-amber-300 transition hover:text-amber-200"
            >
              <span aria-hidden="true">←</span>
              Control Center Overview
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4 mb-4">
      <div className="inline-block bg-brand-purple text-xs tracking-[3px] px-6 py-2 rounded-full">
        {badge}
      </div>
      <div className="flex items-center gap-4 text-sm">
        {currentOrg && currentPath ? (
          <AdminOrgSwitcher currentOrg={currentOrg} currentPath={currentPath} />
        ) : null}
        <Link
          href={adminHref}
          className="text-brand-gold hover:text-brand-gold/80"
        >
          Back to Admin Dashboard
        </Link>
      </div>
    </div>
  );
}
