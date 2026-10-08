"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { useAdminSidebar } from "@/components/admin/AdminSidebarProvider";

type AdminShellProps = {
  isMasterHeader: boolean;
  ordersModuleEnabled: boolean;
  scoutNav: { operator: boolean; attentionCount: number };
  /** Park directors get Game Day, not the full sidebar. */
  trimSidebar?: boolean;
  children: React.ReactNode;
};

/**
 * Adds the left-sidebar accordion nav around /admin/* pages -- master admin
 * only, and skipped on the login page (no session to gate nav visibility on
 * yet, and it's not part of the console UI).
 *
 * The sidebar itself is `position: fixed` (AdminSidebar.tsx), so on its own
 * it would overlay page content rather than push it aside. On md+ screens
 * the content column below gets a matching left margin whenever the
 * sidebar is open, so opening/closing it reflows the page instead of
 * covering it; on narrow screens the sidebar's own backdrop-and-overlay
 * behavior (already `md:hidden`) is left as the better fit -- there isn't
 * room to push content aside on a phone.
 */
export default function AdminShell({
  isMasterHeader,
  ordersModuleEnabled,
  scoutNav,
  trimSidebar = false,
  children,
}: AdminShellProps) {
  const pathname = usePathname();
  const { collapsed } = useAdminSidebar();
  const onGameDay = pathname === "/admin/game-day" || pathname.startsWith("/admin/game-day/");

  if (!isMasterHeader || pathname === "/admin/login" || trimSidebar) {
    return (
      <>
        {trimSidebar && pathname !== "/admin/login" && !onGameDay ? (
          <div className="border-b border-neutral-300 bg-neutral-100 px-4 py-2">
            <Link href="/admin/game-day" className="text-sm font-semibold text-neutral-950">
              Game Day
            </Link>
          </div>
        ) : null}
        {children}
      </>
    );
  }

  return (
    <>
      <Suspense fallback={null}>
        <AdminSidebar
          ordersModuleEnabled={ordersModuleEnabled}
          scoutNav={scoutNav}
          masterDeployment={isMasterHeader}
        />
      </Suspense>
      <div className={`transition-[margin-left] duration-200 ${collapsed ? "" : "md:ml-64"}`}>
        {children}
      </div>
    </>
  );
}
