"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import AdminCommunicationsManager from "@/components/admin/AdminCommunicationsManager";
import NewsAdminPanel from "@/components/news/NewsAdminPanel";
import AdminSocialManager from "@/components/admin/AdminSocialManager";
import DugoutModerationPanel from "@/components/admin/DugoutModerationPanel";
import OrgDocumentsManager from "@/components/admin/OrgDocumentsManager";
import type { ContentOrgId } from "@/lib/siteConfig";

export type PublishingTab = "comms" | "news" | "social" | "dugout" | "drive";

const TAB_META: Record<PublishingTab, { label: string; description: string }> = {
  comms: {
    label: "Email Campaigns",
    description: "Targeted broadcast emails (Resend) with approval workflow and unsubscribe policy.",
  },
  news: {
    label: "League News",
    description: "Create, edit, publish, and feature news stories for public site banners.",
  },
  social: {
    label: "Social Media",
    description: "Compose and post announcements directly to the AP Baseball Facebook Page.",
  },
  dugout: {
    label: "Dugout Feed",
    description: "Moderate coach posts, safety discussions, and community feed interactions.",
  },
  drive: {
    label: "Google Drive",
    description: "Access shared organizational policy documents, templates, and archives.",
  },
};

export default function PublishingHub({
  targetOrg,
  initialTab,
  isMaster,
}: {
  targetOrg: ContentOrgId;
  initialTab: PublishingTab;
  isMaster: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tab = useMemo(() => {
    const fromUrl = searchParams.get("tab") as PublishingTab;
    if (fromUrl && TAB_META[fromUrl]) return fromUrl;
    return initialTab;
  }, [searchParams, initialTab]);

  const setTab = useCallback(
    (next: PublishingTab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", next);
      params.set("org", targetOrg);
      router.push(`/admin/publishing?${params.toString()}`);
    },
    [router, searchParams, targetOrg],
  );

  return (
    <div className="space-y-6">
      <div className="border-b border-zinc-800">
        <nav className="-mb-px flex flex-wrap gap-2 sm:gap-6" aria-label="Publishing Hub Sections">
          {(Object.keys(TAB_META) as PublishingTab[]).map((t) => {
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
        {tab === "comms" && <AdminCommunicationsManager targetOrg={targetOrg} />}
        {tab === "news" && <NewsAdminPanel orgId={targetOrg} />}
        {tab === "social" && <AdminSocialManager />}
        {tab === "dugout" && <DugoutModerationPanel targetOrg={targetOrg} />}
        {tab === "drive" && <OrgDocumentsManager targetOrg={targetOrg} />}
      </div>
    </div>
  );
}
