"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { useAdminSidebar } from "@/components/admin/AdminSidebarProvider";

type AdminShellProps = {
  isMasterHeader: boolean;
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
export default function AdminShell({ isMasterHeader, children }: AdminShellProps) {
  const pathname = usePathname();
  const { collapsed } = useAdminSidebar();

  if (!isMasterHeader || pathname === "/admin/login") {
    return <>{children}</>;
  }

  return (
    <>
      <Suspense fallback={null}>
        <AdminSidebar />
      </Suspense>
      <div className={`transition-[margin-left] duration-200 ${collapsed ? "" : "md:ml-64"}`}>
        {children}
      </div>
    </>
  );
}
