import AdminShell from "@/components/admin/AdminShell";
import { getSiteConfig } from "@/lib/siteConfig";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const site = getSiteConfig();
  const isMasterHeader = site.orgId === "master";

  return <AdminShell isMasterHeader={isMasterHeader}>{children}</AdminShell>;
}
