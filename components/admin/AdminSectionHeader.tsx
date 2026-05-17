import Link from "next/link";
import AdminOrgSwitcher from "@/components/admin/AdminOrgSwitcher";
import AdminRolePreviewControl from "@/components/admin/AdminRolePreviewControl";
import { isMasterDeployment, type ContentOrgId } from "@/lib/siteConfig";

type AdminSectionHeaderProps = {
  badge: string;
  currentOrg?: ContentOrgId | null;
  currentPath?: string;
  /** Passed to AdminOrgSwitcher on master; default true. */
  orgSwitcherShowAllSites?: boolean;
  allowRolePreview?: boolean;
  allowViewByUser?: boolean;
  moduleHubHref?: string;
  moduleHubLabel?: string;
};

export default function AdminSectionHeader({
  badge,
  currentOrg,
  currentPath,
  orgSwitcherShowAllSites = true,
  allowRolePreview = false,
  allowViewByUser = false,
  moduleHubHref,
  moduleHubLabel = "Module hub",
}: AdminSectionHeaderProps) {
  const adminHref = currentOrg ? `/admin?org=${currentOrg}` : "/admin";

  if (isMasterDeployment()) {
    return (
      <div className="mb-6 rounded-3xl border border-zinc-800 bg-[radial-gradient(circle_at_top_left,rgba(239,68,68,0.16),transparent_30%),radial-gradient(circle_at_top_right,rgba(255,255,255,0.06),transparent_28%),linear-gradient(180deg,rgba(24,24,27,0.96),rgba(9,9,11,0.98))] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.28em] text-red-100">
              <span className="h-2 w-2 rounded-full bg-red-400" />
              {badge}
            </div>
            <p className="text-sm text-zinc-400">
              AP Baseball command layer for cross-site publishing, moderation,
              and operations.
            </p>
          </div>
          <div className="flex min-w-0 flex-col gap-3 xl:items-end">
            {currentPath ? (
              <AdminOrgSwitcher
                currentOrg={currentOrg ?? null}
                currentPath={currentPath}
                showAllSites={orgSwitcherShowAllSites}
              />
            ) : null}
            <AdminRolePreviewControl
              enabled={allowRolePreview}
              currentOrg={currentOrg ?? undefined}
              allowViewByUser={allowViewByUser}
            />
            {moduleHubHref ? (
              <Link
                href={moduleHubHref}
                className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-red-200 transition hover:text-red-100"
              >
                <span aria-hidden="true">←</span>
                {moduleHubLabel}
              </Link>
            ) : null}
            <Link
              href={adminHref}
              className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-red-200 transition hover:text-red-100"
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
    <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="inline-block self-start rounded-full bg-brand-purple px-4 py-2 text-[11px] tracking-[2px] sm:px-6 sm:text-xs sm:tracking-[3px]">
        {badge}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <AdminRolePreviewControl
          enabled={allowRolePreview}
          currentOrg={currentOrg ?? undefined}
          allowViewByUser={allowViewByUser}
        />
        {isMasterDeployment() && currentOrg && currentPath ? (
          <AdminOrgSwitcher currentOrg={currentOrg} currentPath={currentPath} />
        ) : null}
        {moduleHubHref ? (
          <Link href={moduleHubHref} className="inline-flex min-h-10 items-center text-brand-gold hover:text-brand-gold/80">
            {moduleHubLabel}
          </Link>
        ) : null}
        <Link
          href={adminHref}
          className="inline-flex min-h-10 items-center text-brand-gold hover:text-brand-gold/80"
        >
          Back to Admin Dashboard
        </Link>
      </div>
    </div>
  );
}
