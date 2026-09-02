"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  getMinimumRoleForModule,
  hasAdminRoleAtLeast,
  isAdminRole,
  toAdminRole,
  type AdminModule,
  type AdminRole,
} from "@/lib/auth/adminRoles";
import { isAdminModuleEnabledForOrg, isContentOrgId } from "@/lib/siteConfig";
import { isCoachingInterestEnabled } from "@/lib/org/capabilities";
import { getPrimaryLiveContentOrg } from "@/lib/seasonConfig";
import { buildAdminSidebarNav, type AdminSidebarSubcategory } from "@/lib/admin/sidebarNav";
import { useAdminSidebar } from "@/components/admin/AdminSidebarProvider";

type AdminMeResponse = {
  authenticated: boolean;
  user?: { role?: string; isMaster?: boolean };
};

function pathKeyOf(href: string): string {
  return href.split("?")[0] ?? href;
}

export default function AdminSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { collapsed, toggleCollapsed, isSubcategoryOpen, toggleSubcategory } = useAdminSidebar();
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);

  const currentOrgParam = searchParams.get("org");

  useEffect(() => {
    let active = true;
    fetch("/api/admin/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: AdminMeResponse | null) => {
        if (!active) return;
        const roleValue = json?.user?.role;
        const isMaster = Boolean(json?.user?.isMaster);
        setAdminRole(isMaster ? "MASTER_ADMIN" : isAdminRole(roleValue) ? roleValue : null);
      })
      .catch(() => {
        if (active) setAdminRole(null);
      });
    return () => {
      active = false;
    };
  }, []);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-label="Open admin menu"
        className="fixed left-0 top-1/2 z-40 flex h-12 w-6 -translate-y-1/2 items-center justify-center rounded-r-full border border-l-0 border-zinc-800 bg-zinc-900/90 text-zinc-500 shadow-lg backdrop-blur transition-colors hover:border-red-900/50 hover:text-red-200"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
        </svg>
      </button>
    );
  }

  const masterRole = adminRole ? toAdminRole(adminRole) : null;
  const effectiveOrgParam = currentOrgParam ?? getPrimaryLiveContentOrg();
  const orgSuffix = `?org=${encodeURIComponent(effectiveOrgParam)}`;
  const currentMasterOrg = isContentOrgId(effectiveOrgParam) ? effectiveOrgParam : null;

  const allowModule = (module: AdminModule) => {
    if (!isAdminModuleEnabledForOrg(currentMasterOrg, module)) return false;
    if (!masterRole) return true;
    return hasAdminRoleAtLeast(masterRole, getMinimumRoleForModule(module));
  };

  const canCoachingInterest =
    allowModule("TEAMS") && isCoachingInterestEnabled(currentMasterOrg ?? "gonzales");

  const nav = buildAdminSidebarNav(allowModule, canCoachingInterest, orgSuffix);

  function isLeafActive(href: string) {
    return pathname === pathKeyOf(href);
  }

  function subcategoryContainsActivePage(sub: AdminSidebarSubcategory) {
    return sub.leaves.some((leaf) => pathname.startsWith(pathKeyOf(leaf.href)));
  }

  const dashboardActive = pathname === "/admin";

  return (
    <>
      {/* Backdrop -- closes the sidebar on outside click, mainly useful on
          narrow screens where the sidebar overlays page content. */}
      <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={toggleCollapsed} aria-hidden />
      <aside className="fixed left-0 top-16 z-40 h-[calc(100vh-4rem)] w-64 overflow-y-auto border-r border-red-900/40 bg-zinc-950 shadow-2xl">
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label="Collapse admin menu"
          className="absolute -right-3 top-1/2 z-50 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-zinc-500 shadow-lg transition-colors hover:border-red-900/50 hover:text-red-200"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <nav className="px-3 py-4 text-sm">
        <Link
          href={nav.dashboardHref}
          className={`mb-3 block rounded-md px-3 py-2 font-semibold transition-colors ${
            dashboardActive
              ? "bg-red-950/40 text-red-200"
              : "text-zinc-200 hover:bg-red-950/25 hover:text-red-100"
          }`}
        >
          Dashboard
        </Link>

        {nav.groups.map((group) => (
          <div key={group.id} className="mb-4">
            <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-red-400/90">
              {group.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {group.subcategories.map((sub) => {
                const forceOpen = subcategoryContainsActivePage(sub);
                const open = forceOpen || isSubcategoryOpen(sub.id);
                return (
                  <div key={sub.id}>
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => toggleSubcategory(sub.id)}
                      className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left font-medium text-zinc-200 transition-colors hover:bg-red-950/20 hover:text-red-100"
                    >
                      {sub.label}
                      <svg
                        className={`h-3.5 w-3.5 shrink-0 opacity-70 transition-transform ${open ? "rotate-180" : ""}`}
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        aria-hidden
                      >
                        <path d="M7 10l5 5 5-5z" />
                      </svg>
                    </button>
                    {open && (
                      <div className="ml-3 flex flex-col gap-0.5 border-l border-red-900/40 pl-3">
                        {sub.leaves.map((leaf) => {
                          const active = isLeafActive(leaf.href);
                          return (
                            <Link
                              key={leaf.id}
                              href={leaf.href}
                              className={`rounded-md px-3 py-1.5 text-[13px] transition-colors ${
                                active
                                  ? "bg-red-950/35 text-red-200"
                                  : "text-zinc-300 hover:bg-red-950/20 hover:text-red-100"
                              }`}
                            >
                              {leaf.label}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        </nav>
      </aside>
    </>
  );
}
