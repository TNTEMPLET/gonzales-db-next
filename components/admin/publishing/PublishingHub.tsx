"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import AdminCommunicationsManager from "@/components/admin/AdminCommunicationsManager";
import NewsAdminPanel from "@/components/news/NewsAdminPanel";
import AdminSocialManager from "@/components/admin/AdminSocialManager";
import DugoutModerationPanel from "@/components/admin/DugoutModerationPanel";
import OrgDocumentsManager from "@/components/admin/OrgDocumentsManager";
import type { ContentOrgId } from "@/lib/siteConfig";
import type { OrgDocumentsConfig } from "@/lib/orgDocuments";

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
  adminEmail,
  adminName,
  drive,
  driveApiEnabled,
  canManageSharing,
}: {
  targetOrg: ContentOrgId;
  initialTab: PublishingTab;
  isMaster: boolean;
  adminEmail: string;
  adminName: string | null;
  drive: OrgDocumentsConfig | null;
  driveApiEnabled: boolean;
  canManageSharing: boolean;
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
        {tab === "comms" && <AdminCommunicationsManager targetOrg={targetOrg} isMaster={isMaster} />}
        {tab === "news" && (
          <NewsAdminPanel
            adminEmail={adminEmail}
            adminName={adminName}
            targetOrg={targetOrg}
            isMasterMode={isMaster}
          />
        )}
        {tab === "social" && <AdminSocialManager />}
        {tab === "dugout" && <DugoutModerationPanel targetOrg={targetOrg} />}
        {tab === "drive" && (
          !drive ? (
            <div className="rounded-xl border border-amber-800/60 bg-amber-950/30 px-4 py-4 text-sm text-amber-100">
              <p className="font-semibold">Drive folder not configured</p>
              <p className="mt-2 text-amber-200/90">
                Set <code className="text-amber-50">AP_GOOGLE_DRIVE_FOLDER_URL</code> to your folder
                URL or ID. For API listing and sharing, also add{" "}
                <code className="text-amber-50">GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON</code> and share the
                folder with the service account email from that key.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <a
                  href={drive.folderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#2374E1] hover:underline"
                >
                  Open entire folder in Google Drive (optional)
                </a>
                {driveApiEnabled ? (
                  <span className="text-xs text-emerald-400/90">
                    Drive API enabled (service account).
                  </span>
                ) : (
                  <span className="text-xs text-zinc-500">
                    API listing/sharing disabled until service account env is set.
                  </span>
                )}
              </div>

              <OrgDocumentsManager
                folderId={drive.folderId}
                folderUrl={drive.folderUrl}
                driveApiEnabled={driveApiEnabled}
                canManageSharing={canManageSharing}
              />
            </div>
          )
        )}
      </div>
    </div>
  );
}
