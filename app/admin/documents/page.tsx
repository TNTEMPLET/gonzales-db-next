import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  canAccessAdminModule,
  hasAdminRoleAtLeast,
  toAdminRole,
} from "@/lib/auth/adminRoles";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import OrgDocumentsManager from "@/components/admin/OrgDocumentsManager";
import { isDriveServiceAccountConfigured } from "@/lib/google/driveServiceAccount";
import { getOrgDocumentsConfig } from "@/lib/orgDocuments";
import { getSiteConfig } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Organization documents | ${site.name}`,
    description:
      "AP Baseball shared Google Drive folder for bylaws, policies, and organizational files.",
  };
}

export default async function AdminDocumentsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);

  if (!adminUser) {
    redirect("/admin/login?next=/admin/documents");
  }

  const role = toAdminRole(adminUser.role, adminUser.isMaster);
  if (!canAccessAdminModule(role, "ORG_DOCUMENTS")) {
    redirect("/admin?denied=documents");
  }

  const canManageSharing = hasAdminRoleAtLeast(role, "MASTER_ADMIN");
  const drive = getOrgDocumentsConfig();
  const driveApiEnabled = isDriveServiceAccountConfigured();

  return (
    <main className="min-h-screen bg-zinc-950 text-white py-14 pb-24">
      <section className="max-w-6xl mx-auto px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="ORG DOCUMENTS"
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
            Organization documents
          </h1>
          <p className="text-zinc-400 max-w-3xl">
            Browse the shared AP Baseball Google Drive here. <strong>Click a file name</strong> to open
            it in a new tab on Google; you must use your workspace Google account (and have been granted
            access in Drive). Master admins can invite people by email below. For site images, still use
            News/Social uploads so assets stay on this site.
          </p>
        </div>

        {!drive ? (
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
              key={drive.folderId}
              folderId={drive.folderId}
              folderUrl={drive.folderUrl}
              driveApiEnabled={driveApiEnabled}
              canManageSharing={canManageSharing}
            />
          </div>
        )}
      </section>
    </main>
  );
}
