"use client";

import { usePathname } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";

type AdminShellProps = {
  isMasterHeader: boolean;
  children: React.ReactNode;
};

/**
 * Adds the left-sidebar accordion nav around /admin/* pages -- master admin
 * only, and skipped on the login page (no session to gate nav visibility on
 * yet, and it's not part of the console UI).
 */
export default function AdminShell({ isMasterHeader, children }: AdminShellProps) {
  const pathname = usePathname();

  if (!isMasterHeader || pathname === "/admin/login") {
    return <>{children}</>;
  }

  return (
    <>
      <AdminSidebar />
      {children}
    </>
  );
}
