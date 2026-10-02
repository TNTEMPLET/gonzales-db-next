import AdminShell from "@/components/admin/AdminShell";
import { StagingBanner } from "@/components/staging/StagingBanner";
import { shouldShowStagingBanner } from "@/lib/communications/outboundGuard";
import { isOrdersModuleEnabled } from "@/lib/auth/ordersModule";
import { getSiteConfig } from "@/lib/siteConfig";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const site = getSiteConfig();
  const isMasterHeader = site.orgId === "master";

  return (
    <>
      {shouldShowStagingBanner() ? <StagingBanner /> : null}
      <AdminShell isMasterHeader={isMasterHeader} ordersModuleEnabled={isOrdersModuleEnabled()}>
        {children}
      </AdminShell>
    </>
  );
}
