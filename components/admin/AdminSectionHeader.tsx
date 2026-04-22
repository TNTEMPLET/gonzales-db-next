import Link from "next/link";
import AdminOrgSwitcher from "@/components/admin/AdminOrgSwitcher";
import type { ContentOrgId } from "@/lib/siteConfig";

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
