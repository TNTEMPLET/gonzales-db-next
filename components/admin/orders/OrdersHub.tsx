"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import ParentCapOrdersPanel from "@/components/admin/capOrders/ParentCapOrdersPanel";
import ParentShirtOrdersPanel from "@/components/admin/shirtOrders/ParentShirtOrdersPanel";
import AdminSponsorsManager from "@/components/admin/AdminSponsorsManager";
import AdminReportsManager from "@/components/admin/AdminReportsManager";
import type { ContentOrgId } from "@/lib/siteConfig";

export type OrdersTab = "caps" | "shirts" | "sponsors" | "reports";

const TAB_META: Record<OrdersTab, { label: string; description: string }> = {
  caps: {
    label: "Cap Orders",
    description: "Review and fulfill player/coach cap orders and size distributions.",
  },
  shirts: {
    label: "Championship Shirts",
    description: "Manage All-Star championship shirt orders, sizes, and team lists.",
  },
  sponsors: {
    label: "Sponsor Packages",
    description: "Manage sponsorship packages, logos, and footer placements.",
  },
  reports: {
    label: "Umpire Pay Reports",
    description: "Audit umpire game-pay payouts and operational summaries. For registration revenue, see Enrollment & KPIs under Competition & Play.",
  },
};

export default function OrdersHub({
  targetOrg,
  initialTab,
  isMaster,
}: {
  targetOrg: ContentOrgId;
  initialTab: OrdersTab;
  isMaster: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tab = useMemo(() => {
    const fromUrl = searchParams.get("tab") as OrdersTab;
    if (fromUrl && TAB_META[fromUrl]) return fromUrl;
    return initialTab;
  }, [searchParams, initialTab]);

  const setTab = useCallback(
    (next: OrdersTab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", next);
      params.set("org", targetOrg);
      router.push(`/admin/orders?${params.toString()}`);
    },
    [router, searchParams, targetOrg],
  );

  return (
    <div className="space-y-6">
      <div className="border-b border-zinc-800">
        <nav className="-mb-px flex flex-wrap gap-2 sm:gap-6" aria-label="Orders Hub Sections">
          {(Object.keys(TAB_META) as OrdersTab[]).map((t) => {
            const active = tab === t;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`border-b-2 pb-3 text-sm font-semibold transition-colors ${
                  active
                    ? "border-red-500 text-white"
                    : "border-transparent text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                }`}
              >
                {TAB_META[t].label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6">
        <p className="mb-6 text-sm text-zinc-400">{TAB_META[tab].description}</p>
        {tab === "caps" && <ParentCapOrdersPanel />}
        {tab === "shirts" && <ParentShirtOrdersPanel />}
        {tab === "sponsors" && <AdminSponsorsManager targetOrg={targetOrg} />}
        {tab === "reports" && <AdminReportsManager targetOrg={targetOrg} />}
      </div>
    </div>
  );
}
