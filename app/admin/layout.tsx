import { cookies } from "next/headers";

import AdminShell from "@/components/admin/AdminShell";
import { StagingBanner } from "@/components/staging/StagingBanner";
import { shouldShowStagingBanner } from "@/lib/communications/outboundGuard";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import { isOrdersModuleEnabled } from "@/lib/auth/ordersModule";
import { loadScoutNavSeed } from "@/lib/scout/queries";
import { getSiteConfig } from "@/lib/siteConfig";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const site = getSiteConfig();
  const isMasterHeader = site.orgId === "master";
  const scoutNav = isMasterHeader
    ? await loadScoutNavSeed(
        (
          await getAdminUserFromCookieToken((await cookies()).get(ADMIN_SESSION_COOKIE)?.value)
        )?.email,
      )
    : { operator: false, attentionCount: 0 };

  return (
    <>
      {shouldShowStagingBanner() ? <StagingBanner /> : null}
      <AdminShell
        isMasterHeader={isMasterHeader}
        ordersModuleEnabled={isOrdersModuleEnabled()}
        scoutNav={scoutNav}
      >
        {children}
      </AdminShell>
    </>
  );
}
